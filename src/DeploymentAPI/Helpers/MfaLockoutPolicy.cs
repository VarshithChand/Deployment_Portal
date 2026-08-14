using DeploymentAPI.DTOs;
using DeploymentAPI.Services;

namespace DeploymentAPI.Helpers;

// Single source of truth for MFA wrong-code lockout, shared by every
// place that checks a TOTP/recovery code against a login: AuthController.
// MfaVerify (the two-page PAT+MFA login flow), MfaController.
// VerifyEnrollment/Disable (self-service, already-connected session), and
// MfaGate.DenyUnlessVerifiedAsync (the reconnect-a-token path off
// SettingsController.SaveMyGitHub). Previously each of these duplicated
// its own copy of "5 attempts, 15-minute lockout" against in-memory
// SessionActivityService counters - centralized here (same reasoning as
// AdminGate/MfaPolicy/SsrfGuard already established for other shared
// security decisions) both to stop three copies from drifting apart, and
// to make the lockout durable (SettingsService-backed, survives a
// restart) instead of resetting for free on every redeploy.
//
// Escalates rather than staying flat: each time a login exhausts its
// current tier's attempt budget, the NEXT lockout gets both fewer
// attempts and a longer duration - a login that keeps failing across
// multiple lockout windows is increasingly unlikely to be the real
// owner just having a bad day, and increasingly likely to be a script.
// Caps at the last tier (further failures re-trigger it, not an ever-
// growing 5th tier). A single correct code (RecordSuccessAsync) resets
// all the way back to tier 0 - real proof forgives past failures
// entirely, same as the flat system this replaces already did.
public static class MfaLockoutPolicy
{
    private static readonly (int MaxAttempts, TimeSpan Duration)[] Tiers =
    {
        (5, TimeSpan.FromMinutes(2)),
        (3, TimeSpan.FromMinutes(10)),
        (2, TimeSpan.FromHours(1)),
        (1, TimeSpan.FromDays(1))
    };

    public record LockoutStatus(bool Locked, DateTime? LockedUntilUtc);

    public static async Task<LockoutStatus> CheckAsync(SettingsService settings, string login)
    {
        var state = await settings.GetMfaLockoutStateAsync(login);

        var locked = state.LockedUntilUtc.HasValue && state.LockedUntilUtc.Value > DateTime.UtcNow;

        return new LockoutStatus(locked, locked ? state.LockedUntilUtc : null);
    }

    // Called after a wrong code. Returns the lockout that just took
    // effect (null if this failure didn't cross the current tier's
    // threshold) - the caller uses this to decide what message/timestamp
    // to return to the client.
    public static async Task<DateTime?> RecordFailureAsync(SettingsService settings, NotificationService notifications, string login)
    {
        var state = await settings.GetMfaLockoutStateAsync(login);

        state.AttemptsInTier++;

        var tierIndex = Math.Clamp(state.Tier, 0, Tiers.Length - 1);
        var (maxAttempts, _) = Tiers[tierIndex];

        if (state.AttemptsInTier < maxAttempts)
        {
            await settings.SaveMfaLockoutStateAsync(login, state);
            return null;
        }

        // Threshold crossed - escalate to the next tier (capped) and lock.
        var nextTierIndex = Math.Min(tierIndex + 1, Tiers.Length - 1);
        var (_, duration) = Tiers[nextTierIndex];
        var lockedUntil = DateTime.UtcNow.Add(duration);

        state.Tier = nextTierIndex + 1;
        state.AttemptsInTier = 0;
        state.LockedUntilUtc = lockedUntil;

        await settings.SaveMfaLockoutStateAsync(login, state);

        var notificationEmail = await settings.GetMfaNotificationEmailAsync(login);

        if (!string.IsNullOrWhiteSpace(notificationEmail))
        {
            // Awaited (not fire-and-forget) so this can't outlive the
            // request's DI scope, but SendMfaLockoutEmailAsync catches its
            // own exceptions internally (same pattern as this file's
            // SafeSend) - a dropped notification email delays this
            // response by however long the SMTP attempt took, but never
            // fails the actual lockout that just took effect.
            await notifications.SendMfaLockoutEmailAsync(notificationEmail, login, state.Tier, lockedUntil);
        }

        return lockedUntil;
    }

    public static async Task RecordSuccessAsync(SettingsService settings, string login)
    {
        await settings.SaveMfaLockoutStateAsync(login, new MfaLockoutStateDto());
    }
}

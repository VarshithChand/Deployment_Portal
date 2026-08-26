using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Helpers;

// Per-login MFA enforcement for the PAT-connection flow (see
// SettingsController.SaveMyGitHub) - distinct from CredentialGate (the
// screen-lock PIN gate on managing an ALREADY-connected credential) and
// AdminGate (portal-wide admin authority). This is what actually stops a
// token from being saved at all when its owner has MFA enabled and no
// valid code came with the request - nothing is ever persisted until this
// passes, so there's no partial/pending state to defend elsewhere. Keyed
// by the token's own resolved GitHub login (see
// SettingsService.ResolveGitHubLoginAsync), not the caller's
// PortalIdentity session key - the same identity Round 14's cross-session
// credential migration and the admin Users table already resolve tokens
// against, so MFA follows the person, not the browser.
public static class MfaGate
{
    // Gates an action on the CALLER'S OWN account MFA state - e.g. saving
    // a GitHub PAT (SettingsController.SaveMyGitHub) or setting/clearing
    // the screen-lock PIN (SaveMyPin/ClearMyPin). A no-op (returns null,
    // action proceeds) whenever that account doesn't have MFA enabled at
    // all - same "rides on top of an existing, optional protection"
    // posture every MFA gate in this app already has. Used to resolve
    // identity live off whatever GitHub PAT happened to be connected
    // (either the token about to be saved, or the session's already-
    // connected one) instead of taking the account id directly - a
    // leftover from when a PAT was the login. A connected PAT is
    // unrelated to who's logged in now (see RequireAuth/AccountAuthService),
    // so that either could never be satisfied (no PAT connected) or
    // checked a completely different person's MFA enrollment than the one
    // the caller actually set up.
    public static async Task<IActionResult?> DenyUnlessCodeVerifiedAsync(
        ControllerBase controller, SettingsService settings, NotificationService notifications,
        string login, string? code, string? recoveryCode)
    {
        if (!await settings.IsMfaEnabledAsync(login))
            return null;

        var lockout = await MfaLockoutPolicy.CheckAsync(settings, login);

        if (lockout.Locked)
        {
            return controller.StatusCode(403, new
            {
                code = "MFA_LOCKED",
                message = "Too many wrong codes - try again later.",
                lockedUntilUtc = lockout.LockedUntilUtc
            });
        }

        var hasCode = !string.IsNullOrWhiteSpace(code);
        var hasRecoveryCode = !string.IsNullOrWhiteSpace(recoveryCode);

        if (!hasCode && !hasRecoveryCode)
        {
            return controller.StatusCode(403, new
            {
                code = "MFA_REQUIRED",
                message = "Enter your 6-digit authenticator code to continue."
            });
        }

        var valid = hasRecoveryCode
            ? await settings.VerifyMfaRecoveryCodeAsync(login, recoveryCode!)
            : await settings.VerifyMfaCodeAsync(login, code!);

        if (valid)
        {
            await MfaLockoutPolicy.RecordSuccessAsync(settings, login);
            return null;
        }

        var lockedUntil = await MfaLockoutPolicy.RecordFailureAsync(settings, notifications, login);

        if (lockedUntil.HasValue)
        {
            return controller.StatusCode(403, new
            {
                code = "MFA_LOCKED",
                message = "Too many wrong codes - try again later.",
                lockedUntilUtc = lockedUntil
            });
        }

        return controller.StatusCode(403, new
        {
            code = "INVALID_MFA_CODE",
            message = "Invalid or expired code."
        });
    }
}

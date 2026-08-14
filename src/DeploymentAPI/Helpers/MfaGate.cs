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
    public static async Task<IActionResult?> DenyUnlessVerifiedAsync(
        ControllerBase controller, SettingsService settings, NotificationService notifications,
        string token, string? mfaCode, string? recoveryCode)
    {
        var login = await settings.ResolveGitHubLoginAsync(token);

        // Couldn't resolve who this token belongs to (bad/expired token) -
        // not this gate's job to report that; SaveUserGitHubCredentialsAsync
        // proceeds with whatever was given either way, same as before this
        // feature existed - a genuinely bad token still fails elsewhere
        // (rejected at preview, or simply doesn't work once saved).
        if (string.IsNullOrWhiteSpace(login) || !await settings.IsMfaEnabledAsync(login))
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

        var hasCode = !string.IsNullOrWhiteSpace(mfaCode);
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
            : await settings.VerifyMfaCodeAsync(login, mfaCode!);

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

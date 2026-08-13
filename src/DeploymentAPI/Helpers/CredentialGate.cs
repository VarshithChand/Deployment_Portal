using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Helpers;

// Per-credential authorization, distinct from AdminGate (portal-wide admin
// authority) and from the Screen Lock PIN's own whole-portal lock
// (PeriodicSignOutMonitor/PinLockScreen). This gates one specific
// credential provider (GitHub, AWS, Azure, GCP, API Key, Docker, Sonar,
// GitHub OAuth, AI Assistant) behind the SAME screen-lock PIN, verified
// fresh via POST me/credentials/{provider}/unlock before that provider's
// save/clear actions will run - unlocking AWS does not unlock GitHub.
//
// Deliberately a no-op whenever the caller has no PIN configured at all:
// Screen Lock itself is optional and off by default, and this rides on
// top of it rather than introducing a second, separate "must configure
// this to use the app" requirement.
public static class CredentialGate
{
    public static async Task<IActionResult?> DenyUnlessUnlockedAsync(
        ControllerBase controller, SettingsService settings, SessionActivityService activity, string provider)
    {
        var key = PortalIdentity.GetOrCreateKey(controller.HttpContext);

        if (!await settings.HasPinAsync(key))
            return null;

        if (activity.IsCredentialUnlocked(key, provider))
            return null;

        return controller.StatusCode(403, new
        {
            message = "Enter your screen-lock PIN to manage this credential.",
            code = "CREDENTIAL_LOCKED",
            provider
        });
    }
}

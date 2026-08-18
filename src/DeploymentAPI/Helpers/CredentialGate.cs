using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Helpers;

// Per-credential authorization, distinct from AdminGate (portal-wide admin
// authority) and from the Screen Lock PIN's own whole-portal lock
// (PeriodicSignOutMonitor/PinLockScreen). This gates every credential
// provider (GitHub, AWS, Azure, GCP, API Key, Docker, Sonar, GitHub OAuth,
// AI Assistant) behind the SAME screen-lock PIN. One successful PIN entry
// via POST me/credentials/{provider}/unlock grants all of them at once
// (see SettingsController.UnlockMyCredential) - a per-provider prompt on
// every single tab switch was more friction than the security model
// needed, since it's the same PIN either way.
//
// Deliberately a no-op whenever the caller has no PIN configured at all:
// Screen Lock itself is optional and off by default, and this rides on
// top of it rather than introducing a second, separate "must configure
// this to use the app" requirement.
public static class CredentialGate
{
    // The full set of provider keys UnlockMyCredential grants together on
    // one successful PIN entry. Kept here (not duplicated at each call
    // site) so adding a future gated provider is a one-line change.
    public static readonly IReadOnlyList<string> AllProviders = new[]
    {
        "github", "aws", "azure", "gcp", "apikey", "docker", "github-oauth", "sonarqube", "sonarcloud", "ai",
        "render", "cloudflare", "netlify", "vercel", "dockerhub", "ghcr", "gitlab-registry", "jfrog",
        "harbor", "nexus", "azureDevOps"
    };

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

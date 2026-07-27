using DeploymentAPI.DTOs;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Helpers;

// Shared by every controller action that mutates real GitHub state or
// portal settings. Previously copy-pasted as a private DenyUnlessAdminAsync
// method into three controllers (Settings, Access, PullRequests) — and
// three other mutating actions (triggering a deployment, approving/
// rejecting a release, deleting an artifact) had no gate applied at all,
// since there was no shared, easy-to-reach-for mechanism prompting it.
//
// Rule: an empty admin allowlist means the portal hasn't been configured
// yet ("bootstrap mode") — anyone can act, since before any admin exists
// nobody could have logged in as one. Once the list is non-empty, only an
// authenticated user in the "Admin" role may act.
public static class AdminGate
{
    public static bool IsAdminOrBootstrap(ControllerBase controller, SettingsViewDto view) =>
        view.AdminGitHubUsernames.Count == 0
        || (controller.User.Identity?.IsAuthenticated == true && controller.User.IsInRole("Admin"));

    // CSRF guard: the actual authorization above relies on the portal_token
    // cookie, which is SameSite=None (required so the separately-hosted
    // frontend's cross-origin requests carry it at all) — meaning it's
    // attached to literally any cross-site request a browser sends,
    // including a plain <form> POST from an attacker's page, with no
    // JavaScript and no CORS preflight involved at all. Every legitimate
    // request from this app's own frontend always carries X-Session-Id
    // (see apiBase.js's interceptor — sent on every call regardless of
    // login state), which a bare HTML form can never set. Requiring its
    // presence blocks that attack outright without needing separate
    // CSRF-token infrastructure: a forged form has no way to add it, and a
    // forged fetch()/XHR that tried to would trigger a CORS preflight this
    // app's origin allowlist already rejects for any untrusted site.
    private static bool HasSessionHeader(ControllerBase controller) =>
        controller.Request.Headers.ContainsKey("X-Session-Id");

    public static async Task<IActionResult?> DenyUnlessAdminAsync(ControllerBase controller, SettingsService settings, string action)
    {
        if (!HasSessionHeader(controller))
            return controller.StatusCode(403, new { message = "Missing required request header." });

        var view = await settings.GetViewAsync();

        if (IsAdminOrBootstrap(controller, view))
            return null;

        return controller.StatusCode(403, new { message = $"Admin login required to {action}." });
    }
}

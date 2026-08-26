using System.Security.Claims;
using DeploymentAPI.DTOs;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

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
    public static bool IsAdminOrBootstrap(ControllerBase controller, SettingsViewDto view)
    {
        if (view.AdminGitHubUsernames.Count == 0 && view.AdminEmails.Count == 0)
            return true;

        if (controller.User.Identity?.IsAuthenticated != true || !controller.User.IsInRole("Admin"))
            return false;

        // The "Admin" role claim above is baked into this session's JWT at
        // sign-in (see AuthService) and doesn't notice a LATER allowlist
        // change on its own - a plain Remove or Suspend from Admin Access
        // wouldn't take effect until this token naturally expired. Cross-
        // checking the live allowlist/suspended-list here, using the
        // identifiers already embedded in the same token (Name for a GitHub
        // username, Email for every login method - no extra API call), is
        // what makes both take effect on this session's very next request
        // instead. Checked in parallel (either qualifies) so an existing
        // GitHub-OAuth admin's access is unaffected by the new email
        // allowlist existing at all.
        var claimLogin = controller.User.FindFirst(ClaimTypes.Name)?.Value;
        var claimEmail = controller.User.FindFirst(ClaimTypes.Email)?.Value;

        var onUsernameList = claimLogin != null
            && view.AdminGitHubUsernames.Any(u => string.Equals(u, claimLogin, StringComparison.OrdinalIgnoreCase));

        var onEmailList = claimEmail != null
            && view.AdminEmails.Any(e => string.Equals(e, claimEmail, StringComparison.OrdinalIgnoreCase));

        if (!onUsernameList && !onEmailList)
            return false;

        var suspendedByUsername = claimLogin != null
            && view.SuspendedAdminGitHubUsernames.Any(u => string.Equals(u, claimLogin, StringComparison.OrdinalIgnoreCase));

        var suspendedByEmail = claimEmail != null
            && view.SuspendedAdminEmails.Any(e => string.Equals(e, claimEmail, StringComparison.OrdinalIgnoreCase));

        return !suspendedByUsername && !suspendedByEmail;
    }

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

    // pageKey (optional): also passes a caller whose GitHub login has been
    // granted scoped access to just this one page (see SettingsService's
    // PageAdminGrants) — the lighter-weight alternative to putting someone
    // on the full AdminGitHubUsernames allowlist. Omitted entirely for
    // actions with no page-scoped equivalent (e.g. Settings itself), which
    // stay full-admin-only exactly as before.
    //
    // allowRepoWrite (optional, default false): also passes a caller whose
    // configured token has real GitHub "push" access on the connected repo
    // — the same permission level GitHub's own Actions API requires just to
    // dispatch a workflow_dispatch run. Unlike pageKey, this isn't a portal-
    // side allowlist at all; it's a live check against GitHub. Deliberately
    // opt-in per call site (currently only Deploy) rather than a blanket
    // change to every AdminGate-gated action, since most of those (Storage,
    // Environments, Docker, Services, Code Quality) have no equivalent
    // GitHub-side permission to defer to.
    public static async Task<IActionResult?> DenyUnlessAdminAsync(ControllerBase controller, SettingsService settings, string action, string? pageKey = null, bool allowRepoWrite = false)
    {
        if (!HasSessionHeader(controller))
            return controller.StatusCode(403, new { message = "Missing required request header." });

        var view = await settings.GetViewAsync();

        if (IsAdminOrBootstrap(controller, view))
            return null;

        // No PAT-based fallback below this point - a configured GitHub PAT
        // belonging to an admin's username used to grant Admin authority
        // here with no real login and no MFA, the same "PAT proves
        // identity" pattern removed from login itself. Admin authority now
        // only ever comes from a real logged-in session's JWT, checked
        // above by IsAdminOrBootstrap, or the page-scoped grant below.
        if (controller.User.Identity?.IsAuthenticated == true && pageKey != null)
        {
            var claimLogin = controller.User.FindFirst(ClaimTypes.Name)?.Value;
            var claimEmail = controller.User.FindFirst(ClaimTypes.Email)?.Value;

            if ((claimLogin != null && await settings.IsGrantedPageAdminAsync(pageKey, claimLogin))
                || (claimEmail != null && await settings.IsGrantedPageAdminAsync(pageKey, claimEmail)))
            {
                return null;
            }
        }

        if (allowRepoWrite && await HasRepoWriteAccessAsync(controller))
            return null;

        return controller.StatusCode(403, new { message = $"Admin login required to {action}. {BuildDenialDetail(controller, pageKey)}" });
    }

    private static async Task<bool> HasRepoWriteAccessAsync(ControllerBase controller)
    {
        var github = controller.HttpContext.RequestServices.GetRequiredService<GitHubApiService>();
        var owner = await github.GetTokenOwnerAsync();
        return owner.Configured && owner.CanDeploy;
    }

    private static string BuildDenialDetail(ControllerBase controller, string? pageKey)
    {
        if (controller.User.Identity?.IsAuthenticated != true)
            return "Sign in first - admin access couldn't be confirmed for a session that isn't logged in.";

        var identity = controller.User.FindFirst(ClaimTypes.Email)?.Value
            ?? controller.User.FindFirst(ClaimTypes.Name)?.Value
            ?? "your account";

        return $"'{identity}' isn't in the admin allowlist" +
               (pageKey != null ? " and hasn't been granted access to this page." : ".");
    }

    // Database Management is deliberately restricted to one specific
    // identity, not "anyone on the general AdminGitHubUsernames/AdminEmails
    // allowlist" — that's an explicit, standalone requirement (a second,
    // narrower gate on top of AdminGate's usual admin check), not a
    // stand-in for it. Every other admin-only feature in this portal stays
    // on the regular allowlist. Kept as a legacy fallback (see
    // IsSuperAdminAsync below) alongside the configurable SuperAdminEmail
    // setting - a pre-existing GitHub-OAuth super-admin's access doesn't
    // change just because SuperAdminEmail now exists.
    private const string SuperAdminLogin = "VarshithChand";

    // Resolves the caller's identity from their JWT alone - a PAT no longer
    // proves anything about WHO someone is anywhere in this app (see
    // DenyUnlessAdminAsync's own comment), only real login claims do.
    // Prefers Name (a GitHub username, when that's how this session logged
    // in) since that's what most existing callers (activity-log "actor"
    // labels) expect to display; falls back to Email for an email/password
    // or Google account, which has no GitHub username at all.
    public static Task<string?> ResolveCallerLoginAsync(ControllerBase controller)
    {
        if (controller.User.Identity?.IsAuthenticated != true)
            return Task.FromResult<string?>(null);

        var claimLogin = controller.User.FindFirst(ClaimTypes.Name)?.Value;

        if (!string.IsNullOrWhiteSpace(claimLogin))
            return Task.FromResult<string?>(claimLogin);

        var claimEmail = controller.User.FindFirst(ClaimTypes.Email)?.Value;

        return Task.FromResult(string.IsNullOrWhiteSpace(claimEmail) ? null : claimEmail);
    }

    public static async Task<bool> IsSuperAdminAsync(ControllerBase controller)
    {
        if (controller.User.Identity?.IsAuthenticated != true)
            return false;

        var claimLogin = controller.User.FindFirst(ClaimTypes.Name)?.Value;

        if (claimLogin != null && string.Equals(claimLogin, SuperAdminLogin, StringComparison.OrdinalIgnoreCase))
            return true;

        var claimEmail = controller.User.FindFirst(ClaimTypes.Email)?.Value;

        if (claimEmail == null)
            return false;

        // Resolved via DI (matching HasRepoWriteAccessAsync's own pattern
        // above) rather than adding a SettingsService parameter to this
        // method - DenyUnlessSuperAdminAsync below has ~50 existing call
        // sites across the app, all with the current 2-arg signature.
        var settings = controller.HttpContext.RequestServices.GetRequiredService<SettingsService>();
        var view = await settings.GetViewAsync();

        return !string.IsNullOrWhiteSpace(view.SuperAdminEmail)
            && string.Equals(claimEmail, view.SuperAdminEmail, StringComparison.OrdinalIgnoreCase);
    }

    // Same CSRF guard as DenyUnlessAdminAsync (see HasSessionHeader) plus the
    // single-identity check above — used for Database Management, the
    // Admin Allowlist, and MFA recovery-code issuance instead of the
    // regular DenyUnlessAdminAsync, since being on the general admin
    // allowlist is explicitly NOT enough for any of these.
    public static async Task<IActionResult?> DenyUnlessSuperAdminAsync(ControllerBase controller, string action)
    {
        if (!HasSessionHeader(controller))
            return controller.StatusCode(403, new { message = "Missing required request header." });

        if (await IsSuperAdminAsync(controller))
            return null;

        return controller.StatusCode(403, new
        {
            message = $"This action is restricted to a single administrator account. You are not authorized to {action}."
        });
    }
}

using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Helpers;

// The generalization of PortalIdentity.GetOrCreateKey for everything that
// used to be "whichever anonymous browser is asking" and is now "whichever
// logged-in ACCOUNT is asking" - AWS/Azure/GCP/GitHub credentials, Sidebar
// Access, the screen-lock PIN, etc. all move from being isolated per
// browser to following the account across devices, now that a device is
// no longer the only identity a visitor has (see PortalIdentity.cs's own
// header comment for why per-browser isolation existed in the first place
// - that reasoning doesn't apply once every visitor is a real, logged-in
// account instead of an anonymous session).
//
// Same (T?, IActionResult?) shape MfaController.RequireLogin already
// established in this codebase for "resolve identity or hand back a canned
// denial" - callers do:
//   var (userId, denied) = RequireAuth.RequireUserId(this);
//   if (denied != null) return denied;
// Deliberately per-controller-action rather than one blanket "must be
// authenticated" middleware in Program.cs - several routes (GET
// /api/settings, GET /api/bootstrap) are intentionally anonymous (the
// frontend calls them BEFORE login to decide what to show), and a global
// path-prefix gate risks silently breaking one of those; a caller that
// forgets to add this check simply keeps working exactly as before
// (PortalIdentity.GetOrCreateKey never denied anyone either), rather than
// an allowlist gap accidentally locking out a pre-login page.
public static class RequireAuth
{
    public static (string? UserId, IActionResult? Denied) RequireUserId(ControllerBase controller)
    {
        if (controller.User.Identity?.IsAuthenticated != true)
            return (null, controller.StatusCode(401, new { message = "Sign in first." }));

        var userId = controller.User.FindFirst(ClaimTypes.Name)?.Value;

        if (string.IsNullOrWhiteSpace(userId))
            return (null, controller.StatusCode(401, new { message = "Unable to verify your identity right now." }));

        return (userId, null);
    }

    // Never a real user id - no login method (a GitHub username, "google:"
    // +sub, or "usr_"+hex) can ever produce this exact string, so every
    // Get*Async(key) lookup keyed by user id naturally resolves to its own
    // "nothing saved" default for it, with no special-casing needed in
    // SettingsService itself.
    private const string AnonymousSentinel = "anonymous";

    // For the one genuinely pre-login endpoint (BootstrapController.Get) -
    // it has to keep working for a not-yet-authenticated visitor (that's
    // literally how the frontend learns it needs to show the login page),
    // so this never denies. Returns AnonymousSentinel instead of null so
    // every existing Get*Async(key) call in that method keeps working
    // completely unchanged, just resolving to "not configured" for a
    // visitor with no account yet.
    public static string TryResolveUserIdOrAnonymous(ControllerBase controller)
    {
        if (controller.User.Identity?.IsAuthenticated != true)
            return AnonymousSentinel;

        var userId = controller.User.FindFirst(ClaimTypes.Name)?.Value;

        return string.IsNullOrWhiteSpace(userId) ? AnonymousSentinel : userId;
    }

    // For services (not controllers) reached only from an already
    // auth-gated action (e.g. AiToolsService, called from AiController's
    // own chat endpoint) - no denial to hand back, since there's no
    // IActionResult context here. Throws rather than silently resolving to
    // a sentinel if that assumption is ever wrong, since a service acting
    // on "nobody" for real per-user data (unlike Bootstrap's deliberately
    // optional case above) would be a real bug worth surfacing loudly.
    public static string ResolveUserId(HttpContext context)
    {
        var userId = context.User.Identity?.IsAuthenticated == true
            ? context.User.FindFirst(ClaimTypes.Name)?.Value
            : null;

        if (string.IsNullOrWhiteSpace(userId))
            throw new InvalidOperationException("ResolveUserId called for a request with no authenticated user.");

        return userId;
    }
}

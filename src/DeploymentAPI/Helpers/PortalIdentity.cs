using Microsoft.AspNetCore.Http;

namespace DeploymentAPI.Helpers;

// Resolves which stored GitHub credentials this request should use — always
// the current browser/device's own per-session id, NEVER the GitHub OAuth
// login. Those are deliberately kept separate: a GitHub login (see
// AdminGate/AuthorizationSettings) decides what someone is *allowed to do*
// (Admin vs Viewer), but which repo + token a given browser points at is
// purely local to that browser. Keying credentials off the login instead
// would mean logging into the same GitHub account from a second laptop
// shares (and can silently overwrite) the first laptop's saved repo/token —
// exactly the cross-device leak this is here to prevent. Every browser gets
// its own isolated slot regardless of who, if anyone, is logged in.
//
// The session id itself is preferably read from the X-Session-Id header
// (see deployment-ui's apiBase.js: a random id generated once and kept in
// localStorage). A cookie this API sets is a third-party cookie from the
// browser's point of view whenever the frontend is hosted on a different
// origin (e.g. Cloudflare Pages/Workers calling a separately hosted API) —
// and modern browsers (Safari, increasingly Chrome) block those by default
// regardless of SameSite/Secure. The cookie fallback below only still
// exists for same-origin setups (the Docker/nginx build, local dev via
// Vite's proxy) or any client that isn't sending the header.
//
// Memoized on HttpContext.Items so every caller within one request (the
// GitHubAuthService-loading middleware, then whichever controller action
// runs) gets the exact same key and the cookie is only ever set once.
public static class PortalIdentity
{
    private const string SessionHeaderName = "X-Session-Id";
    private const string SessionCookieName = "portal_session";
    private const string ItemsKey = "PortalIdentityKey";

    public static string GetOrCreateKey(HttpContext context)
    {
        if (context.Items.TryGetValue(ItemsKey, out var cached) && cached is string cachedKey)
            return cachedKey;

        string key;

        if (context.Request.Headers.TryGetValue(SessionHeaderName, out var headerValue)
            && !string.IsNullOrWhiteSpace(headerValue))
        {
            key = $"sess:{headerValue}";
        }
        else if (context.Request.Cookies.TryGetValue(SessionCookieName, out var sessionId)
            && !string.IsNullOrWhiteSpace(sessionId))
        {
            key = $"sess:{sessionId}";
        }
        else
        {
            var newSessionId = Guid.NewGuid().ToString("N");

            context.Response.Cookies.Append(SessionCookieName, newSessionId, new CookieOptions
            {
                HttpOnly = true,
                SameSite = context.Request.IsHttps ? SameSiteMode.None : SameSiteMode.Lax,
                Secure = context.Request.IsHttps,
                Expires = DateTimeOffset.UtcNow.AddYears(1)
            });

            key = $"sess:{newSessionId}";
        }

        context.Items[ItemsKey] = key;
        return key;
    }

    // Lets a GitHub/Google OAuth Login() action seed the portal_session
    // cookie to match this SAME browser's already-established X-Session-Id
    // (see apiBase.js's getSessionId) BEFORE the OAuth round trip begins.
    // Without this, the round trip (a plain <a href> top-level navigation,
    // which can't carry a custom header) falls back to GetOrCreateKey's
    // cookie branch and mints a brand-new random session id - a DIFFERENT
    // key than the one the frontend sends as X-Session-Id on its very next
    // XHR call once it's back. That mismatch meant SetPendingAccountLogin
    // (written under the fresh cookie-derived key during the callback) was
    // invisible to the frontend's login-mfa/pending poll (looked up under
    // the header-derived key instead) - an MFA-enrolled account's OAuth
    // login would silently drop the pending state and land back on the
    // plain login page instead of the MFA code screen. Seeding the cookie
    // here makes both lookups resolve to the identical key throughout.
    //
    // Trusting a client-supplied value here is safe: portal_session is
    // just an opaque per-browser bucket key, not a credential - MFA still
    // requires the real TOTP code to complete regardless of which bucket
    // the pending state sits in, and the client already fully controls
    // this same value via X-Session-Id/localStorage anyway.
    public static void SeedSessionCookie(HttpContext context, string sessionId)
    {
        context.Response.Cookies.Append(SessionCookieName, sessionId, new CookieOptions
        {
            HttpOnly = true,
            SameSite = context.Request.IsHttps ? SameSiteMode.None : SameSiteMode.Lax,
            Secure = context.Request.IsHttps,
            Expires = DateTimeOffset.UtcNow.AddYears(1)
        });

        context.Items[ItemsKey] = $"sess:{sessionId}";
    }
}

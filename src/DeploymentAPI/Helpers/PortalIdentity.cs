using Microsoft.AspNetCore.Http;

namespace DeploymentAPI.Helpers;

// Resolves which stored GitHub credentials this request should use. Prefers
// a real GitHub OAuth login when one exists (so it survives across devices,
// and ties into the Admin/Viewer allowlist); otherwise falls back to a
// per-browser session id. That fallback is what lets the portal work — each
// visitor getting their own isolated repo + token — without anyone needing
// to set up or complete a GitHub OAuth App first.
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
// The two identity spaces are prefixed ("gh:" vs "sess:") so a session id
// can never collide with a real GitHub username.
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

        var login = context.User?.Identity?.IsAuthenticated == true
            ? context.User.Identity?.Name
            : null;

        string key;

        if (!string.IsNullOrWhiteSpace(login))
        {
            key = $"gh:{login}";
        }
        else if (context.Request.Headers.TryGetValue(SessionHeaderName, out var headerValue)
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
}

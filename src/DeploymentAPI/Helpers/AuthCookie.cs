namespace DeploymentAPI.Helpers;

// Shared by every controller that sets/clears the portal_token cookie
// (AuthController's GitHub OAuth callback, AccountAuthController's
// email/password + MFA-verify actions, GoogleAuthController in Phase B) -
// pulled out of AuthController, which owned this as a private instance
// method before a second controller needed the exact same options.
public static class AuthCookie
{
    // Local dev serves frontend and backend from the same origin (via the
    // Vite proxy), so Lax is enough there. A real deployment typically has
    // the frontend on its own domain (e.g. a static host) talking to the
    // backend on another (e.g. Fly.io), which makes every API call
    // cross-site — SameSite=None is required for the browser to attach the
    // cookie at all in that case, and browsers only honor None when Secure
    // is also set, which is why this is keyed off the request being HTTPS
    // rather than a fixed value.
    public static CookieOptions CrossSiteOptions(HttpRequest request, DateTimeOffset expires) => new()
    {
        HttpOnly = true,
        SameSite = request.IsHttps ? SameSiteMode.None : SameSiteMode.Lax,
        Secure = request.IsHttps,
        Expires = expires
    };
}

using DeploymentAPI.Configuration;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace DeploymentAPI.Controllers;

// Mirrors AuthController's GitHub OAuth Login/Callback pair exactly - see
// that file for the CSRF-state-cookie reasoning, unchanged here.
//
// One-time setup in Google Cloud Console (console.cloud.google.com):
// 1. APIs & Services > OAuth consent screen - configure it (External user
//    type is fine for most deployments), add "email"/"profile"/"openid"
//    scopes.
// 2. APIs & Services > Credentials > Create Credentials > OAuth client ID >
//    Web application.
// 3. Authorized redirect URIs: add this exact backend's callback URL (see
//    GoogleOAuthSettings.CallbackUrl - the deployed backend's own origin +
//    "/api/auth/google/callback", NOT the frontend's URL).
// 4. Copy the generated Client ID/Client Secret into this backend's
//    GoogleOAuth configuration (see appsettings.json's placeholder).
[ApiController]
[Route("api/auth/google")]
public class GoogleAuthController : ControllerBase
{
    private readonly GoogleAuthService _google;
    private readonly AccountAuthService _accountAuth;
    private readonly AuthService _auth;
    private readonly SettingsService _settings;
    private readonly SessionActivityService _activity;
    private readonly IEmailService _email;
    private readonly IOptionsMonitor<GoogleOAuthSettings> _oauthOptions;
    private readonly ActivityLogService _log;

    public GoogleAuthController(
        GoogleAuthService google,
        AccountAuthService accountAuth,
        AuthService auth,
        SettingsService settings,
        SessionActivityService activity,
        IEmailService email,
        IOptionsMonitor<GoogleOAuthSettings> oauthOptions,
        ActivityLogService log)
    {
        _google = google;
        _accountAuth = accountAuth;
        _auth = auth;
        _settings = settings;
        _activity = activity;
        _email = email;
        _oauthOptions = oauthOptions;
        _log = log;
    }

    // sid is this browser's existing X-Session-Id (see apiBase.js), passed
    // as a query param because this is a plain <a href> top-level
    // navigation, which can't attach a custom header - see
    // PortalIdentity.SeedSessionCookie for why this matters (keeps the
    // MFA-pending handoff working after the callback redirects back).
    [HttpGet("login")]
    public IActionResult Login([FromQuery] string? sid)
    {
        if (!string.IsNullOrWhiteSpace(sid))
            PortalIdentity.SeedSessionCookie(HttpContext, sid);

        var state = Guid.NewGuid().ToString("N");

        Response.Cookies.Append("google_oauth_state", state, AuthCookie.CrossSiteOptions(Request, DateTimeOffset.UtcNow.AddMinutes(10)));

        return Redirect(_google.BuildAuthorizeUrl(state));
    }

    [HttpGet("callback")]
    public async Task<IActionResult> Callback(string code, string? state)
    {
        var frontendUrl = _oauthOptions.CurrentValue.FrontendUrl;
        var expectedState = Request.Cookies["google_oauth_state"];

        if (string.IsNullOrEmpty(state) || state != expectedState)
            return Redirect($"{frontendUrl}?authError=invalid_state&provider=google");

        try
        {
            var user = await _google.ExchangeCodeForUserAsync(code);
            var roleResult = _accountAuth.ResolveRoleSync(user);

            if (!roleResult.Success || roleResult.Role == null)
                return Redirect($"{frontendUrl}?authError=not_allowed&provider=google");

            // Email verified by Google, identity resolved, allowlist check
            // passed. OAuthLoginFinisher decides whether that's enough to
            // issue a real session yet, or whether this account's MFA has
            // to be satisfied first - the same gate every other login
            // method goes through (see AccountAuthController/
            // AuthController.Callback).
            return await OAuthLoginFinisher.FinishAsync(this, _settings, _activity, _auth, _email, user.Id, roleResult.Role, user.Email, frontendUrl);
        }
        catch (UnauthorizedAccessException)
        {
            return Redirect($"{frontendUrl}?authError=not_allowed&provider=google");
        }
        catch (Exception ex)
        {
            // Logged (message only, never any token/secret it might wrap)
            // so a login_failed report can actually be diagnosed server-
            // side afterward instead of only ever seeing the generic
            // frontend toast - this exchange has several distinct failure
            // modes (bad client secret, redirect_uri mismatch at Google's
            // token endpoint, network error reaching Google) that all
            // otherwise look identical from the browser.
            _log.LogError("GoogleAuth", $"Google OAuth callback failed: {ex.Message}");
            return Redirect($"{frontendUrl}?authError=login_failed&provider=google");
        }
    }
}

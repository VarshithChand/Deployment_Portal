using System.Security.Claims;
using DeploymentAPI.Configuration;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace DeploymentAPI.Controllers;

// GitHub OAuth login + the portal-wide session-epoch/logout/me actions.
// The old two-page PAT+MFA login flow (PatLogin/MfaPending/MfaVerify/
// MfaCancel) lived here until real accounts replaced it - see
// AccountAuthController for the email/password equivalent (signup/login/
// login-mfa/*, the same MFA-pending shape this file's Callback below now
// also goes through via OAuthLoginFinisher) and GoogleAuthController for
// the third login method. GitHub PAT CONNECTION (a separate concept from
// login - see PortalIdentity.cs) is unaffected, still reachable from
// Settings > Credentials > GitHub.
[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;
    private readonly IOptionsMonitor<GitHubOAuthSettings> _oauthOptions;
    private readonly SettingsService _settings;
    private readonly SessionActivityService _activity;
    private readonly IEmailService _email;

    public AuthController(
        AuthService auth,
        IOptionsMonitor<GitHubOAuthSettings> oauthOptions,
        SettingsService settings,
        SessionActivityService activity,
        IEmailService email)
    {
        _auth = auth;
        _oauthOptions = oauthOptions;
        _settings = settings;
        _activity = activity;
        _email = email;
    }

    // See Helpers/AuthCookie.cs - shared with AccountAuthController now
    // that a second controller sets this same cookie.
    private CookieOptions CrossSiteCookieOptions(DateTimeOffset expires) => AuthCookie.CrossSiteOptions(Request, expires);

    [HttpGet("github/login")]
    public IActionResult Login()
    {
        var state = Guid.NewGuid().ToString("N");

        Response.Cookies.Append("oauth_state", state, CrossSiteCookieOptions(DateTimeOffset.UtcNow.AddMinutes(10)));

        return Redirect(_auth.BuildAuthorizeUrl(state));
    }

    [HttpGet("github/callback")]
    public async Task<IActionResult> Callback(string code, string? state)
    {
        var frontendUrl = _oauthOptions.CurrentValue.FrontendUrl;
        var expectedState = Request.Cookies["oauth_state"];

        if (string.IsNullOrEmpty(state) || state != expectedState)
            return Redirect($"{frontendUrl}?authError=invalid_state");

        try
        {
            var (login, role, email) = await _auth.ExchangeCodeForUserAsync(code);

            // State validated, code exchanged, identity resolved, allowlist
            // check passed - "successful login" as far as GitHub is
            // concerned. OAuthLoginFinisher decides whether that's enough
            // to issue a real session yet, or whether this account's MFA
            // has to be satisfied first (same gate password login already
            // goes through - see AccountAuthController).
            return await OAuthLoginFinisher.FinishAsync(this, _settings, _activity, _auth, _email, login, role, email, frontendUrl);
        }
        catch (UnauthorizedAccessException)
        {
            return Redirect($"{frontendUrl}?authError=not_allowed");
        }
        catch (Exception)
        {
            return Redirect($"{frontendUrl}?authError=login_failed");
        }
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete("portal_token", new CookieOptions
        {
            HttpOnly = true,
            SameSite = Request.IsHttps ? SameSiteMode.None : SameSiteMode.Lax,
            Secure = Request.IsHttps
        });

        return Ok();
    }

    // Anonymous and unconditional (same as /me being callable while
    // logged out) - every visitor, logged in or just browsing Public
    // view, needs to be able to poll this to know an admin just
    // force-signed out this specific session (see AdminUsersController's
    // logout action) - scoped to whichever session key this caller's own
    // X-Session-Id resolves to, never anyone else's. Running a pipeline no
    // longer force-signs out every active session portal-wide the way it
    // used to (see PR history) - that made sense when most visitors were
    // anonymous PAT sessions with nothing real to lose by a reload, but
    // now that login is a real account, it just meant the very person who
    // triggered the deploy got bounced back to the login page too.
    [HttpGet("session-epoch")]
    public IActionResult SessionEpoch()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var mine = _activity.GetForceLogoutAfter(key);

        return Ok(new
        {
            mySessionForceLogoutEpoch = mine?.ToString("o"),
            mySessionForceLogoutReason = mine != null ? _activity.GetForceLogoutReason(key) : null
        });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var displayLogin = await RequireAuth.ResolveDisplayLoginAsync(
            User.Identity!.Name!, User.FindFirst(ClaimTypes.Email)?.Value, _settings);

        return Ok(new
        {
            login = displayLogin,
            role = User.FindFirst(ClaimTypes.Role)?.Value
        });
    }
}

using System.Security.Claims;
using DeploymentAPI.Configuration;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace DeploymentAPI.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;
    private readonly IOptionsMonitor<GitHubOAuthSettings> _oauthOptions;
    private readonly SettingsService _settings;

    public AuthController(AuthService auth, IOptionsMonitor<GitHubOAuthSettings> oauthOptions, SettingsService settings)
    {
        _auth = auth;
        _oauthOptions = oauthOptions;
        _settings = settings;
    }

    // Local dev serves frontend and backend from the same origin (via the
    // Vite proxy), so Lax is enough there. A real deployment typically has
    // the frontend on its own domain (e.g. a static host) talking to the
    // backend on another (e.g. Fly.io), which makes every API call
    // cross-site — SameSite=None is required for the browser to attach the
    // cookie at all in that case, and browsers only honor None when Secure
    // is also set, which is why this is keyed off Request.IsHttps rather
    // than being a fixed value.
    private CookieOptions CrossSiteCookieOptions(DateTimeOffset expires) => new()
    {
        HttpOnly = true,
        SameSite = Request.IsHttps ? SameSiteMode.None : SameSiteMode.Lax,
        Secure = Request.IsHttps,
        Expires = expires
    };

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
            var (login, role) = await _auth.ExchangeCodeForUserAsync(code);
            var jwt = _auth.IssueJwt(login, role);

            Response.Cookies.Append("portal_token", jwt, CrossSiteCookieOptions(DateTimeOffset.UtcNow.AddHours(8)));

            return Redirect(frontendUrl);
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
    // view, needs to be able to poll this to know a pipeline just ran.
    [HttpGet("session-epoch")]
    public async Task<IActionResult> SessionEpoch()
    {
        var epoch = await _settings.GetForceLogoutEpochAsync();
        return Ok(new { forceLogoutEpoch = epoch });
    }

    [Authorize]
    [HttpGet("me")]
    public IActionResult Me()
    {
        return Ok(new
        {
            login = User.Identity?.Name,
            role = User.FindFirst(ClaimTypes.Role)?.Value
        });
    }
}

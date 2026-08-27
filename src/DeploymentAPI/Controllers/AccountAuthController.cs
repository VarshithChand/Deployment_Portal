using DeploymentAPI.Configuration;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace DeploymentAPI.Controllers;

// Email/password signup + login, replacing the old PAT-login flow's role
// as "how you actually log in" (a GitHub PAT is still connectable
// afterward, in Settings, for real GitHub API calls - see
// UserGitHubCredentials, untouched by this). Same two-step MFA shape as
// the old pat-login/mfa/verify pair (AuthController), generalized: primary
// factor (password) proves identity and resolves a role, then - only if
// MFA is enabled for that account - a pending state is held server-side
// until a valid code arrives, and ONLY THEN is the real portal_token JWT
// issued. A rejected (non-allowlisted) account never reaches the pending
// state at all; there's nothing to hold a session open for.
[ApiController]
[Route("api/auth")]
public class AccountAuthController : ControllerBase
{
    private static readonly TimeSpan PendingLoginTtl = TimeSpan.FromMinutes(10);

    private readonly AccountAuthService _accountAuth;
    private readonly AuthService _auth;
    private readonly SettingsService _settings;
    private readonly SessionActivityService _activity;
    private readonly IEmailService _email;
    private readonly NotificationService _notifications;
    private readonly IOptionsMonitor<GitHubOAuthSettings> _githubOAuthOptions;

    public AccountAuthController(
        AccountAuthService accountAuth,
        AuthService auth,
        SettingsService settings,
        SessionActivityService activity,
        IEmailService email,
        NotificationService notifications,
        IOptionsMonitor<GitHubOAuthSettings> githubOAuthOptions)
    {
        _accountAuth = accountAuth;
        _auth = auth;
        _settings = settings;
        _activity = activity;
        _email = email;
        _notifications = notifications;
        _githubOAuthOptions = githubOAuthOptions;
    }

    [HttpPost("signup")]
    public async Task<IActionResult> SignUp(SignupRequestDto request)
    {
        var result = await _accountAuth.SignUpAsync(request.Email ?? string.Empty, request.Password ?? string.Empty, request.DisplayName);
        return await FinishPrimaryFactorAsync(result);
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(PasswordLoginRequestDto request)
    {
        var result = await _accountAuth.LoginWithPasswordAsync(request.EmailOrUsername ?? string.Empty, request.Password ?? string.Empty);
        return await FinishPrimaryFactorAsync(result);
    }

    // Shared tail of both actions above - once identity+role is resolved
    // (or rejected), the rest of the flow is identical regardless of which
    // one got there.
    private async Task<IActionResult> FinishPrimaryFactorAsync(AccountAuthResult result)
    {
        if (result.EmailVerificationRequired && result.User != null)
        {
            await SendWelcomeVerificationEmailAsync(result.User);
            return Ok(new { success = true, emailVerificationRequired = true });
        }

        if (!result.Success || result.User == null || result.Role == null)
            return Ok(new { success = false, message = result.Error });

        var user = result.User;
        var key = PortalIdentity.GetOrCreateKey(HttpContext);

        if (await _settings.IsMfaEnabledAsync(user.Id))
        {
            _activity.SetPendingAccountLogin(key, user.Id, result.Role, user.Email, PendingLoginTtl);
            return Ok(new { success = true, authenticated = false, mfaRequired = true });
        }

        var jwt = await IssueSessionAsync(user.Id, result.Role, user.Email);
        return Ok(new { success = true, authenticated = true, mfaRequired = false, token = jwt });
    }

    // Mirrors AuthController's mfa/pending - lets the MFA page know, on
    // mount and after a refresh, whether it should show the code form or
    // bounce back to login. A separate pending dictionary from the PAT
    // flow's own (see SessionActivityService), so the two can't cross-
    // contaminate while PAT-login still exists in parallel this phase.
    [HttpGet("login-mfa/pending")]
    public IActionResult MfaPending()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        return Ok(new { pending = _activity.GetPendingAccountLogin(key) != null });
    }

    [HttpPost("login-mfa/verify")]
    public async Task<IActionResult> VerifyMfa(MfaCodeRequestDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var pending = _activity.GetPendingAccountLogin(key);

        if (pending == null)
        {
            return Ok(new
            {
                success = false,
                code = "MFA_SESSION_EXPIRED",
                message = "Your verification session has expired. Please sign in again."
            });
        }

        var (userId, role, email) = pending.Value;

        var lockout = await MfaLockoutPolicy.CheckAsync(_settings, userId);

        if (lockout.Locked)
        {
            return Ok(new
            {
                success = false,
                code = "MFA_LOCKED",
                message = "Too many wrong codes - try again later.",
                lockedUntilUtc = lockout.LockedUntilUtc
            });
        }

        var valid = !string.IsNullOrWhiteSpace(request.RecoveryCode)
            ? await _settings.VerifyMfaRecoveryCodeAsync(userId, request.RecoveryCode)
            : await _settings.VerifyMfaCodeAsync(userId, request.Code ?? string.Empty);

        if (!valid)
        {
            var lockedUntil = await MfaLockoutPolicy.RecordFailureAsync(_settings, _notifications, userId);

            if (lockedUntil.HasValue)
            {
                return Ok(new
                {
                    success = false,
                    code = "MFA_LOCKED",
                    message = "Too many wrong codes - try again later.",
                    lockedUntilUtc = lockedUntil
                });
            }

            return Ok(new { success = false, code = "INVALID_MFA_CODE", message = "Invalid verification code. Please try again." });
        }

        await MfaLockoutPolicy.RecordSuccessAsync(_settings, userId);
        _activity.ClearPendingAccountLogin(key);

        var jwt = await IssueSessionAsync(userId, role, email);

        return Ok(new { success = true, authenticated = true, token = jwt });
    }

    [HttpPost("login-mfa/cancel")]
    public IActionResult CancelMfa()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        _activity.ClearPendingAccountLogin(key);
        return Ok();
    }

    // Where the link in the welcome email actually lands. Consumes the
    // token (SettingsService.VerifyEmailAsync clears it so it can't be
    // replayed), then - since this account has now genuinely proven both
    // its password AND its email in one flow - goes straight into the same
    // role-resolve/MFA-or-session tail every other login path shares,
    // rather than making them log in a second time right after verifying.
    // The frontend tells the difference between "just verified" and a
    // normal login via the mfaSetupPending query param below, which is what
    // triggers the mandatory MFA enrollment screen for a brand new account
    // instead of the ordinary MFA challenge screen.
    [HttpGet("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromQuery] string token)
    {
        var frontendUrl = _githubOAuthOptions.CurrentValue.FrontendUrl.TrimEnd('/');

        if (string.IsNullOrWhiteSpace(token))
            return Redirect($"{frontendUrl}/?verifyError=1");

        var user = await _settings.VerifyEmailAsync(token);

        if (user == null)
            return Redirect($"{frontendUrl}/?verifyError=1");

        var result = _accountAuth.ResolveRoleSync(user);

        if (!result.Success || result.Role == null)
            return Redirect($"{frontendUrl}/?verifyError=1");

        await IssueSessionAsync(user.Id, result.Role, user.Email);

        // mfaSetupPending signals the frontend to show the mandatory MFA
        // enrollment screen next - mirrors the existing post-signup
        // needsMfaSetup flow (LoginSignupPage.jsx), just reached via the
        // email link instead of an inline reload.
        return Redirect($"{frontendUrl}/?emailVerified=1&mfaSetupPending=1");
    }

    // The one place this flow actually issues a session - sets the same
    // portal_token cookie AuthController's GitHub OAuth callback does (see
    // AuthCookie), then fires the login-notification email in its own
    // isolated try/catch, same reasoning as AuthController.Callback: a
    // Resend failure must never be able to turn an already-successful
    // login into an error response.
    //
    // ALSO returns the raw JWT so the caller can put it in the JSON body -
    // this login path is a plain fetch() from a separately-hosted frontend
    // (Cloudflare Workers) to this API (Render), not a top-level OAuth
    // redirect through this domain, so the portal_token cookie set here is
    // a genuine third-party cookie from the browser's point of view.
    // Safari (and increasingly Chrome) silently refuse to persist that
    // regardless of SameSite=None/Secure/correct CORS - see apiBase.js's
    // identical reasoning for why X-Session-Id is a header, not a cookie.
    // The cookie is still set too (harmless, and still what local dev and
    // any same-site deployment rely on) but the frontend now also stores
    // this token and sends it back as an Authorization header, which has
    // no such restriction.
    // Isolated try/catch, same reasoning as IssueSessionAsync's own login-
    // notification send below: a Resend outage must never turn an
    // otherwise-successful signup into an error response - the account
    // still exists and the user can always ask for the link again later.
    private async Task SendWelcomeVerificationEmailAsync(DeploymentAPI.Models.PortalUserAccount user)
    {
        try
        {
            var verifyUrl = $"{Request.Scheme}://{Request.Host}/api/auth/verify-email?token={user.EmailVerificationToken}";
            await _email.SendWelcomeVerificationEmailAsync(user.Email, user.Username ?? user.Email, verifyUrl);
        }
        catch (Exception)
        {
        }
    }

    private async Task<string> IssueSessionAsync(string userId, string role, string? email)
    {
        var jwt = _auth.IssueJwt(userId, role, email);
        Response.Cookies.Append("portal_token", jwt, AuthCookie.CrossSiteOptions(Request, DateTimeOffset.UtcNow.AddHours(8)));

        await _settings.UpdateUserLastLoginAsync(userId);

        if (!string.IsNullOrWhiteSpace(email))
        {
            try
            {
                await _email.SendLoginNotificationAsync(email, userId, DateTime.UtcNow);
            }
            catch (Exception)
            {
                // See AuthController.Callback's identical comment - a bug in
                // IEmailService's "never throws" contract must never surface
                // as a broken login here either.
            }
        }

        return jwt;
    }
}

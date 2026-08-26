using System.Security.Claims;
using DeploymentAPI.Configuration;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace DeploymentAPI.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private static readonly TimeSpan PendingPatTtl = TimeSpan.FromMinutes(10);

    private readonly AuthService _auth;
    private readonly IOptionsMonitor<GitHubOAuthSettings> _oauthOptions;
    private readonly SettingsService _settings;
    private readonly SessionActivityService _activity;
    private readonly GitHubApiService _github;
    private readonly NotificationService _notifications;
    private readonly IEmailService _email;

    public AuthController(
        AuthService auth,
        IOptionsMonitor<GitHubOAuthSettings> oauthOptions,
        SettingsService settings,
        SessionActivityService activity,
        GitHubApiService github,
        NotificationService notifications,
        IEmailService email)
    {
        _auth = auth;
        _oauthOptions = oauthOptions;
        _settings = settings;
        _activity = activity;
        _github = github;
        _notifications = notifications;
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

    // Two-page PAT login flow, step 1 - validates the PAT against GitHub
    // (the same preview call me/github/preview already makes, so this
    // isn't a new way of checking a token) and resolves whether its
    // owner has MFA enabled. When it doesn't, this completes the
    // connection immediately (same SaveUserGitHubCredentialsAsync call
    // the direct-connect path always used); when it does, NOTHING is
    // saved yet - only a short-lived, encrypted, in-memory pending entry
    // (see SessionActivityService.SetPendingPatSession), so a session
    // that never completes MFA leaves no real credential behind at all.
    [HttpPost("pat-login")]
    public async Task<IActionResult> PatLogin(PatLoginRequestDto request)
    {
        var token = request.PersonalAccessToken?.Trim();

        if (string.IsNullOrWhiteSpace(token))
            return Ok(new { success = false, message = "A Personal Access Token is required." });

        var preview = await _github.PreviewTokenAsync(token);

        if (!preview.Success || string.IsNullOrWhiteSpace(preview.Username))
            return Ok(new { success = false, message = "Unable to authenticate with this GitHub token." });

        var key = PortalIdentity.GetOrCreateKey(HttpContext);

        if (!await _settings.IsMfaEnabledAsync(preview.Username))
        {
            // No MFA on this account - a bare token is the only proof
            // this request has, so it's checked and blocked here (before
            // even attempting the save) if the account is genuinely
            // active elsewhere. SaveUserGitHubCredentialsAsync re-checks
            // this itself right before actually writing anything, since
            // that's the real, race-safe enforcement point - this is
            // purely a UX shortcut for the common case.
            if (await _settings.IsLoginActiveOnAnotherSessionAsync(preview.Username, key))
            {
                return Ok(new
                {
                    success = false,
                    message = "This GitHub account is already signed in on another device. Sign out there first, then try again."
                });
            }

            var result = await _settings.SaveUserGitHubCredentialsAsync(key, new GitHubSettingsUpdateDto
            {
                Owner = string.Empty,
                Repository = string.Empty,
                PersonalAccessToken = token
            });

            if (!result.Success)
                return Ok(new { success = false, message = result.ConflictMessage });

            return Ok(new { success = true, authenticated = true, mfaRequired = false });
        }

        // MFA is enabled - deliberately NOT blocked here even if another
        // device is currently active. A bare token isn't proof of
        // anything on its own; the real check happens at MfaVerify, once
        // a valid code actually proves who's connecting. Only then does
        // an active device elsewhere get taken over (see
        // SaveUserGitHubCredentialsAsync's allowTakeoverIfActive).

        _activity.SetPendingPatSession(key, _settings.ProtectValue(token), preview.Username, PendingPatTtl);

        return Ok(new { success = true, authenticated = false, mfaRequired = true });
    }

    // Lets the MFA page know, on mount and after a refresh, whether it
    // should show the code form or bounce back to login - a real,
    // server-side check (not the frontend trusting its own memory of
    // what just happened), matching "never grant authentication merely
    // because the frontend remembers the PAT was accepted."
    [HttpGet("mfa/pending")]
    public IActionResult MfaPending()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);

        return Ok(new { pending = _activity.GetPendingPatSession(key) != null });
    }

    // Step 2 - the only place this flow actually creates a real,
    // persisted credential. A wrong code never touches storage at all;
    // the pending entry (and therefore the chance to retry) survives
    // until its own TTL or an explicit cancel, independent of how many
    // wrong guesses happened in between (those are rate-limited
    // separately, same 5-attempt/15-minute pattern as MfaGate).
    [HttpPost("mfa/verify")]
    public async Task<IActionResult> MfaVerify(MfaCodeRequestDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var pending = _activity.GetPendingPatSession(key);

        if (pending == null)
        {
            return Ok(new
            {
                success = false,
                code = "MFA_SESSION_EXPIRED",
                message = "Your verification session has expired. Please sign in again."
            });
        }

        var (encryptedToken, login) = pending.Value;

        var lockout = await MfaLockoutPolicy.CheckAsync(_settings, login);

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
            ? await _settings.VerifyMfaRecoveryCodeAsync(login, request.RecoveryCode)
            : await _settings.VerifyMfaCodeAsync(login, request.Code ?? string.Empty);

        if (!valid)
        {
            var lockedUntil = await MfaLockoutPolicy.RecordFailureAsync(_settings, _notifications, login);

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

            return Ok(new
            {
                success = false,
                code = "INVALID_MFA_CODE",
                message = "Invalid verification code. Please try again."
            });
        }

        await MfaLockoutPolicy.RecordSuccessAsync(_settings, login);
        _activity.ClearPendingPatSession(key);

        // allowTakeoverIfActive: true - reaching this line required a valid
        // TOTP/recovery code, real proof this connection is the legitimate
        // account owner rather than just someone holding a copy of the PAT
        // string. With that proof in hand, an active device on another
        // browser loses and gets notified, exactly like PIN/Round 20's
        // reconnect-eviction already does for an abandoned one - it's no
        // longer blocked the way an unverified (no-MFA) reconnect still is.
        var result = await _settings.SaveUserGitHubCredentialsAsync(key, new GitHubSettingsUpdateDto
        {
            Owner = string.Empty,
            Repository = string.Empty,
            PersonalAccessToken = _settings.UnprotectValue(encryptedToken)
        }, allowTakeoverIfActive: true);

        if (!result.Success)
            return Ok(new { success = false, code = "ALREADY_CONNECTED_ELSEWHERE", message = result.ConflictMessage });

        return Ok(new { success = true, authenticated = true });
    }

    // "Back to Login" - explicitly invalidates the pending state rather
    // than leaving it to expire on its own, per the spec's own
    // requirement that this button never leaves a pending session active.
    [HttpPost("mfa/cancel")]
    public IActionResult MfaCancel()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        _activity.ClearPendingPatSession(key);

        return Ok();
    }

    // Anonymous and unconditional (same as /me being callable while
    // logged out) - every visitor, logged in or just browsing Public
    // view, needs to be able to poll this to know a pipeline just ran, or
    // that an admin just force-signed out this specific session (see
    // AdminUsersController's logout action) - the second value is scoped
    // to whichever session key this caller's own X-Session-Id resolves to,
    // never anyone else's.
    [HttpGet("session-epoch")]
    public async Task<IActionResult> SessionEpoch()
    {
        var epoch = await _settings.GetForceLogoutEpochAsync();

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var mine = _activity.GetForceLogoutAfter(key);

        return Ok(new
        {
            forceLogoutEpoch = epoch,
            mySessionForceLogoutEpoch = mine?.ToString("o"),
            mySessionForceLogoutReason = mine != null ? _activity.GetForceLogoutReason(key) : null
        });
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

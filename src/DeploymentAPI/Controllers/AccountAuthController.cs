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

        // A failure that still resolved to a real account (wrong password,
        // or a correct password on a not-yet-verified account) - see
        // AccountAuthService.LoginWithPasswordAsync's own comment on why
        // recording this doesn't weaken the enumeration-safe response
        // below, which is identical either way. An identifier that never
        // matched any account has no User to record against - there's
        // nothing to show that account's owner because there is no
        // account.
        if (!result.Success && result.User != null)
        {
            var userAgent = Request.Headers.UserAgent.ToString();
            var ipAddress = Request.HttpContext.Connection.RemoteIpAddress?.ToString();
            await _settings.RecordLoginHistoryAsync(result.User.Id, ipAddress, userAgent, success: false);
        }

        return await FinishPrimaryFactorAsync(result);
    }

    // Always returns the same shape whether or not the email actually
    // matched an account with a password to reset (or is on cooldown/
    // rate-limited) - see AccountAuthService.RequestPasswordResetAsync's
    // own comment for why. A Resend failure is swallowed the same way
    // SendWelcomeVerificationEmailAsync's caller does below - this
    // response was already going to say "if it exists..." regardless, so
    // there's nothing for a caught exception here to change (a genuinely
    // missing email would look identical to the legitimate owner as a
    // failed send anyway - they just don't get a code either way).
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequestDto request)
    {
        var result = await _accountAuth.RequestPasswordResetAsync(request.Email ?? string.Empty);

        if (result.User != null && result.Otp != null)
        {
            try
            {
                await _email.SendPasswordResetOtpEmailAsync(result.User.Email, result.User.Username ?? result.User.Email, result.Otp);
            }
            catch (Exception)
            {
            }
        }

        return Ok(new { success = true, message = "If an account exists for this email, a verification code has been sent." });
    }

    // The forgot-password flow's second step - proves control of the
    // emailed code, then hands back a short-lived token authorizing the
    // ACTUAL password change (see AccountAuthService.VerifyPasswordResetOtpAsync).
    // Unlike ForgotPassword above, this DOES distinguish success from
    // failure in its response - by this point the caller already
    // (supposedly) received an email, so there's no fresh enumeration
    // surface being opened by saying "wrong code" plainly.
    [HttpPost("forgot-password/verify")]
    public async Task<IActionResult> VerifyForgotPasswordOtp(VerifyResetOtpRequestDto request)
    {
        var result = await _accountAuth.VerifyPasswordResetOtpAsync(request.Email ?? string.Empty, request.Otp ?? string.Empty);

        if (!result.Success)
            return Ok(new { success = false, message = result.Error });

        return Ok(new { success = true, resetToken = result.ResetToken });
    }

    // Deliberately routes through the exact same FinishPrimaryFactorAsync
    // tail signup/login use, rather than issuing a session directly here -
    // see AccountAuthService.ResetPasswordAsync's own comment for why an
    // MFA-enabled account still has to pass MFA after this, not skip it.
    // The confirmation email fires BEFORE that MFA branch, not after -
    // the password is already changed by this point regardless of
    // whether a session is issued immediately or held for an MFA code
    // first, so there's nothing to gate it on.
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequestDto request)
    {
        var result = await _accountAuth.ResetPasswordAsync(request.Token ?? string.Empty, request.NewPassword ?? string.Empty);

        if (result.Success && result.User != null)
        {
            try
            {
                await _email.SendPasswordResetConfirmationAsync(result.User.Email, result.User.Username ?? result.User.Email);
            }
            catch (Exception)
            {
            }
        }

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

    // Alternate MFA verification path alongside the authenticator-app code
    // and recovery code - useful when someone doesn't have their
    // authenticator device handy. Enrollment/TOTP itself is completely
    // untouched by this; it's just one more way to clear the SAME pending
    // challenge VerifyMfa below already gates. Security-critical (spec:
    // "For MFA... Failure -> Return email delivery error") - unlike the
    // welcome/login-notification/reset-confirmation sends elsewhere in
    // this controller, a Resend failure here becomes a real error
    // response instead of a generically-successful one, since silently
    // saying "code sent" when it wasn't would strand the user with no way
    // to finish signing in.
    [HttpPost("login-mfa/send-otp")]
    public async Task<IActionResult> SendMfaOtp()
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

        var (userId, _, email) = pending.Value;

        if (string.IsNullOrWhiteSpace(email))
            return Ok(new { success = false, message = "No email address is on file for this account." });

        var otpResult = await _settings.IssueOtpAsync(userId, OtpPurpose.Mfa);

        if (otpResult.Outcome == SettingsService.OtpRequestOutcome.Cooldown)
        {
            return Ok(new
            {
                success = false,
                code = "OTP_COOLDOWN",
                message = $"Please wait {otpResult.CooldownSecondsRemaining}s before requesting another code.",
                cooldownSeconds = otpResult.CooldownSecondsRemaining
            });
        }

        if (otpResult.Outcome == SettingsService.OtpRequestOutcome.RateLimited)
        {
            return Ok(new { success = false, code = "OTP_RATE_LIMITED", message = "Too many code requests. Try again later." });
        }

        try
        {
            var displayLogin = await RequireAuth.ResolveDisplayLoginAsync(userId, email, _settings);
            var sendResult = await _email.SendMfaOtpEmailAsync(email, displayLogin, otpResult.Code!);

            if (!sendResult.Success)
                return Ok(new { success = false, message = "Couldn't send the verification email. Try again in a moment." });
        }
        catch (Exception)
        {
            return Ok(new { success = false, message = "Couldn't send the verification email. Try again in a moment." });
        }

        return Ok(new { success = true, message = "A verification code has been sent to your email address." });
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
            : request.IsEmailOtp
                ? await _settings.VerifyOtpAsync(userId, OtpPurpose.Mfa, request.Code ?? string.Empty) == SettingsService.OtpVerifyOutcome.Success
                : await _settings.VerifyMfaCodeAsync(userId, request.Code ?? string.Empty);

        if (!valid)
        {
            // The password step already passed by the time anyone reaches
            // an MFA challenge, so userId is always a real, known account
            // here - no enumeration concern the way Login's own failure
            // recording has to account for (see that action's comment).
            await _settings.RecordLoginHistoryAsync(
                userId, Request.HttpContext.Connection.RemoteIpAddress?.ToString(),
                Request.Headers.UserAgent.ToString(), success: false);

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

    // Backs Settings' own "Set Password" section - lets the frontend know
    // whether the currently logged-in account already has one (a Google/
    // GitHub-only account never does - see PortalUserAccount.HasPassword),
    // so it can show either the set-password form or a plain "already set"
    // state instead of guessing from Provider alone (a Google account that
    // already added a password via SetPassword below is still Provider
    // "google", just with HasPassword now true too).
    [HttpGet("account")]
    public async Task<IActionResult> GetAccount()
    {
        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var user = await _settings.GetUserByIdAsync(userId!);

        if (user == null)
            return StatusCode(401, new { message = "Unable to verify your identity right now." });

        return Ok(new
        {
            email = user.Email,
            provider = user.Provider,
            hasPassword = user.HasPassword,
            displayName = user.DisplayName,
            username = user.Username,
            phoneNumber = user.PhoneNumber,
            avatarUrl = BuildAvatarDataUri(user.AvatarBase64),
            lastLoginAtUtc = user.LastLoginAtUtc
        });
    }

    // Settings > Account's Profile section "Edit Profile" save - each field
    // left null in the request keeps its current value (see
    // SettingsService.UpdateUserProfileAsync). Email is deliberately not
    // editable here at all - see AccountView.jsx's own comment on why.
    [HttpPut("account")]
    public async Task<IActionResult> UpdateProfile(UpdateProfileRequestDto request)
    {
        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        await _settings.UpdateUserProfileAsync(userId!, request.DisplayName, request.Username, request.PhoneNumber);

        return Ok(new { success = true });
    }

    // 512KB is a generous ceiling for a client-resized (<=256px) avatar
    // already encoded as base64 - defensive only, AccountView.jsx's own
    // canvas resize step keeps real uploads far under this.
    private const int MaxAvatarBase64Length = 512 * 1024;

    [HttpPost("account/avatar")]
    public async Task<IActionResult> UploadAvatar(AvatarUploadRequestDto request)
    {
        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        if (string.IsNullOrWhiteSpace(request.Base64))
            return Ok(new { success = false, message = "No image data received." });

        if (request.Base64.Length > MaxAvatarBase64Length)
            return Ok(new { success = false, message = "Image is too large." });

        try
        {
            Convert.FromBase64String(request.Base64);
        }
        catch (FormatException)
        {
            return Ok(new { success = false, message = "Invalid image data." });
        }

        await _settings.SetUserAvatarAsync(userId!, request.Base64);

        return Ok(new { success = true });
    }

    [HttpDelete("account/avatar")]
    public async Task<IActionResult> RemoveAvatar()
    {
        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        await _settings.SetUserAvatarAsync(userId!, null);

        return Ok(new { success = true });
    }

    // Settings > Account's Change Password (an already-has-a-password
    // account) - see AccountAuthService.ChangePasswordAsync for why this
    // re-verifies CurrentPassword rather than trusting the session alone
    // the way SetPassword above does.
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequestDto request)
    {
        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var result = await _accountAuth.ChangePasswordAsync(userId!, request.CurrentPassword ?? string.Empty, request.NewPassword ?? string.Empty);

        if (!result.Success)
            return Ok(new { success = false, message = result.Error });

        var user = await _settings.GetUserByIdAsync(userId!);

        if (user != null)
        {
            try
            {
                await _email.SendPasswordResetConfirmationAsync(user.Email, user.Username ?? user.Email);
            }
            catch (Exception)
            {
            }
        }

        return Ok(new { success = true });
    }

    // Settings > Account's Active Sessions list - the current request's own
    // jti (read off its own validated token) is flagged so the frontend can
    // label that row "This device" instead of listing it as just another
    // anonymous session.
    [HttpGet("sessions")]
    public async Task<IActionResult> GetSessions()
    {
        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var currentJti = User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Jti)?.Value;
        var sessions = await _settings.GetUserSessionsAsync(userId!);

        return Ok(new
        {
            sessions = sessions.Select(s => new
            {
                jti = s.Jti,
                userAgent = s.UserAgent,
                ipAddress = s.IpAddress,
                createdAtUtc = s.CreatedAtUtc,
                lastSeenAtUtc = s.LastSeenAtUtc,
                isCurrent = s.Jti == currentJti
            })
        });
    }

    // "Sign out this device" - see SettingsService.RevokeSessionAsync and
    // Program.cs's OnTokenValidated event, which is what actually makes
    // this take effect on that device's very next request rather than just
    // removing a row from a list nothing else checks.
    [HttpPost("sessions/{jti}/revoke")]
    public async Task<IActionResult> RevokeSession(string jti)
    {
        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        await _settings.RevokeSessionAsync(userId!, jti);

        return Ok(new { success = true });
    }

    [HttpGet("login-history")]
    public async Task<IActionResult> GetLoginHistory()
    {
        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var history = await _settings.GetLoginHistoryAsync(userId!);

        return Ok(new
        {
            history = history.Select(h => new
            {
                timestampUtc = h.TimestampUtc,
                ipAddress = h.IpAddress,
                userAgent = h.UserAgent,
                success = h.Success
            })
        });
    }

    // Settings > Account's Danger Zone "Delete Account" - re-proves identity
    // first (current password for an account that has one, a typed
    // confirmation phrase otherwise - see DeleteAccountRequestDto's own
    // comment), same reasoning as ChangePassword above: an active session
    // alone isn't proof enough for a change this destructive. Reuses
    // SettingsService.DeletePatUserAsync - the exact same full delete
    // (account + MFA + linked credentials + sidebar access + block flag)
    // the admin Users tab already performs, since PortalUserAccount rows
    // live in that same Users section regardless of who deletes them.
    [HttpDelete("account")]
    public async Task<IActionResult> DeleteAccount(DeleteAccountRequestDto request)
    {
        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var user = await _settings.GetUserByIdAsync(userId!);

        if (user == null)
            return StatusCode(401, new { message = "Unable to verify your identity right now." });

        if (user.HasPassword)
        {
            if (!await _settings.VerifyUserPasswordAsync(userId!, request.CurrentPassword ?? string.Empty))
                return Ok(new { success = false, message = "Current password is incorrect." });
        }
        else if (!string.Equals(request.ConfirmPhrase, "DELETE", StringComparison.Ordinal))
        {
            return Ok(new { success = false, message = "Type DELETE to confirm." });
        }

        await _settings.DeletePatUserAsync(userId!);

        Response.Cookies.Delete("portal_token");

        return Ok(new { success = true });
    }

    private static string? BuildAvatarDataUri(string? avatarBase64) =>
        string.IsNullOrWhiteSpace(avatarBase64) ? null : $"data:image/png;base64,{avatarBase64}";

    // Lets an already-authenticated Google/GitHub-only account add password
    // login for the first time (see AccountAuthService.SetPasswordAsync and
    // PortalUserAccount.HasPassword's own comment on why plain Forgot
    // Password can't do this - there's nothing yet to reset). Deliberately
    // requires an active session rather than any kind of token - the
    // session itself (already having passed MFA if it's enabled) IS the
    // proof this endpoint needs, unlike ResetPassword's OTP-authorized one.
    [HttpPost("set-password")]
    public async Task<IActionResult> SetPassword(SetPasswordRequestDto request)
    {
        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var result = await _accountAuth.SetPasswordAsync(userId!, request.NewPassword ?? string.Empty);

        if (!result.Success)
            return Ok(new { success = false, message = result.Error });

        var user = await _settings.GetUserByIdAsync(userId!);

        if (user != null)
        {
            try
            {
                await _email.SendPasswordResetConfirmationAsync(user.Email, user.Username ?? user.Email);
            }
            catch (Exception)
            {
            }
        }

        return Ok(new { success = true });
    }

    // Where the link in the welcome email actually lands. Consumes the
    // token (SettingsService.VerifyEmailAsync clears it so it can't be
    // replayed), then - since this account has now genuinely proven both
    // its password AND its email in one flow - goes straight into a real
    // session, same as any other successful login, rather than making them
    // log in a second time right after verifying. Mandatory MFA enrollment
    // isn't handled here as a redirect signal - it's enforced server-side
    // on every request going forward via MfaPolicy/MfaEnforcementGate (see
    // PortalUserAccount.MustSetUpMfa, set true at signup), so it applies
    // consistently even if this tab is closed and reopened before finishing
    // enrollment instead of only working for this one redirect.
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

        var jwt = await IssueSessionAsync(user.Id, result.Role, user.Email);

        // emailVerified just triggers a one-time toast (see AuthContext) -
        // MfaEnforcementGate takes it from here once bootstrap reports
        // MustSetUpMfa, no further signal needed in the URL. The token
        // param is the same third-party-cookie workaround
        // OAuthLoginFinisher.FinishAsync uses - this is also a top-level
        // redirect handing a session to a separately-hosted frontend, the
        // exact situation the portal_token cookie alone can't be trusted
        // to survive (see that method's own comment). AuthContext picks
        // this up on mount and strips it right after.
        return Redirect($"{frontendUrl}/?emailVerified=1&token={Uri.EscapeDataString(jwt)}");
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
        var (jwt, jti) = _auth.IssueJwt(userId, role, email);
        Response.Cookies.Append("portal_token", jwt, AuthCookie.CrossSiteOptions(Request, DateTimeOffset.UtcNow.AddHours(8)));

        await _settings.UpdateUserLastLoginAsync(userId);
        await SessionRecorder.RecordSuccessfulLoginAsync(_settings, Request, userId, jti);

        if (!string.IsNullOrWhiteSpace(email))
        {
            try
            {
                var displayLogin = await RequireAuth.ResolveDisplayLoginAsync(userId, email, _settings);
                await _email.SendLoginNotificationAsync(email, displayLogin, DateTime.UtcNow);
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

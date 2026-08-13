using DeploymentAPI.DTOs;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Self-service MFA enrollment/management for the CURRENTLY connected
// session's own GitHub identity (see
// GitHubAuthService.GetAuthenticatedLoginAsync - cached, unlike the raw
// per-token resolution MfaGate uses for a not-yet-saved token). A session
// has to already be successfully connected once (unprotected, the very
// first time - same as any real service's own MFA setup) before it can
// turn MFA on for itself. Login-time enforcement (does THIS login's MFA
// have to be satisfied before a NEW token gets saved) lives in MfaGate,
// called from SettingsController.SaveMyGitHub - a completely separate
// concern from this controller's own already-authenticated management
// actions.
[ApiController]
[Route("api/mfa")]
public class MfaController : ControllerBase
{
    private const int MaxAttempts = 5;
    private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

    private readonly SettingsService _settings;
    private readonly GitHubAuthService _githubAuth;
    private readonly SessionActivityService _activity;

    public MfaController(SettingsService settings, GitHubAuthService githubAuth, SessionActivityService activity)
    {
        _settings = settings;
        _githubAuth = githubAuth;
        _activity = activity;
    }

    private async Task<(string? Login, IActionResult? Denied)> RequireLoginAsync()
    {
        if (!_githubAuth.HasToken)
            return (null, StatusCode(403, new { message = "Connect a GitHub token first." }));

        var login = await _githubAuth.GetAuthenticatedLoginAsync();

        if (string.IsNullOrWhiteSpace(login))
            return (null, StatusCode(403, new { message = "Unable to verify your GitHub identity right now." }));

        return (login, null);
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var (login, denied) = await RequireLoginAsync();
        if (denied != null) return denied;

        return Ok(new { enabled = await _settings.IsMfaEnabledAsync(login!) });
    }

    // Step 1 of enrollment - generates a new secret (Enabled stays false
    // until enroll/verify below succeeds) and returns everything needed
    // to show a QR code (rendered client-side from otpauthUri) plus the
    // manual-entry secret as a "can't scan" fallback. Refuses to
    // overwrite an already-ENABLED secret outright - Disable first is the
    // deliberate, explicit path to re-enroll, not a silent overwrite.
    [HttpPost("enroll")]
    public async Task<IActionResult> Enroll()
    {
        var (login, denied) = await RequireLoginAsync();
        if (denied != null) return denied;

        if (await _settings.IsMfaEnabledAsync(login!))
            return BadRequest(new { message = "MFA is already enabled - disable it first to re-enroll." });

        var (secret, otpauthUri) = await _settings.EnrollMfaAsync(login!);

        return Ok(new
        {
            secret,
            otpauthUri,
            issuer = "Deployment Portal",
            accountLabel = login
        });
    }

    // Step 2 - the first real code from the authenticator app. Same
    // rate-limit/lockout treatment as MfaGate's login-time check, keyed
    // the same way (by login, not session), so a guessing script hitting
    // this endpoint directly lands in the exact same cool-down as one
    // hitting the login gate.
    [HttpPost("enroll/verify")]
    public async Task<IActionResult> VerifyEnrollment(MfaCodeRequestDto request)
    {
        var (login, denied) = await RequireLoginAsync();
        if (denied != null) return denied;

        if (_activity.IsMfaLockedOut(login!))
            return StatusCode(403, new { success = false, code = "MFA_LOCKED", message = "Too many wrong codes - try again in a few minutes." });

        var recoveryCodes = await _settings.VerifyMfaEnrollmentAsync(login!, request.Code ?? string.Empty);

        if (recoveryCodes == null)
        {
            var attempts = _activity.RecordFailedMfaAttempt(login!);

            if (attempts >= MaxAttempts)
                _activity.LockOutMfa(login!, LockoutDuration);

            return StatusCode(403, new { success = false, code = "INVALID_MFA_CODE", message = "Invalid verification code." });
        }

        _activity.ClearFailedMfaAttempts(login!);

        return Ok(new { success = true, mfaEnabled = true, recoveryCodes });
    }

    // Requires a currently-valid code (TOTP or a recovery code) before
    // turning MFA off - same "re-prove it before disabling a security
    // feature" requirement as everything else self-service in this app.
    [HttpPost("disable")]
    public async Task<IActionResult> Disable(MfaCodeRequestDto request)
    {
        var (login, denied) = await RequireLoginAsync();
        if (denied != null) return denied;

        if (!await _settings.IsMfaEnabledAsync(login!))
            return Ok(new { success = true });

        if (_activity.IsMfaLockedOut(login!))
            return StatusCode(403, new { success = false, code = "MFA_LOCKED", message = "Too many wrong codes - try again in a few minutes." });

        var valid = !string.IsNullOrWhiteSpace(request.RecoveryCode)
            ? await _settings.VerifyMfaRecoveryCodeAsync(login!, request.RecoveryCode)
            : await _settings.VerifyMfaCodeAsync(login!, request.Code ?? string.Empty);

        if (!valid)
        {
            var attempts = _activity.RecordFailedMfaAttempt(login!);

            if (attempts >= MaxAttempts)
                _activity.LockOutMfa(login!, LockoutDuration);

            return StatusCode(403, new { success = false, code = "INVALID_MFA_CODE", message = "Invalid verification code." });
        }

        _activity.ClearFailedMfaAttempts(login!);
        await _settings.DisableMfaAsync(login!);

        return Ok(new { success = true });
    }
}

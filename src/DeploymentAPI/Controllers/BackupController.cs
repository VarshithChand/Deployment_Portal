using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Settings -> Admin Access. Exports/imports this portal's ENTIRE own
// persisted state (portal_settings + the Data Protection key ring that
// decrypts every credential inside it) as one JSON file - built for
// migrating off a Render free-tier Postgres instance before its 30-day
// expiration deletes it, onto a brand new database. Restricted to the
// single super-admin identity (see AdminGate.DenyUnlessSuperAdminAsync),
// same posture as Database/SecurityTesting/AdminUsers - this file, if it
// leaked, is exactly as sensitive as having every credential in this
// portal in plaintext (the key ring it carries is what makes the
// encrypted settings readable at all), not just "an encrypted blob" -
// see SettingsService.ExportBackupAsync's own comment.
[ApiController]
[Route("api/admin/backup")]
public class BackupController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly IEmailService _email;
    private readonly ActivityLogService _log;

    public BackupController(SettingsService settings, IEmailService email, ActivityLogService log)
    {
        _settings = settings;
        _email = email;
        _log = log;
    }

    // Resolves the caller's own account (userId + email) - used for both
    // the export-OTP flow and the pre-wipe safety email, so both always go
    // to the actual person taking the action, not a separately-configured
    // notification address.
    private async Task<(string UserId, string Email)?> ResolveCallerAccountAsync()
    {
        var (userId, _) = RequireAuth.RequireUserId(this);

        if (userId == null)
            return null;

        var account = await _settings.GetUserByIdAsync(userId);

        return account == null || string.IsNullOrWhiteSpace(account.Email)
            ? null
            : (userId, account.Email);
    }

    // Step 1 of Export - see OtpPurpose.BackupExport's own comment for why
    // this file specifically needs a fresh "prove it's you right now" code
    // rather than just the standing super-admin session.
    [HttpPost("export/otp")]
    public async Task<IActionResult> SendExportOtp()
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "export a full portal backup");
        if (denied != null) return denied;

        var caller = await ResolveCallerAccountAsync();

        if (caller == null)
            return Ok(new { success = false, message = "Unable to verify your identity right now." });

        var otpResult = await _settings.IssueOtpAsync(caller.Value.UserId, OtpPurpose.BackupExport);

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
            return Ok(new { success = false, code = "OTP_RATE_LIMITED", message = "Too many code requests. Try again later." });

        var sendResult = await _email.SendBackupExportOtpEmailAsync(caller.Value.Email, caller.Value.UserId, otpResult.Code!);

        if (!sendResult.Success)
            return Ok(new { success = false, message = "Couldn't send the verification email. Try again in a moment." });

        return Ok(new { success = true, message = "A verification code has been sent to your email address." });
    }

    [HttpPost("export")]
    public async Task<IActionResult> Export(ExportBackupRequestDto request)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "export a full portal backup");
        if (denied != null) return denied;

        var caller = await ResolveCallerAccountAsync();

        if (caller == null)
            return Ok(new { success = false, message = "Unable to verify your identity right now." });

        var outcome = await _settings.VerifyOtpAsync(caller.Value.UserId, OtpPurpose.BackupExport, request.Otp ?? string.Empty);

        if (outcome != SettingsService.OtpVerifyOutcome.Success)
        {
            return Ok(new
            {
                success = false,
                message = outcome switch
                {
                    SettingsService.OtpVerifyOutcome.Expired => "This code has expired. Request a new one.",
                    SettingsService.OtpVerifyOutcome.TooManyAttempts => "Too many incorrect attempts. Request a new code.",
                    _ => "Invalid or expired verification code."
                }
            });
        }

        try
        {
            var backup = await _settings.ExportBackupAsync();

            _log.LogInfo("Backup", $"{caller.Value.UserId} exported a full portal backup ({backup.DataProtectionKeyXmls.Count} key ring entries)");

            return Ok(new { success = true, backup });
        }
        catch (InvalidOperationException ex)
        {
            return Ok(new { success = false, message = ex.Message });
        }
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import(PortalBackupDto request)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "import a full portal backup");
        if (denied != null) return denied;

        try
        {
            await _settings.ImportBackupAsync(request);

            var actor = await AdminGate.ResolveCallerLoginAsync(this) ?? "unknown";
            _log.LogInfo("Backup", $"{actor} imported a full portal backup - restart/redeploy required for the restored encryption keys to take effect");

            return Ok(new { success = true });
        }
        catch (Exception ex) when (ex is InvalidOperationException or ArgumentException)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    // The one required phrase, checked server-side (not just the
    // frontend's own typed-confirmation dialog) - this is the single most
    // destructive action in the portal.
    private const string WipeConfirmPhrase = "DELETE ALL DATA";

    [HttpPost("wipe")]
    public async Task<IActionResult> Wipe(WipeDatabaseRequestDto request)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "delete all portal data");
        if (denied != null) return denied;

        if (!string.Equals(request.ConfirmPhrase?.Trim(), WipeConfirmPhrase, StringComparison.Ordinal))
            return Ok(new { success = false, message = $"Type \"{WipeConfirmPhrase}\" exactly to confirm." });

        var caller = await ResolveCallerAccountAsync();

        if (caller == null)
            return Ok(new { success = false, message = "Unable to verify your identity right now." });

        PortalBackupDto backup;

        try
        {
            backup = await _settings.ExportBackupAsync();
        }
        catch (InvalidOperationException ex)
        {
            return Ok(new { success = false, message = ex.Message });
        }

        var backupJson = System.Text.Json.JsonSerializer.Serialize(backup);
        var backupBase64 = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(backupJson));
        var fileName = $"deployment-portal-backup-{DateTime.UtcNow:yyyyMMdd-HHmmss}.json";
        var maskedHost = SettingsService.BuildMaskedConnection(_settings.GetDatabaseConnectionString()) ?? "unknown";

        var emailResult = await _email.SendDatabaseWipeBackupEmailAsync(
            caller.Value.Email, caller.Value.UserId, maskedHost, backupBase64, fileName);

        if (!emailResult.Success)
        {
            // Never wipe anything without the safety net actually landing -
            // an admin who can't confirm the backup reached their inbox
            // shouldn't be one step away from deleting everything on a
            // failed send they never saw.
            return Ok(new
            {
                success = false,
                message = $"Couldn't send the safety-net backup email - nothing was deleted. ({emailResult.Message})"
            });
        }

        await _settings.WipeSettingsAsync();

        _log.LogInfo("Backup", $"{caller.Value.UserId} wiped all portal data - a safety-net backup was emailed to {caller.Value.Email} first");

        return Ok(new { success = true, message = $"All data deleted. A safety-net backup was emailed to {caller.Value.Email}." });
    }
}

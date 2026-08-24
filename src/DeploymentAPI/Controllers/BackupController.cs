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
    private readonly ActivityLogService _log;

    public BackupController(SettingsService settings, ActivityLogService log)
    {
        _settings = settings;
        _log = log;
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export()
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "export a full portal backup");
        if (denied != null) return denied;

        try
        {
            var backup = await _settings.ExportBackupAsync();

            var actor = await AdminGate.ResolveCallerLoginAsync(this) ?? "unknown";
            _log.LogInfo("Backup", $"{actor} exported a full portal backup ({backup.DataProtectionKeyXmls.Count} key ring entries)");

            return Ok(backup);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
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
}

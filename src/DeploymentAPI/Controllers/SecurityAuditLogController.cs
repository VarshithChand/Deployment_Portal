using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Backs the Services page's "Security (SecurityAPI)" tab's Audit Log
// panel — the portal's real activity log (same data/gate as
// LogsController, used by Settings > Activity Log), not a separate fake
// audit trail. Read-only: entries are only ever written by
// ActivityLogService itself as real actions happen elsewhere in the app.
[ApiController]
[Route("api/security/audit-logs")]
public class SecurityAuditLogController : ControllerBase
{
    private readonly ActivityLogService _logs;
    private readonly SettingsService _settings;

    public SecurityAuditLogController(ActivityLogService logs, SettingsService settings)
    {
        _logs = logs;
        _settings = settings;
    }

    [HttpGet]
    public async Task<IActionResult> GetRecent()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view the activity log", "services") is IActionResult denied)
            return denied;

        return Ok(_logs.GetRecent());
    }
}

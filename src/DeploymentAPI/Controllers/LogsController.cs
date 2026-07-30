using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// The activity log spans every session (which repo/owner each one
// configured, when a token was updated, sidebar restrictions placed on a
// PAT user, etc.) — cross-session data a mere Viewer shouldn't see any
// more than an anonymous visitor should. The old [Authorize] only checked
// "is logged in at all," which a Viewer-role login satisfies just as well
// as an Admin one, and it didn't recognize the newer PAT-based admin path
// (see AdminGate) at all — this now matches every other admin-gated
// controller instead: bootstrap-aware, OAuth-Admin or PAT-owner-in-
// allowlist both qualify, Viewer does not.
[ApiController]
[Route("api/logs")]
public class LogsController : ControllerBase
{
    private readonly ActivityLogService _logs;
    private readonly SettingsService _settings;

    public LogsController(ActivityLogService logs, SettingsService settings)
    {
        _logs = logs;
        _settings = settings;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view the activity log") is IActionResult denied)
            return denied;

        return Ok(_logs.GetRecent());
    }
}

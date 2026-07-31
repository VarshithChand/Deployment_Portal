using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Plain infra health checks - no auth, no admin gate, nothing session-
// scoped. This is what the Smoke Tests workflow's Backend/Database jobs
// poll to confirm the app actually booted and can reach its database
// (see .github/workflows/smoke-tests.yml), and it's generically useful as
// a liveness endpoint for a load balancer/uptime monitor too.
[ApiController]
[Route("api/health")]
public class HealthController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly ILogger<HealthController> _logger;

    public HealthController(SettingsService settings, ILogger<HealthController> logger)
    {
        _settings = settings;
        _logger = logger;
    }

    [HttpGet]
    public IActionResult Get() => Ok(new { status = "ok" });

    [HttpGet("db")]
    public async Task<IActionResult> Database()
    {
        var (healthy, mode, error) = await _settings.CheckDatabaseHealthAsync();

        if (!healthy)
        {
            // The connection error itself stays server-side only - this
            // endpoint has no auth, so an anonymous caller gets a generic
            // failure, not internal connection details.
            _logger.LogError("Database health check failed: {Error}", error);
            return StatusCode(503, new { status = "error", mode });
        }

        return Ok(new { status = "ok", mode });
    }
}

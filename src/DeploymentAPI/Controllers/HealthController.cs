using System.Diagnostics;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Plain infra health checks - no auth, no admin gate, nothing session-
// scoped. This is what the Smoke Tests workflow's Backend/Database jobs
// poll to confirm the app actually booted and can reach its database
// (see .github/workflows/smoke-tests.yml), and it's also what the Smoke
// Tests page calls directly for a live "check right now" view when an
// admin expands a card - CPU/memory/response time here are real
// measurements taken on this request, not stored/mocked values.
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
    public async Task<IActionResult> Get()
    {
        var process = Process.GetCurrentProcess();

        // A single point-in-time reading of TotalProcessorTime is
        // cumulative since process start, not a "right now" percentage -
        // sampling it before and after a short delay and dividing by wall
        // time (across every core) is the standard way to turn that into
        // an actual utilization number for this one process.
        var cpuStart = process.TotalProcessorTime;
        var stopwatch = Stopwatch.StartNew();

        await Task.Delay(100);

        process.Refresh();
        var cpuElapsedMs = (process.TotalProcessorTime - cpuStart).TotalMilliseconds;
        var wallElapsedMs = stopwatch.Elapsed.TotalMilliseconds;
        var cpuPercent = Math.Round(cpuElapsedMs / (Environment.ProcessorCount * wallElapsedMs) * 100, 1);

        return Ok(new
        {
            status = "ok",
            uptimeSeconds = Math.Round((DateTime.UtcNow - process.StartTime.ToUniversalTime()).TotalSeconds, 0),
            memoryMb = Math.Round(process.WorkingSet64 / 1024.0 / 1024.0, 1),
            cpuPercent
        });
    }

    [HttpGet("db")]
    public async Task<IActionResult> Database()
    {
        var result = await _settings.CheckDatabaseHealthAsync();

        if (!result.Healthy)
        {
            // The connection error itself stays server-side only - this
            // endpoint has no auth, so an anonymous caller gets a generic
            // failure, not internal connection details.
            _logger.LogError("Database health check failed: {Error}", result.Error);
            return StatusCode(503, new { status = "error", mode = result.Mode });
        }

        // status/mode/responseTimeMs stay public - the smoke-tests CI
        // workflow hits this with no session at all and only checks the
        // HTTP status code (see .github/workflows/smoke-tests.yml). Host/
        // port/database name are real infrastructure topology, though, so
        // those only go to a caller AdminGate would actually recognize as
        // Admin - the Smoke Test card in Settings already renders them
        // conditionally (see SmokeTestCard.jsx), so leaving them null for
        // everyone else needs no frontend change.
        var view = await _settings.GetViewAsync();

        var isAdmin = AdminGate.IsAdminOrBootstrap(this, view);

        return Ok(new
        {
            status = "ok",
            mode = result.Mode,
            responseTimeMs = result.ResponseTimeMs,
            host = isAdmin ? result.Host : null,
            port = isAdmin ? result.Port : null,
            database = isAdmin ? result.Database : null
        });
    }
}

using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Settings > Smoke Tests page - admin-only end to end, same as
// SonarController: triggering a real GitHub Actions run and reading its
// results is exactly what the admin allowlist exists to gate. No
// class-level [Authorize]: bootstrap mode needs the same
// unauthenticated-first-configure path every other admin-gated
// controller allows - see AdminGate.
[ApiController]
[Route("api/smoketest")]
public class SmokeTestController : ControllerBase
{
    private readonly SmokeTestService _smokeTests;
    private readonly SettingsService _settings;

    public SmokeTestController(SmokeTestService smokeTests, SettingsService settings)
    {
        _smokeTests = smokeTests;
        _settings = settings;
    }

    [HttpGet("latest")]
    public async Task<IActionResult> Latest()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view smoke test results") is IActionResult denied)
            return denied;

        return Ok(await _smokeTests.GetLatestAsync());
    }

    [HttpPost("run")]
    public async Task<IActionResult> Run()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "run smoke tests") is IActionResult denied)
            return denied;

        return Ok(await _smokeTests.RunAsync());
    }

    [HttpGet("run/{runId}")]
    public async Task<IActionResult> RunStatus(long runId)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view smoke test results") is IActionResult denied)
            return denied;

        return Ok(await _smokeTests.GetRunStatusAsync(runId));
    }
}

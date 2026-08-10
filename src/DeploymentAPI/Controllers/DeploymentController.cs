using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// No class-level [Authorize]: Deploy() already runs through AdminGate,
// which is bootstrap-aware (see AdminGate/SettingsController) — a blanket
// attribute here would block that intentional bootstrap flow.
[ApiController]
[Route("api/deployment")]
public class DeploymentController : ControllerBase
{
    private readonly DeploymentService _service;
    private readonly SettingsService _settings;

    public DeploymentController(
        DeploymentService service,
        SettingsService settings)
    {
        _service = service;
        _settings = settings;
    }

    // Triggering a real GitHub Actions run against the configured repo is
    // exactly the kind of action the admin allowlist exists to gate — this
    // had no check at all before, meaning any anonymous visitor could kick
    // off a workflow run.
    [HttpPost("deploy")]
    public async Task<IActionResult> Deploy(
        DeployDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "trigger a deployment") is IActionResult denied)
            return denied;

        var result =
            await _service.DeployAsync(request);

        // Every active session (admin or not, OAuth or PAT-only) gets
        // signed out once a pipeline actually runs - see
        // SettingsService.BumpForceLogoutEpochAsync for why a bumped
        // timestamp is how that's broadcast. A failed dispatch didn't
        // actually run anything, so it doesn't earn a forced logout.
        if (result.Success)
            await _settings.BumpForceLogoutEpochAsync();

        return Ok(result);
    }
}
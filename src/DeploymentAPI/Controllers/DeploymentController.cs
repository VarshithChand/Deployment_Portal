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
    // off a workflow run. allowRepoWrite: true additionally lets through
    // anyone whose connected token has real GitHub push access to the repo
    // (the same permission level GitHub's own Actions API itself requires
    // to dispatch a workflow_dispatch run) — not just people on the
    // portal's own admin allowlist/page grant, since requiring a SEPARATE
    // portal-side allowlist entry for someone who already has GitHub write
    // access to the repo added no real security here.
    [HttpPost("deploy")]
    public async Task<IActionResult> Deploy(
        DeployDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "trigger a deployment", "deploy", allowRepoWrite: true) is IActionResult denied)
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
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

[Authorize]
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

        return Ok(result);
    }
}
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Code Quality page — admin-only end to end (unlike GitHub data, this
// isn't scoped per-session/PAT; there's one shared Sonar project for the
// whole repo, and its token is a portal-wide credential same as Docker/
// OAuth). No class-level [Authorize]: bootstrap mode needs the same
// unauthenticated-first-configure path every other admin-gated controller
// allows — see AdminGate.
[ApiController]
[Route("api/sonar")]
public class SonarController : ControllerBase
{
    private readonly SonarApiService _sonar;
    private readonly SettingsService _settings;

    public SonarController(SonarApiService sonar, SettingsService settings)
    {
        _sonar = sonar;
        _settings = settings;
    }

    [HttpGet("overview")]
    public async Task<IActionResult> Overview()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view code quality data") is IActionResult denied)
            return denied;

        return Ok(await _sonar.GetOverviewAsync());
    }
}

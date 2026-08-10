using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Backs the Services page's "Projects (PMSCoreAPI)" tab — the portal's
// real, admin-managed environment list (same data Settings > Environments
// and the Dashboard's Environments card use), not a separate fake project
// store. Read-only here; editing this list already lives in Settings >
// Environments (see EnvironmentsController.Save), so there's no
// create/update/delete or a "tasks" sub-resource to reimplement.
[ApiController]
[Route("api/pmscore/projects")]
public class PmsCoreProjectsController : ControllerBase
{
    private readonly SettingsService _settings;

    public PmsCoreProjectsController(SettingsService settings)
    {
        _settings = settings;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _settings.GetEnvironmentDefinitionsAsync());
    }
}

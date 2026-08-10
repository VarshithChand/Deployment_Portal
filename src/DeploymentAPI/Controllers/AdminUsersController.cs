using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Backs the Services page's "Users (AdminAPI)" tab — the real PAT users
// list (same data/gate as SettingsController's own pat-users endpoint,
// used by Settings > Sidebar Access), not a separate fake user store.
// There's no "create/edit/delete a user" here because a PAT user isn't an
// account this portal manages directly - it exists only because someone
// configured a Personal Access Token in Settings > GitHub.
[ApiController]
[Route("api/admin/users")]
public class AdminUsersController : ControllerBase
{
    private readonly SettingsService _settings;

    public AdminUsersController(SettingsService settings)
    {
        _settings = settings;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view PAT users") is IActionResult denied)
            return denied;

        return Ok(await _settings.GetPatUsersAsync());
    }
}

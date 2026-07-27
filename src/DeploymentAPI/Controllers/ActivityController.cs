using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Recent GitHub activity (commits + workflow runs) for the TopBar
// notification bell — scoped to whatever repo/token PortalIdentity
// resolved for this caller (see GitHubAuthService), no login required.
[ApiController]
[Route("api/activity")]
public class ActivityController : ControllerBase
{
    private readonly GitHubApiService _github;

    public ActivityController(GitHubApiService github)
    {
        _github = github;
    }

    [HttpGet("recent")]
    public async Task<IActionResult> Recent()
    {
        return Ok(await _github.GetRecentActivityAsync());
    }
}

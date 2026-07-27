using DeploymentAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Recent GitHub activity (commits + workflow runs) for the TopBar
// notification bell — read-only, but still requires a logged-in,
// allowlisted user like every other controller here.
[Authorize]
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

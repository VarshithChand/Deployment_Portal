using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Open pull requests to review/merge, plus a closed/merged history and
// recent commit log. No class-level [Authorize]: approve/merge already run
// through AdminGate, which is bootstrap-aware (see AdminGate/
// SettingsController) — a blanket attribute here would block that
// intentional bootstrap flow. The plain read actions get [Authorize]
// individually instead, since they had no protection at all before.
[ApiController]
[Route("api/pull-requests")]
public class PullRequestsController : ControllerBase
{
    private readonly GitHubApiService _github;
    private readonly SettingsService _settings;
    private readonly ActivityLogService _log;

    public PullRequestsController(GitHubApiService github, SettingsService settings, ActivityLogService log)
    {
        _github = github;
        _settings = settings;
        _log = log;
    }

    [Authorize]
    [HttpGet]
    public async Task<IActionResult> Open([FromQuery] bool force = false)
    {
        return Ok(await _github.GetOpenPullRequestsAsync(force));
    }

    // Polled by the TopBar notification badge — deliberately cheaper than
    // the full list (though it currently still fetches the full list under
    // the hood and just returns the count; the point is the response body
    // the frontend polls every 30s stays tiny).
    [Authorize]
    [HttpGet("count")]
    public async Task<IActionResult> Count()
    {
        return Ok(new { count = await _github.GetOpenPullRequestCountAsync() });
    }

    [Authorize]
    [HttpGet("history")]
    public async Task<IActionResult> History([FromQuery] bool force = false)
    {
        return Ok(await _github.GetPullRequestHistoryAsync(force));
    }

    [Authorize]
    [HttpGet("commits")]
    public async Task<IActionResult> Commits([FromQuery] bool force = false)
    {
        return Ok(await _github.GetRecentCommitsAsync(force));
    }

    [HttpPost("{number}/approve")]
    public async Task<IActionResult> Approve(int number)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "approve or merge pull requests") is IActionResult denied)
            return denied;

        await _github.ApprovePullRequestAsync(number);

        _log.LogInfo("Pull Requests", $"Approved PR #{number}.");

        return Ok();
    }

    [HttpPost("{number}/merge")]
    public async Task<IActionResult> Merge(int number)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "approve or merge pull requests") is IActionResult denied)
            return denied;

        await _github.MergePullRequestAsync(number);

        _log.LogInfo("Pull Requests", $"Merged PR #{number}.");

        return Ok(await _github.GetOpenPullRequestsAsync(forceRefresh: true));
    }
}

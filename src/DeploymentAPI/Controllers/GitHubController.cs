using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// No [Authorize] anywhere except DeleteArtifact's AdminGate check: every
// read here is scoped to whatever repo/token PortalIdentity resolved for
// this caller (see GitHubAuthService) — a real GitHub login if there is
// one, otherwise an isolated per-browser session. That's what keeps one
// visitor's repo data from ever being visible to another, without requiring
// anyone to complete GitHub OAuth login first.
[ApiController]
[Route("api/github")]
public class GitHubController : ControllerBase
{
    private readonly GitHubApiService _service;
    private readonly SettingsService _settings;
    private readonly PipelineExplanationService _pipelineExplanation;

    public GitHubController(GitHubApiService service, SettingsService settings, PipelineExplanationService pipelineExplanation)
    {
        _service = service;
        _settings = settings;
        _pipelineExplanation = pipelineExplanation;
    }

    [HttpGet("repository")]
    public async Task<IActionResult> Repository([FromQuery] bool force = false)
    {
        return Ok(await _service.GetRepositorySummaryAsync(force));
    }

    [HttpGet("branches")]
    public async Task<IActionResult> Branches([FromQuery] bool force = false)
    {
        return Ok(await _service.GetBranches(force));
    }

    [HttpGet("rate-limit")]
    public async Task<IActionResult> RateLimit()
    {
        return Ok(await _service.GetRateLimitAsync());
    }

    [HttpGet("token-owner")]
    public async Task<IActionResult> TokenOwner()
    {
        return Ok(await _service.GetTokenOwnerAsync());
    }

    [HttpGet("account-repositories")]
    public async Task<IActionResult> AccountRepositories()
    {
        return Ok(await _service.GetAccountRepositoriesAsync());
    }

    // Dashboard's "all your repos" container - which pipeline(s) are
    // currently running on a repo OTHER than the one this session is
    // pointed at, so switching repos isn't the only way to see that. Returns
    // several recent runs (not just the latest one) since more than one can
    // legitimately be running in the same repo at once - see
    // GetRecentRunsForRepoAsync's own comment.
    [HttpGet("repo-runs")]
    public async Task<IActionResult> RepoRuns([FromQuery] string owner, [FromQuery] string repo)
    {
        if (string.IsNullOrWhiteSpace(owner) || string.IsNullOrWhiteSpace(repo))
            return BadRequest("owner and repo are required.");

        return Ok(await _service.GetRecentRunsForRepoAsync(owner, repo));
    }

    // Same data as RepoRuns above, one repo at a time - this is the batched
    // version the Dashboard grid actually calls, so an account with N repos
    // costs the browser one request instead of N. GetRecentRunsForRepoAsync
    // already swallows a single repo's own failure (disabled Actions,
    // private-and-inaccessible, etc.) and returns an empty list for it - see
    // that method's own comment - so one bad repo in the batch can't fail
    // the others; Task.WhenAll runs every repo's GitHub call in parallel,
    // the same fan-out that used to happen in the browser, just server-side.
    [HttpPost("repo-runs/bulk")]
    public async Task<IActionResult> RepoRunsBulk([FromBody] RepoRunsBulkRequestDto request)
    {
        var repos = (request?.Repos ?? new List<RepoRefDto>())
            .Where(r => !string.IsNullOrWhiteSpace(r.Owner) && !string.IsNullOrWhiteSpace(r.Repo))
            // Capped so one caller can't fan out an unbounded number of
            // parallel GitHub API calls server-side in a single request.
            .Take(100)
            .ToList();

        var results = await Task.WhenAll(repos.Select(async r => new
        {
            FullName = $"{r.Owner}/{r.Repo}",
            Runs = await _service.GetRecentRunsForRepoAsync(r.Owner, r.Repo)
        }));

        return Ok(results.ToDictionary(r => r.FullName, r => r.Runs));
    }

    [HttpGet("artifacts")]
    public async Task<IActionResult> Artifacts([FromQuery] bool force = false)
    {
        return Ok(await _service.GetArtifacts(force));
    }

    [HttpGet("docker-images")]
    public async Task<IActionResult> DockerImages()
    {
        return Ok(await _service.GetDockerImages());
    }

    [HttpGet("artifacts/{id}/download")]
    public async Task<IActionResult> DownloadArtifact(long id)
    {
        var (content, fileName) = await _service.DownloadArtifactAsync(id);
        return File(content, "application/zip", fileName);
    }

    // Permanently deleting a build artifact had no server-side check at
    // all before this — same class of gap as Deploy and Approvals.Decide.
    [HttpDelete("artifacts/{id}")]
    public async Task<IActionResult> DeleteArtifact(long id)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "delete an artifact", "storage") is IActionResult denied)
            return denied;

        await _service.DeleteArtifactAsync(id);
        return NoContent();
    }

    [HttpGet("workflows")]
    public async Task<IActionResult> Workflows([FromQuery] bool force = false)
    {
        return Ok(await _service.GetWorkflowDefinitionsAsync(force));
    }

    [HttpGet("workflow-inputs")]
    public async Task<IActionResult> WorkflowInputs([FromQuery] string path, [FromQuery] string? branch)
    {
        if (string.IsNullOrWhiteSpace(path))
            return BadRequest("path is required.");

        // path is interpolated into a GitHub contents API URL - rejecting
        // anything outside a real repo file path's shape here means a
        // crafted value (a ".." segment, say) can't redirect that request
        // onto an unintended API path.
        if (!GitHubNameValidator.IsValidRepoPath(path))
            return BadRequest(new { message = "path must be a valid repository-relative file path." });

        return Ok(await _service.GetWorkflowInputsAsync(path, branch));
    }

    [HttpGet("workflow-yaml")]
    public async Task<IActionResult> WorkflowYaml([FromQuery] string path, [FromQuery] string? branch)
    {
        if (string.IsNullOrWhiteSpace(path))
            return BadRequest("path is required.");

        if (!GitHubNameValidator.IsValidRepoPath(path))
            return BadRequest(new { message = "path must be a valid repository-relative file path." });

        var yaml = await _service.GetWorkflowYamlAsync(path, branch);
        return Ok(new { path, branch, content = yaml });
    }

    // Deploy page's "Explain Pipeline" — reads the same YAML "View YAML"
    // shows raw, and turns it into a plain-English summary of what will
    // actually happen before someone commits to running it.
    [HttpGet("explain-pipeline")]
    public async Task<IActionResult> ExplainPipeline([FromQuery] string path, [FromQuery] string? branch)
    {
        if (string.IsNullOrWhiteSpace(path))
            return BadRequest("path is required.");

        if (!GitHubNameValidator.IsValidRepoPath(path))
            return BadRequest(new { message = "path must be a valid repository-relative file path." });

        var yaml = await _service.GetWorkflowYamlAsync(path, branch);
        var workflowName = path.Contains('/') ? path[(path.LastIndexOf('/') + 1)..] : path;

        return Ok(await _pipelineExplanation.ExplainAsync(workflowName, yaml));
    }

    [HttpGet("workflows/last-run")]
    public async Task<IActionResult> LastRun([FromQuery] string workflow, [FromQuery] string? branch)
    {
        if (string.IsNullOrWhiteSpace(workflow))
            return BadRequest("workflow is required.");

        return Ok(await _service.GetLatestRunSummaryAsync(workflow, branch));
    }
}

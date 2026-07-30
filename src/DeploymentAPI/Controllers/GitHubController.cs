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

    public GitHubController(GitHubApiService service, SettingsService settings)
    {
        _service = service;
        _settings = settings;
    }

    [HttpGet("repository")]
    public async Task<IActionResult> Repository([FromQuery] bool force = false)
    {
        // GetRepository() returns GitHub's raw JSON as a string; Content()
        // writes it through as-is instead of Ok() re-encoding it as a JSON string literal.
        var json = await _service.GetRepository(force);
        return Content(json, "application/json");
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
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "delete an artifact") is IActionResult denied)
            return denied;

        await _service.DeleteArtifactAsync(id);
        return NoContent();
    }

    [HttpGet("workflows")]
    public async Task<IActionResult> Workflows([FromQuery] bool force = false)
    {
        var json = await _service.GetWorkflows(force);
        return Content(json, "application/json");
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

    [HttpGet("workflows/last-run")]
    public async Task<IActionResult> LastRun([FromQuery] string workflow, [FromQuery] string? branch)
    {
        if (string.IsNullOrWhiteSpace(workflow))
            return BadRequest("workflow is required.");

        return Ok(await _service.GetLatestRunSummaryAsync(workflow, branch));
    }
}

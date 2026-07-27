using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// No class-level [Authorize]: DeleteArtifact already runs through
// AdminGate, which is bootstrap-aware (see AdminGate/SettingsController) —
// a blanket attribute here would block that intentional bootstrap flow.
// Every other action gets [Authorize] individually instead, since they had
// no protection at all before.
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

    [Authorize]
    [HttpGet("repository")]
    public async Task<IActionResult> Repository([FromQuery] bool force = false)
    {
        // GetRepository() returns GitHub's raw JSON as a string; Content()
        // writes it through as-is instead of Ok() re-encoding it as a JSON string literal.
        var json = await _service.GetRepository(force);
        return Content(json, "application/json");
    }

    [Authorize]
    [HttpGet("branches")]
    public async Task<IActionResult> Branches([FromQuery] bool force = false)
    {
        return Ok(await _service.GetBranches(force));
    }

    [Authorize]
    [HttpGet("rate-limit")]
    public async Task<IActionResult> RateLimit()
    {
        return Ok(await _service.GetRateLimitAsync());
    }

    [Authorize]
    [HttpGet("token-owner")]
    public async Task<IActionResult> TokenOwner()
    {
        return Ok(await _service.GetTokenOwnerAsync());
    }

    [Authorize]
    [HttpGet("account-repositories")]
    public async Task<IActionResult> AccountRepositories()
    {
        return Ok(await _service.GetAccountRepositoriesAsync());
    }

    [Authorize]
    [HttpGet("artifacts")]
    public async Task<IActionResult> Artifacts([FromQuery] bool force = false)
    {
        return Ok(await _service.GetArtifacts(force));
    }

    [Authorize]
    [HttpGet("docker-images")]
    public async Task<IActionResult> DockerImages()
    {
        return Ok(await _service.GetDockerImages());
    }

    [Authorize]
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

    [Authorize]
    [HttpGet("workflows")]
    public async Task<IActionResult> Workflows([FromQuery] bool force = false)
    {
        var json = await _service.GetWorkflows(force);
        return Content(json, "application/json");
    }

    [Authorize]
    [HttpGet("workflow-inputs")]
    public async Task<IActionResult> WorkflowInputs([FromQuery] string path, [FromQuery] string? branch)
    {
        if (string.IsNullOrWhiteSpace(path))
            return BadRequest("path is required.");

        return Ok(await _service.GetWorkflowInputsAsync(path, branch));
    }

    [Authorize]
    [HttpGet("workflow-yaml")]
    public async Task<IActionResult> WorkflowYaml([FromQuery] string path, [FromQuery] string? branch)
    {
        if (string.IsNullOrWhiteSpace(path))
            return BadRequest("path is required.");

        var yaml = await _service.GetWorkflowYamlAsync(path, branch);
        return Ok(new { path, branch, content = yaml });
    }

    [Authorize]
    [HttpGet("workflows/last-run")]
    public async Task<IActionResult> LastRun([FromQuery] string workflow, [FromQuery] string? branch)
    {
        if (string.IsNullOrWhiteSpace(workflow))
            return BadRequest("workflow is required.");

        return Ok(await _service.GetLatestRunSummaryAsync(workflow, branch));
    }
}

using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Source Control hub's Azure Repos and AWS CodeCommit sub-pages. Azure
// Repos' shared credential (Organization + PAT) is configured/cleared
// under an admin gate + the same screen-lock PIN every other shared
// credential in this app goes through - the exact same bar Docker Hub/
// GHCR/GitLab Registry/JFrog/Harbor/Nexus already use in the Container
// Registry hub. Browsing (repositories/branches) has no gate at all -
// once an admin connects it, every portal visitor sees the same
// repositories. AWS CodeCommit needs no credential routes at all here -
// it reads this session's own already-connected AWS credentials, the same
// self-service posture ECR/EC2/ECS/RDS/Lambda already have.
[ApiController]
[Route("api/sourcecontrol")]
public class SourceControlController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly SourceControlService _sourceControl;
    private readonly SessionActivityService _activity;

    public SourceControlController(SettingsService settings, SourceControlService sourceControl, SessionActivityService activity)
    {
        _settings = settings;
        _sourceControl = sourceControl;
        _activity = activity;
    }

    // ---- Azure Repos: credential status/save/clear ---------------------

    [HttpGet("azureRepos/status")]
    public async Task<IActionResult> GetAzureReposStatus()
    {
        var creds = await _settings.GetPortalSourceControlCredentialsAsync("azureRepos");

        return Ok(new AzureReposStatusDto
        {
            Configured = creds.IsConfigured,
            Organization = creds.AccountId ?? string.Empty
        });
    }

    [HttpPost("azureRepos")]
    public async Task<IActionResult> SaveAzureReposCredentials(AzureReposCredentialsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "azureRepos") is IActionResult locked)
            return locked;

        var existing = await _settings.GetPortalSourceControlCredentialsAsync("azureRepos");
        var effectiveOrg = string.IsNullOrWhiteSpace(request.Organization) ? existing.AccountId : request.Organization;

        if (string.IsNullOrWhiteSpace(effectiveOrg))
            return BadRequest(new { message = "An organization name is required." });

        await _settings.SavePortalSourceControlCredentialsAsync(
            "azureRepos",
            new PaasCredentialsUpdateDto { Token = request.Token, AccountId = request.Organization });

        return Ok(new { configured = true });
    }

    [HttpDelete("azureRepos")]
    public async Task<IActionResult> ClearAzureReposCredentials()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "azureRepos") is IActionResult locked)
            return locked;

        await _settings.ClearPortalSourceControlCredentialsAsync("azureRepos");

        return Ok(new { success = true });
    }

    // ---- Azure Repos: browse -----------------------------------------------

    [HttpGet("azureRepos/repositories")]
    public async Task<IActionResult> GetAzureReposRepositories()
    {
        var creds = await _settings.GetPortalSourceControlCredentialsAsync("azureRepos");
        return Ok(await _sourceControl.GetAzureReposRepositoriesAsync(creds));
    }

    [HttpGet("azureRepos/projects/{project}/repositories/{repositoryId}/branches")]
    public async Task<IActionResult> GetAzureReposBranches(string project, string repositoryId)
    {
        var creds = await _settings.GetPortalSourceControlCredentialsAsync("azureRepos");
        return Ok(await _sourceControl.GetAzureReposBranchesAsync(creds, project, repositoryId));
    }

    // ---- AWS CodeCommit: browse (self-service, this session's own AWS creds) --

    [HttpGet("codeCommit/repositories")]
    public async Task<IActionResult> GetCodeCommitRepositories([FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _sourceControl.GetCodeCommitRepositoriesAsync(creds, region));
    }

    [HttpGet("codeCommit/repositories/{repositoryName}/branches")]
    public async Task<IActionResult> GetCodeCommitBranches(string repositoryName, [FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _sourceControl.GetCodeCommitBranchesAsync(creds, region, repositoryName));
    }
}

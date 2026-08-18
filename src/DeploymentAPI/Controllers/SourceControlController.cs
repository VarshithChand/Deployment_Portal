using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Source Control hub's Azure Repos and AWS CodeCommit sub-pages. Azure
// Repos' credential (Organization + PAT) is session-scoped - each visitor
// connects their own, isolated from every other visitor - configured/
// cleared self-service, gated only by the same screen-lock PIN every
// session credential in this app goes through (no AdminGate), the same
// posture Docker Hub/GHCR/GitLab Registry/JFrog/Harbor/Nexus use in the
// Container Registry hub. Browsing (repositories/branches) has no gate at
// all and reads only the CALLING session's own credential. AWS CodeCommit
// needs no credential routes at all here - it reads this session's own
// already-connected AWS credentials, the same self-service posture
// ECR/EC2/ECS/RDS/Lambda already have.
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
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync("azureRepos", key);

        return Ok(new AzureReposStatusDto
        {
            Configured = creds.IsConfigured,
            Organization = creds.AccountId ?? string.Empty
        });
    }

    [HttpPost("azureRepos")]
    public async Task<IActionResult> SaveAzureReposCredentials(AzureReposCredentialsUpdateDto request)
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "azureRepos") is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var existing = await _settings.GetUserPaasCredentialsAsync("azureRepos", key);
        var effectiveOrg = string.IsNullOrWhiteSpace(request.Organization) ? existing.AccountId : request.Organization;

        if (string.IsNullOrWhiteSpace(effectiveOrg))
            return BadRequest(new { message = "An organization name is required." });

        await _settings.SaveUserPaasCredentialsAsync(
            "azureRepos",
            key,
            new PaasCredentialsUpdateDto { Token = request.Token, AccountId = request.Organization });

        return Ok(new { configured = true });
    }

    [HttpDelete("azureRepos")]
    public async Task<IActionResult> ClearAzureReposCredentials()
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "azureRepos") is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserPaasCredentialsAsync("azureRepos", key);
        _activity.RevokeCredentialUnlock(key, "azureRepos");

        return Ok(new { success = true });
    }

    // ---- Azure Repos: browse -----------------------------------------------

    [HttpGet("azureRepos/repositories")]
    public async Task<IActionResult> GetAzureReposRepositories()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync("azureRepos", key);
        return Ok(await _sourceControl.GetAzureReposRepositoriesAsync(creds));
    }

    [HttpGet("azureRepos/projects/{project}/repositories/{repositoryId}/branches")]
    public async Task<IActionResult> GetAzureReposBranches(string project, string repositoryId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync("azureRepos", key);
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

using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Azure DevOps' four Source Control sub-pages (Branches/Pipelines/Build
// Artifacts/Package Feeds), all against the one session-scoped credential
// (Organization + PAT) below - each visitor connects their own, isolated
// from every other visitor, same posture as every other Source Control/
// Container Registry credential in this app (see PaasController). No
// AdminGate on save/clear, just the same screen-lock PIN gate
// (CredentialGate) every session credential goes through. Browsing has no
// gate at all and reads only the CALLING session's own credential.
[ApiController]
[Route("api/azuredevops")]
public class AzureDevOpsController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly AzureDevOpsService _azureDevOps;
    private readonly SessionActivityService _activity;

    private const string Provider = "azureDevOps";

    public AzureDevOpsController(SettingsService settings, AzureDevOpsService azureDevOps, SessionActivityService activity)
    {
        _settings = settings;
        _azureDevOps = azureDevOps;
        _activity = activity;
    }

    // ---- Credential status/save/clear ------------------------------------

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);

        return Ok(new AzureDevOpsStatusDto
        {
            Configured = creds.IsConfigured,
            Organization = creds.AccountId ?? string.Empty
        });
    }

    [HttpPost("credentials")]
    public async Task<IActionResult> SaveCredentials(AzureDevOpsCredentialsUpdateDto request)
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, Provider) is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var existing = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        var effectiveOrg = string.IsNullOrWhiteSpace(request.Organization) ? existing.AccountId : request.Organization;

        if (string.IsNullOrWhiteSpace(effectiveOrg))
            return BadRequest(new { message = "An organization name is required." });

        await _settings.SaveUserPaasCredentialsAsync(
            Provider,
            key,
            new PaasCredentialsUpdateDto { Token = request.Token, AccountId = request.Organization });

        return Ok(new { configured = true });
    }

    [HttpDelete("credentials")]
    public async Task<IActionResult> ClearCredentials()
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, Provider) is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserPaasCredentialsAsync(Provider, key);
        _activity.RevokeCredentialUnlock(key, Provider);

        return Ok(new { success = true });
    }

    // ---- Projects (Pipelines/Build Artifacts picker) ----------------------

    [HttpGet("projects")]
    public async Task<IActionResult> GetProjects()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetProjectsAsync(creds));
    }

    // ---- Dashboard: running pipelines for the selected project -------------

    [HttpGet("projects/{project}/running-builds")]
    public async Task<IActionResult> GetRunningBuilds(string project)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetRunningBuildsAsync(creds, project));
    }

    // ---- Branches: repositories -> branches --------------------------------

    [HttpGet("repositories")]
    public async Task<IActionResult> GetRepositories()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetRepositoriesAsync(creds));
    }

    [HttpGet("projects/{project}/repositories/{repositoryId}/branches")]
    public async Task<IActionResult> GetBranches(string project, string repositoryId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetBranchesAsync(creds, project, repositoryId));
    }

    // Self-service, no AdminGate/CredentialGate - same posture as
    // RunPipeline below (the calling session's own credential and its real
    // Azure DevOps permission are the auth boundary).
    [HttpPost("projects/{project}/repositories/{repositoryId}/branches")]
    public async Task<IActionResult> CreateBranch(string project, string repositoryId, AzureDevOpsCreateBranchDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);

        if (string.IsNullOrWhiteSpace(request.NewBranchName) || string.IsNullOrWhiteSpace(request.SourceObjectId))
            return BadRequest(new { message = "A branch name and a source commit are required." });

        return Ok(await _azureDevOps.CreateBranchAsync(creds, project, repositoryId, request.NewBranchName, request.SourceObjectId));
    }

    [HttpDelete("projects/{project}/repositories/{repositoryId}/branches/{branchName}")]
    public async Task<IActionResult> DeleteBranch(string project, string repositoryId, string branchName, [FromQuery] string objectId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);

        if (string.IsNullOrWhiteSpace(objectId))
            return BadRequest(new { message = "The branch's current commit is required to delete it safely." });

        return Ok(await _azureDevOps.DeleteBranchAsync(creds, project, repositoryId, branchName, objectId));
    }

    // ---- Pipelines: pipelines -> runs --------------------------------------

    [HttpGet("projects/{project}/pipelines")]
    public async Task<IActionResult> GetPipelines(string project)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetPipelinesAsync(creds, project));
    }

    // Resolved on demand right before showing a branch picker for one
    // specific pipeline - see GetPipelineDetailAsync's own comment.
    [HttpGet("projects/{project}/pipelines/{pipelineId}")]
    public async Task<IActionResult> GetPipelineDetail(string project, int pipelineId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetPipelineDetailAsync(creds, project, pipelineId));
    }

    [HttpGet("projects/{project}/pipelines/{pipelineId}/runs")]
    public async Task<IActionResult> GetRuns(string project, int pipelineId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetRunsAsync(creds, project, pipelineId));
    }

    // Self-service, no AdminGate/CredentialGate - see RunPipelineAsync's own
    // comment on why (the calling session's own credential and its real
    // Azure DevOps permission are the auth boundary, same as EC2/ECR
    // mutating actions elsewhere in this app).
    [HttpPost("projects/{project}/pipelines/{pipelineId}/runs")]
    public async Task<IActionResult> RunPipeline(string project, int pipelineId, [FromBody] AzureDevOpsRunPipelineRequestDto? request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.RunPipelineAsync(creds, project, pipelineId, request?.Branch));
    }

    // ---- Build Artifacts: pipelines -> latest run's artifacts --------------

    [HttpGet("projects/{project}/pipelines/{pipelineId}/latest-artifacts")]
    public async Task<IActionResult> GetLatestArtifacts(string project, int pipelineId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetLatestArtifactsAsync(creds, project, pipelineId));
    }

    // ---- Pull Requests: list / approve / complete --------------------------

    [HttpGet("projects/{project}/pullrequests")]
    public async Task<IActionResult> GetPullRequests(string project)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetPullRequestsAsync(creds, project));
    }

    // Self-service, no AdminGate/CredentialGate - same posture as every
    // other mutating action against a visitor's own connected credential
    // in this file.
    [HttpPost("projects/{project}/repositories/{repositoryId}/pullrequests/{pullRequestId}/approve")]
    public async Task<IActionResult> ApprovePullRequest(string project, string repositoryId, int pullRequestId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.ApprovePullRequestAsync(creds, project, repositoryId, pullRequestId));
    }

    [HttpPost("projects/{project}/repositories/{repositoryId}/pullrequests/{pullRequestId}/complete")]
    public async Task<IActionResult> CompletePullRequest(string project, string repositoryId, int pullRequestId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.CompletePullRequestAsync(creds, project, repositoryId, pullRequestId));
    }

    // ---- Package Feeds: feeds -> packages -> versions ----------------------

    [HttpGet("feeds")]
    public async Task<IActionResult> GetFeeds()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetFeedsAsync(creds));
    }

    [HttpGet("feeds/{feedId}/packages")]
    public async Task<IActionResult> GetPackages(string feedId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetPackagesAsync(creds, feedId));
    }

    [HttpGet("feeds/{feedId}/packages/{packageId}/versions")]
    public async Task<IActionResult> GetPackageVersions(string feedId, string packageId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetPackageVersionsAsync(creds, feedId, packageId));
    }
}

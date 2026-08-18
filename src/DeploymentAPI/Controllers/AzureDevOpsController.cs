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

    // ---- Pipelines: pipelines -> runs --------------------------------------

    [HttpGet("projects/{project}/pipelines")]
    public async Task<IActionResult> GetPipelines(string project)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetPipelinesAsync(creds, project));
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
    public async Task<IActionResult> RunPipeline(string project, int pipelineId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.RunPipelineAsync(creds, project, pipelineId));
    }

    // ---- Build Artifacts: pipelines -> runs -> artifacts -------------------

    [HttpGet("projects/{project}/runs/{runId}/artifacts")]
    public async Task<IActionResult> GetArtifacts(string project, int runId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(Provider, key);
        return Ok(await _azureDevOps.GetArtifactsAsync(creds, project, runId));
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

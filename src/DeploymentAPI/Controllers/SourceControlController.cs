using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Source Control hub's AWS CodeCommit sub-page (Azure DevOps moved to its
// own AzureDevOpsController.cs - it grew from one repos-browsing page into
// four: Branches/Pipelines/Build Artifacts/Package Feeds, and earned its
// own controller the same way ContainerRegistryController/SonarController
// each got their own). CodeCommit needs no credential routes at all here -
// it reads this session's own already-connected AWS credentials, the same
// self-service posture ECR/EC2/ECS/RDS/Lambda already have.
[ApiController]
[Route("api/sourcecontrol")]
public class SourceControlController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly SourceControlService _sourceControl;

    public SourceControlController(SettingsService settings, SourceControlService sourceControl)
    {
        _settings = settings;
        _sourceControl = sourceControl;
    }

    // ---- AWS CodeCommit: browse (self-service, this session's own AWS creds) --

    [HttpGet("codeCommit/repositories")]
    public async Task<IActionResult> GetCodeCommitRepositories([FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _sourceControl.GetCodeCommitRepositoriesAsync(creds, region));
    }

    [HttpGet("codeCommit/repositories/{repositoryName}/branches")]
    public async Task<IActionResult> GetCodeCommitBranches(string repositoryName, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _sourceControl.GetCodeCommitBranchesAsync(creds, region, repositoryName));
    }
}

using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Controllers;

// Dashboard's Environments card + its detail view. An "environment" here
// is a portal-level concept (see EnvironmentDefinitionDto) tied to a CD/
// release workflow, not a GitHub Environment/Deployment record — so its
// "latest commit" and "artifacts deployed" are resolved from that
// workflow's most recent run rather than any GitHub deployment API.
[ApiController]
[Route("api/environments")]
public class EnvironmentsController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly GitHubApiService _github;
    private readonly CloudStatusService _cloud;

    public EnvironmentsController(SettingsService settings, GitHubApiService github, CloudStatusService cloud)
    {
        _settings = settings;
        _github = github;
        _cloud = cloud;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var definitions = await _settings.GetEnvironmentDefinitionsAsync();
        var runs = await _github.GetWorkflowRuns();

        return Ok(definitions.Select(def => BuildSummary(def, runs)).ToList());
    }

    [HttpPost]
    public async Task<IActionResult> Save(EnvironmentDefinitionsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change the environment list") is IActionResult denied)
            return denied;

        var saved = await _settings.SaveEnvironmentDefinitionsAsync(request.Environments ?? new List<EnvironmentDefinitionDto>());

        return Ok(saved);
    }

    [HttpGet("{name}")]
    public async Task<IActionResult> GetDetail(string name)
    {
        var definitions = await _settings.GetEnvironmentDefinitionsAsync();
        var definition = definitions.FirstOrDefault(d => d.Name == name);

        if (definition == null)
            return NotFound(new { message = $"No environment named \"{name}\"." });

        var runs = await _github.GetWorkflowRuns();
        var summary = BuildSummary(definition, runs);

        var detail = new EnvironmentDetailDto
        {
            Name = summary.Name,
            WorkflowName = summary.WorkflowName,
            CloudProvider = summary.CloudProvider,
            AwsRegion = summary.AwsRegion,
            EcsCluster = summary.EcsCluster,
            EcsService = summary.EcsService,
            EcrRepository = summary.EcrRepository,
            AzureSubscriptionId = summary.AzureSubscriptionId,
            AzureResourceGroup = summary.AzureResourceGroup,
            AzureWebAppName = summary.AzureWebAppName,
            LatestRunId = summary.LatestRunId,
            CommitSha = summary.CommitSha,
            CommitMessage = summary.CommitMessage,
            Branch = summary.Branch,
            Status = summary.Status,
            Conclusion = summary.Conclusion,
            DeployedAt = summary.DeployedAt,
            HtmlUrl = summary.HtmlUrl
        };

        if (summary.LatestRunId is long runId)
        {
            var artifacts = await _github.GetArtifacts();

            detail.Artifacts = artifacts
                .Where(a => a.WorkflowRunUrl.EndsWith($"/runs/{runId}", StringComparison.Ordinal))
                .Select(a => new EnvironmentArtifactDto
                {
                    Id = a.Id,
                    Name = a.Name,
                    Size = a.Size,
                    Expired = a.Expired,
                    CreatedAt = a.CreatedAt,
                    DownloadUrl = a.DownloadUrl
                })
                .ToList();
        }

        return Ok(detail);
    }

    // Live cloud status for one environment — uses this visitor's own
    // session-scoped AWS/Azure credentials (see /api/settings/me/aws and
    // /api/settings/me/azure below), never a portal-wide credential.
    [HttpGet("{name}/cloud-status")]
    public async Task<IActionResult> GetCloudStatus(string name)
    {
        var definitions = await _settings.GetEnvironmentDefinitionsAsync();
        var definition = definitions.FirstOrDefault(d => d.Name == name);

        if (definition == null)
            return NotFound(new { message = $"No environment named \"{name}\"." });

        var key = PortalIdentity.GetOrCreateKey(HttpContext);

        if (definition.CloudProvider == "aws")
        {
            var creds = await _settings.GetUserAwsCredentialsAsync(key);

            var status = await _cloud.GetEcsAndEcrStatusAsync(
                creds, definition.AwsRegion, definition.EcsCluster, definition.EcsService, definition.EcrRepository);

            return Ok(status);
        }

        if (definition.CloudProvider == "azure")
        {
            var creds = await _settings.GetUserAzureCredentialsAsync(key);

            var status = await _cloud.GetAzureWebAppStatusAsync(
                creds, definition.AzureSubscriptionId, definition.AzureResourceGroup, definition.AzureWebAppName);

            return Ok(status);
        }

        return Ok(new CloudStatusDto { Provider = "none", Configured = false });
    }

    // Reads the CD workflow's actual YAML to answer "what is this really
    // deploying to" — the admin editor calls this to auto-fill the cloud
    // target fields instead of requiring them typed in by hand. Takes the
    // workflow name directly (not an existing environment's) so it also
    // works while adding a brand-new environment row that hasn't been
    // saved yet.
    [HttpGet("detect-target")]
    public async Task<IActionResult> DetectTarget([FromQuery] string workflowName)
    {
        if (string.IsNullOrWhiteSpace(workflowName))
            return BadRequest(new { message = "workflowName is required." });

        var workflowsJson = await _github.GetWorkflows();
        var workflows = JObject.Parse(workflowsJson)["workflows"] as JArray;

        var match = workflows?.FirstOrDefault(w =>
            string.Equals(w["name"]?.ToString(), workflowName, StringComparison.OrdinalIgnoreCase));

        if (match == null)
            return NotFound(new { message = $"No workflow named \"{workflowName}\" found in this repository." });

        var path = match["path"]?.ToString();

        if (string.IsNullOrWhiteSpace(path))
            return NotFound(new { message = "That workflow's file path could not be resolved." });

        var yaml = await _github.GetWorkflowYamlAsync(path, null);
        var detected = DeploymentTargetDetector.Detect(yaml);

        return Ok(detected);
    }

    private static EnvironmentSummaryDto BuildSummary(EnvironmentDefinitionDto def, List<WorkflowDto> runs)
    {
        var latestRun = runs
            .Where(r => r.Name == def.WorkflowName)
            .OrderByDescending(r => r.CreatedAt)
            .FirstOrDefault();

        return new EnvironmentSummaryDto
        {
            Name = def.Name,
            WorkflowName = def.WorkflowName,
            CloudProvider = def.CloudProvider,
            AwsRegion = def.AwsRegion,
            EcsCluster = def.EcsCluster,
            EcsService = def.EcsService,
            EcrRepository = def.EcrRepository,
            AzureSubscriptionId = def.AzureSubscriptionId,
            AzureResourceGroup = def.AzureResourceGroup,
            AzureWebAppName = def.AzureWebAppName,

            LatestRunId = latestRun?.Id,
            CommitSha = latestRun?.CommitSha,
            CommitMessage = latestRun?.CommitMessage,
            Branch = latestRun?.Branch,
            Status = latestRun?.Status,
            Conclusion = latestRun?.Conclusion,
            DeployedAt = latestRun?.CreatedAt,
            HtmlUrl = latestRun?.HtmlUrl
        };
    }
}

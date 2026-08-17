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
    private readonly PaasProviderService _paas;

    public EnvironmentsController(SettingsService settings, GitHubApiService github, CloudStatusService cloud, PaasProviderService paas)
    {
        _settings = settings;
        _github = github;
        _cloud = cloud;
        _paas = paas;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var definitions = await _settings.GetEnvironmentDefinitionsAsync();
        var runs = await _github.GetWorkflowRuns();
        var workflows = await GetWorkflowsArrayAsync();

        var summaries = new List<EnvironmentSummaryDto>();

        foreach (var def in definitions)
            summaries.Add(await BuildSummaryAsync(def, runs, workflows));

        return Ok(summaries);
    }

    [HttpPost]
    public async Task<IActionResult> Save(EnvironmentDefinitionsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change the environment list", "environments") is IActionResult denied)
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
        var workflows = await GetWorkflowsArrayAsync();
        var summary = await BuildSummaryAsync(definition, runs, workflows);

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
            RenderServiceId = summary.RenderServiceId,
            CloudflareAccountId = summary.CloudflareAccountId,
            CloudflareProjectName = summary.CloudflareProjectName,
            NetlifySiteId = summary.NetlifySiteId,
            VercelProjectId = summary.VercelProjectId,
            LatestRunId = summary.LatestRunId,
            CommitSha = summary.CommitSha,
            CommitMessage = summary.CommitMessage,
            Branch = summary.Branch,
            Status = summary.Status,
            Conclusion = summary.Conclusion,
            DeployedAt = summary.DeployedAt,
            HtmlUrl = summary.HtmlUrl,
            AutoDetected = summary.AutoDetected,
            DetectionEvidence = summary.DetectionEvidence
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

        // Render/Cloudflare/Netlify/Vercel — resolved against THIS visitor's
        // own connected Hosting Provider account (see PaasProviderService/
        // UserPaasCredentials), the same "global resource id + per-visitor
        // session credential" pattern AWS/Azure already use above. Configured
        // reflects whether this visitor has connected that provider at all
        // (not whether the environment has a target configured - that's
        // definition.RenderServiceId etc, always global); a connected
        // provider whose account doesn't contain the saved target is a
        // distinct, clearer error than "not connected".
        if (definition.CloudProvider is "render" or "cloudflare" or "netlify" or "vercel")
        {
            var provider = definition.CloudProvider;
            var creds = await _settings.GetUserPaasCredentialsAsync(provider, key);

            if (!creds.IsConfigured)
                return Ok(new CloudStatusDto { Provider = provider, Configured = false });

            var paasStatus = await _paas.GetStatusAsync(provider, creds);

            if (!paasStatus.Found)
            {
                return Ok(new CloudStatusDto
                {
                    Provider = provider,
                    Configured = true,
                    Found = false,
                    Error = paasStatus.Error ?? $"Unable to reach {provider} right now."
                });
            }

            var wantedId = provider switch
            {
                "render" => definition.RenderServiceId,
                "cloudflare" => definition.CloudflareProjectName,
                "netlify" => definition.NetlifySiteId,
                "vercel" => definition.VercelProjectId,
                _ => null
            };

            var matched = paasStatus.Services.FirstOrDefault(s =>
                string.Equals(s.Id, wantedId, StringComparison.OrdinalIgnoreCase)
                || string.Equals(s.Name, wantedId, StringComparison.OrdinalIgnoreCase));

            if (matched == null)
            {
                return Ok(new CloudStatusDto
                {
                    Provider = provider,
                    Configured = true,
                    Found = false,
                    Error = string.IsNullOrWhiteSpace(wantedId)
                        ? "No target service configured for this environment yet."
                        : $"\"{wantedId}\" wasn't found under your connected {provider} account."
                });
            }

            var result = new CloudStatusDto { Provider = provider, Configured = true, Found = true, PaasService = matched };

            var metrics = await _paas.GetServiceMetricsAsync(provider, creds, matched.Id ?? matched.Name);
            result.Metrics = metrics.Series;

            return Ok(result);
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

        var workflows = await GetWorkflowsArrayAsync();
        var path = ResolveWorkflowPath(workflows, workflowName);

        if (path == null)
            return NotFound(new { message = $"No workflow named \"{workflowName}\" found in this repository." });

        var yaml = await _github.GetWorkflowYamlAsync(path, null);
        var detected = DeploymentTargetDetector.Detect(yaml);

        return Ok(detected);
    }

    // List()/GetDetail() now call this on every request (to power the
    // auto-detect fallback below) where before it only ran on an admin's
    // occasional manual "Detect from Pipeline" click — a failure here
    // (rate limit, transient GitHub hiccup, token issue) must never take
    // down the base environment list/detail response that worked fine
    // without it; null just means no auto-detected target this time,
    // exactly like TryDetectAsync's own quiet-failure contract below.
    private async Task<JArray?> GetWorkflowsArrayAsync()
    {
        try
        {
            var workflowsJson = await _github.GetWorkflows();
            return JObject.Parse(workflowsJson)["workflows"] as JArray;
        }
        catch
        {
            return null;
        }
    }

    private static string? ResolveWorkflowPath(JArray? workflows, string workflowName)
    {
        var match = workflows?.FirstOrDefault(w =>
            string.Equals(w["name"]?.ToString(), workflowName, StringComparison.OrdinalIgnoreCase));

        return match?["path"]?.ToString();
    }

    // Unlike DetectTarget above (an explicit, admin-triggered action that
    // should fail loudly with a 404 if the workflow can't be resolved),
    // auto-detection here is a quiet best-effort fallback for display only
    // — any failure to resolve the workflow or read its YAML just means no
    // auto-detected target is shown, not an error surfaced to whoever is
    // looking at the Dashboard.
    private async Task<DetectedDeploymentTargetDto?> TryDetectAsync(string workflowName, JArray? workflows)
    {
        if (string.IsNullOrWhiteSpace(workflowName))
            return null;

        var path = ResolveWorkflowPath(workflows, workflowName);

        if (path == null)
            return null;

        try
        {
            var yaml = await _github.GetWorkflowYamlAsync(path, null);
            return DeploymentTargetDetector.Detect(yaml);
        }
        catch
        {
            return null;
        }
    }

    // Builds the Dashboard/Environments list row: the definition's own
    // (possibly admin-configured) fields, its latest matching workflow run,
    // and — only when nothing has been explicitly configured — a live
    // fallback read of the workflow's own YAML via DeploymentTargetDetector,
    // so "how are they actually deploying" comes from the real pipeline
    // instead of staying "Not configured" forever just because nobody
    // clicked "Detect from Pipeline" and saved it.
    private async Task<EnvironmentSummaryDto> BuildSummaryAsync(EnvironmentDefinitionDto def, List<WorkflowDto> runs, JArray? workflows)
    {
        var latestRun = runs
            .Where(r => r.Name == def.WorkflowName)
            .OrderByDescending(r => r.CreatedAt)
            .FirstOrDefault();

        var summary = new EnvironmentSummaryDto
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
            RenderServiceId = def.RenderServiceId,
            CloudflareAccountId = def.CloudflareAccountId,
            CloudflareProjectName = def.CloudflareProjectName,
            NetlifySiteId = def.NetlifySiteId,
            VercelProjectId = def.VercelProjectId,

            LatestRunId = latestRun?.Id,
            CommitSha = latestRun?.CommitSha,
            CommitMessage = latestRun?.CommitMessage,
            Branch = latestRun?.Branch,
            Status = latestRun?.Status,
            Conclusion = latestRun?.Conclusion,
            DeployedAt = latestRun?.CreatedAt,
            HtmlUrl = latestRun?.HtmlUrl
        };

        if (summary.CloudProvider == "none")
        {
            var detected = await TryDetectAsync(def.WorkflowName, workflows);

            if (detected != null && detected.CloudProvider != "none")
            {
                summary.CloudProvider = detected.CloudProvider;
                summary.AwsRegion = detected.AwsRegion;
                summary.EcsCluster = detected.EcsCluster;
                summary.EcsService = detected.EcsService;
                summary.EcrRepository = detected.EcrRepository;
                summary.AzureResourceGroup = detected.AzureResourceGroup;
                summary.AzureWebAppName = detected.AzureWebAppName;
                summary.RenderServiceId = detected.RenderServiceId;
                summary.CloudflareAccountId = detected.CloudflareAccountId;
                summary.CloudflareProjectName = detected.CloudflareProjectName;
                summary.AutoDetected = true;
                summary.DetectionEvidence = detected.Evidence;
            }
        }

        return summary;
    }
}

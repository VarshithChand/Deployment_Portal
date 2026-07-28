using System.Text;
using System.Text.Json;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

public class DeploymentService
{
    private readonly GitHubAuthService _auth;
    private readonly NotificationService _notifications;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DeploymentService> _logger;

    public DeploymentService(
        GitHubAuthService auth,
        NotificationService notifications,
        IServiceScopeFactory scopeFactory,
        ILogger<DeploymentService> logger)
    {
        _auth = auth;
        _notifications = notifications;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task<DeployResultDto> DeployAsync(DeployDto request)
    {
        using var client = _auth.CreateClient();

        var triggeredAt = DateTime.UtcNow;

        // GitHub's workflow_dispatch endpoint takes a numeric workflow ID or the
        // workflow file's bare name (e.g. "admin.yml") — not the full repo-relative
        // path (".github/workflows/admin.yml") that the workflow list API returns
        // in its "path" field. Sending the full path 404s.
        var workflowId = NormalizeWorkflowId(request.Workflow);

        var url =
            $"https://api.github.com/repos/{_auth.Owner}/{_auth.Repository}/actions/workflows/{workflowId}/dispatches";

        var isCi = string.Equals(request.Mode, "CI", StringComparison.OrdinalIgnoreCase);

        // Whether a workflow takes inputs has nothing to do with its CI/CD
        // mode label (that's just a name-based bucket for the dropdown) — some
        // CI-classified workflows (e.g. a Docker image smoke test) declare
        // required workflow_dispatch inputs same as any CD workflow. Forward
        // whatever inputs the frontend actually built from that workflow's own
        // declared schema; only omit the key entirely when there are none, so
        // workflows with zero inputs don't get an empty object GitHub doesn't expect.
        var hasInputs = request.Inputs is { Count: > 0 };

        object body = hasInputs
            ? new { @ref = request.Branch, inputs = request.Inputs }
            : new { @ref = request.Branch };

        var json =
            JsonSerializer.Serialize(body);

        var response =
            await client.PostAsync(
                url,
                new StringContent(json, Encoding.UTF8, "application/json"));

        if (!response.IsSuccessStatusCode)
        {
            return new DeployResultDto
            {
                Success = false,
                Message = await HttpClientHelper.BuildFriendlyMessageAsync(response)
            };
        }

        var runId = await FindTriggeredRunIdAsync(client, workflowId, request.Branch, triggeredAt);

        await _notifications.NotifyDeployTriggered(request, runId);

        if (runId != null)
        {
            // Fire-and-forget: tracks the run to completion on its own schedule,
            // independent of this request's lifetime, using a fresh DI scope.
            _ = TrackRunCompletionAsync(request, runId.Value);
        }

        return new DeployResultDto
        {
            Success = true,
            Message = isCi ? "CI Run Triggered Successfully" : "Deployment Triggered Successfully",
            RunId = runId
        };
    }

    private async Task TrackRunCompletionAsync(DeployDto request, long runId)
    {
        using var scope = _scopeFactory.CreateScope();

        var github = scope.ServiceProvider.GetRequiredService<GitHubApiService>();
        var notifications = scope.ServiceProvider.GetRequiredService<NotificationService>();

        const int maxAttempts = 100;

        for (var attempt = 0; attempt < maxAttempts; attempt++)
        {
            await Task.Delay(5000);

            WorkflowDto? run;

            try
            {
                run = await github.GetWorkflowRun(runId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to poll run {RunId} for completion notification", runId);
                continue;
            }

            if (run?.Status == "completed")
            {
                await notifications.NotifyDeployCompleted(request, run);
                return;
            }
        }

        _logger.LogWarning("Gave up waiting for run {RunId} to complete after {Attempts} attempts", runId, maxAttempts);
    }

    // Accepts either the bare file name ("admin.yml"), the full repo-relative
    // path (".github/workflows/admin.yml"), or a numeric workflow ID — GitHub's
    // API only understands the first and third forms.
    private static string NormalizeWorkflowId(string workflow)
    {
        var lastSlash = workflow.LastIndexOf('/');
        return lastSlash >= 0 ? workflow[(lastSlash + 1)..] : workflow;
    }

    // GitHub's workflow_dispatch endpoint returns 204 with no run id, so we
    // poll the run list briefly afterward to find the run it just created.
    private async Task<long?> FindTriggeredRunIdAsync(
        HttpClient client,
        string workflow,
        string branch,
        DateTime triggeredAt)
    {
        var url =
            $"https://api.github.com/repos/{_auth.Owner}/{_auth.Repository}/actions/workflows/{workflow}/runs" +
            $"?branch={Uri.EscapeDataString(branch)}&event=workflow_dispatch&per_page=5";

        for (var attempt = 0; attempt < 5; attempt++)
        {
            await Task.Delay(1000);

            var json = await HttpClientHelper.GetAsync(client, url);
            var runs = JObject.Parse(json)["workflow_runs"] as JArray;

            var match = runs?
                .Where(r => DateTime.TryParse(r["created_at"]?.ToString(), out var createdAt)
                            && createdAt.ToUniversalTime() >= triggeredAt.AddSeconds(-5))
                .OrderByDescending(r => (string?)r["created_at"])
                .FirstOrDefault();

            if (match != null)
                return (long?)match["id"];
        }

        return null;
    }
}
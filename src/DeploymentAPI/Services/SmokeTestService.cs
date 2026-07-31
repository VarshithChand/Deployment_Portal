using System.Text;
using System.Text.Json;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Triggers and reports on the dedicated smoke-tests.yml workflow (see
// .github/workflows/smoke-tests.yml) - three independent jobs (Backend/
// Frontend/Database), each verifying its own piece of the stack actually
// works end to end. Mirrors DeploymentService's dispatch-then-poll-for-
// the-new-run-id pattern, since GitHub's dispatch endpoint itself returns
// no run id.
public class SmokeTestService
{
    // Bare workflow file name, not the full ".github/workflows/..." path -
    // same requirement as every other dispatch call in this app (see
    // DeploymentService.NormalizeWorkflowId).
    private const string WorkflowFile = "smoke-tests.yml";

    private readonly GitHubAuthService _auth;
    private readonly GitHubApiService _github;

    public SmokeTestService(GitHubAuthService auth, GitHubApiService github)
    {
        _auth = auth;
        _github = github;
    }

    public async Task<SmokeTestResultDto> RunAsync()
    {
        using var client = _auth.CreateClient();

        var triggeredAt = DateTime.UtcNow;
        var defaultBranch = await GetDefaultBranchAsync();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}" +
            $"/actions/workflows/{WorkflowFile}/dispatches";

        var json = JsonSerializer.Serialize(new { @ref = defaultBranch });

        var response = await client.PostAsync(url, new StringContent(json, Encoding.UTF8, "application/json"));

        if (!response.IsSuccessStatusCode)
        {
            return new SmokeTestResultDto
            {
                Status = "error",
                Conclusion = await HttpClientHelper.BuildFriendlyMessageAsync(response)
            };
        }

        var runId = await FindTriggeredRunIdAsync(client, defaultBranch, triggeredAt);

        return runId == null
            ? new SmokeTestResultDto { Status = "queued" }
            : await GetRunStatusAsync(runId.Value);
    }

    public async Task<SmokeTestResultDto> GetRunStatusAsync(long runId)
    {
        var run = await _github.GetWorkflowRun(runId);

        if (run == null)
            return new SmokeTestResultDto { RunId = runId, Status = "not_run" };

        var jobs = await _github.GetWorkflowRunJobsAsync(runId);

        return new SmokeTestResultDto
        {
            RunId = run.Id,
            Status = run.Status,
            Conclusion = string.IsNullOrEmpty(run.Conclusion) ? null : run.Conclusion,
            HtmlUrl = run.HtmlUrl,
            CreatedAt = run.CreatedAt,
            Jobs = jobs.Select(j => new SmokeTestJobDto
            {
                Name = j.Name,
                Status = j.Status,
                Conclusion = j.Conclusion,
                HtmlUrl = j.HtmlUrl,
                StartedAt = j.StartedAt,
                CompletedAt = j.CompletedAt
            }).ToList()
        };
    }

    // The most recent run of this workflow, whether it was triggered from
    // this portal or by the workflow's own "push to master" trigger -
    // what the Smoke Tests page shows on load, before anyone clicks
    // "Re-run".
    public async Task<SmokeTestResultDto> GetLatestAsync()
    {
        using var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}" +
            $"/actions/workflows/{WorkflowFile}/runs?per_page=1";

        var json = await HttpClientHelper.GetAsync(client, url);
        var runs = JObject.Parse(json)["workflow_runs"] as JArray;

        var runId = (long?)runs?.FirstOrDefault()?["id"];

        return runId == null
            ? new SmokeTestResultDto { Status = "not_run" }
            : await GetRunStatusAsync(runId.Value);
    }

    private async Task<string> GetDefaultBranchAsync()
    {
        var repoJson = await _github.GetRepository();
        return JObject.Parse(repoJson)["default_branch"]?.ToString() ?? "main";
    }

    // GitHub's workflow_dispatch endpoint returns 204 with no run id, so we
    // poll the run list briefly afterward to find the run it just created -
    // same approach as DeploymentService.FindTriggeredRunIdAsync.
    private async Task<long?> FindTriggeredRunIdAsync(HttpClient client, string branch, DateTime triggeredAt)
    {
        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}" +
            $"/actions/workflows/{WorkflowFile}/runs" +
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

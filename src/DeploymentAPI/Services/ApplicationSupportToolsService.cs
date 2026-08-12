using System.Text.Json;
using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Backs both Application Support's plain REST endpoints (see
// ApplicationSupportController) AND Deployment Support Copilot's tool
// calls - one source of truth for "what is the real application/version/
// deployment/health state," so the AI path and the plain-UI path can never
// disagree. This is a deliberately narrow, separate tool set from
// AiToolsService (Deployment Copilot's own GitHub/AWS/database tools) -
// Deployment Support Copilot only ever needs version/deployment/health/
// user-version information, nothing else, matching the spec's "only give
// it what's needed for this admin-only diagnostic assistant."
public class ApplicationSupportToolsService
{
    private readonly SettingsService _settings;
    private readonly GitHubApiService _github;
    private readonly GitHubAuthService _githubAuth;
    private readonly SessionActivityService _activity;
    private readonly ApplicationBuildInfoService _buildInfo;

    public ApplicationSupportToolsService(
        SettingsService settings,
        GitHubApiService github,
        GitHubAuthService githubAuth,
        SessionActivityService activity,
        ApplicationBuildInfoService buildInfo)
    {
        _settings = settings;
        _github = github;
        _githubAuth = githubAuth;
        _activity = activity;
        _buildInfo = buildInfo;
    }

    public ApplicationVersionDto GetVersion() => new()
    {
        Environment = _buildInfo.Environment,
        BackendCommit = _buildInfo.Commit,
        BackendVersion = _buildInfo.Version,
        BackendStartedAtUtc = _buildInfo.StartedAtUtc
    };

    public async Task<ApplicationHealthDto> GetHealthAsync()
    {
        var dbHealth = await _settings.CheckDatabaseHealthAsync();

        return new ApplicationHealthDto
        {
            BackendHealthy = true,
            DatabaseHealthy = dbHealth.Healthy,
            DatabaseMode = dbHealth.Mode,
            DatabaseError = dbHealth.Error,
            DatabaseResponseTimeMs = dbHealth.ResponseTimeMs,
            GitHubConfigured = _githubAuth.HasToken
        };
    }

    // The named-"Production" environment's (or, absent one, the first
    // configured environment's) latest workflow run - the exact same
    // "environment definition -> latest run of its workflow" derivation
    // EnvironmentsController.BuildSummary already does, reused here rather
    // than reinvented (section 16 of the spec: "if existing GitHub
    // integration provides workflow information, allow the admin to see
    // it" - not a new concept).
    public async Task<LatestDeploymentDto> GetLatestDeploymentAsync()
    {
        var definitions = await _settings.GetEnvironmentDefinitionsAsync();

        if (definitions.Count == 0)
            return new LatestDeploymentDto();

        var target = definitions.FirstOrDefault(d => string.Equals(d.Name, "production", StringComparison.OrdinalIgnoreCase))
            ?? definitions[0];

        if (!_githubAuth.HasToken)
            return new LatestDeploymentDto { EnvironmentName = target.Name, WorkflowName = target.WorkflowName };

        var runs = await _github.GetWorkflowRuns();

        var latest = runs
            .Where(r => r.Name == target.WorkflowName)
            .OrderByDescending(r => r.CreatedAt)
            .FirstOrDefault();

        return new LatestDeploymentDto
        {
            EnvironmentName = target.Name,
            WorkflowName = target.WorkflowName,
            RunId = latest?.Id,
            RunNumber = latest?.RunNumber,
            Branch = latest?.Branch,
            CommitSha = latest?.CommitSha,
            Status = latest?.Status,
            Conclusion = latest?.Conclusion,
            StartedAtUtc = latest?.CreatedAt,
            HtmlUrl = latest?.HtmlUrl
        };
    }

    // Every PAT user plus the frontend build their browser last reported
    // (see SessionActivityService.GetFrontendBuild) - same enrichment
    // AdminUsersController.GetAll() does for the plain Users tab, kept
    // here too since Application Support's own "User Versions" view reads
    // from this service, not that controller.
    public async Task<List<PatUserSummaryDto>> GetConnectedUserVersionsAsync()
    {
        var users = await _settings.GetPatUsersAsync();

        foreach (var user in users)
        {
            user.LastActiveUtc = _activity.GetLastSeen(user.Key);

            var frontendBuild = _activity.GetFrontendBuild(user.Key);
            user.FrontendCommit = frontendBuild?.Commit;
            user.FrontendVersion = frontendBuild?.Version;
            user.FrontendEnvironment = frontendBuild?.Environment;
            user.FrontendLastSeenUtc = frontendBuild?.ReportedAtUtc;
        }

        return users;
    }

    private static readonly Dictionary<string, object> EmptyObjectSchema = new()
    {
        ["type"] = "object",
        ["properties"] = new Dictionary<string, object>()
    };

    public List<AiToolDefinition> GetToolDefinitions() => new()
    {
        new("get_application_version",
            "Get the currently running backend's real commit/version/environment/start time.",
            EmptyObjectSchema),

        new("get_application_health",
            "Check whether the backend, database, and GitHub connection are currently healthy.",
            EmptyObjectSchema),

        new("get_latest_deployment",
            "Get the production environment's latest GitHub Actions deployment workflow run - status, commit, branch, run number, and timing.",
            EmptyObjectSchema),

        new("list_connected_user_versions",
            "List every connected user/session and which frontend build (commit/version) their browser last reported, to spot outdated or mismatched clients.",
            EmptyObjectSchema),

        new("get_user_frontend_version",
            "Look up which frontend build one specific user is running, by their GitHub username (the PAT owner login).",
            new Dictionary<string, object>
            {
                ["type"] = "object",
                ["properties"] = new Dictionary<string, object>
                {
                    ["username"] = new Dictionary<string, object> { ["type"] = "string", ["description"] = "GitHub username (PAT owner login)." }
                },
                ["required"] = new[] { "username" }
            })
    };

    public async Task<string> ExecuteToolAsync(string name, string argsJson)
    {
        try
        {
            switch (name)
            {
                case "get_application_version":
                    return Serialize(GetVersion());

                case "get_application_health":
                    return Serialize(await GetHealthAsync());

                case "get_latest_deployment":
                    return Serialize(await GetLatestDeploymentAsync());

                case "list_connected_user_versions":
                {
                    var users = await GetConnectedUserVersionsAsync();

                    return Serialize(users.Select(u => new
                    {
                        u.PatOwnerLogin,
                        u.FrontendCommit,
                        u.FrontendVersion,
                        u.FrontendEnvironment,
                        u.FrontendLastSeenUtc,
                        u.LastActiveUtc
                    }));
                }

                case "get_user_frontend_version":
                {
                    var args = string.IsNullOrWhiteSpace(argsJson) ? default : JsonDocument.Parse(argsJson).RootElement;
                    var username = args.ValueKind == JsonValueKind.Object && args.TryGetProperty("username", out var u)
                        ? u.GetString()
                        : null;

                    if (string.IsNullOrWhiteSpace(username))
                        return Serialize(new { error = "username is required." });

                    var users = await GetConnectedUserVersionsAsync();
                    var match = users.FirstOrDefault(x => string.Equals(x.PatOwnerLogin, username, StringComparison.OrdinalIgnoreCase));

                    if (match == null)
                        return Serialize(new { error = $"No connected user found with GitHub username '{username}'." });

                    return Serialize(new
                    {
                        match.PatOwnerLogin,
                        match.FrontendCommit,
                        match.FrontendVersion,
                        match.FrontendEnvironment,
                        match.FrontendLastSeenUtc,
                        match.LastActiveUtc
                    });
                }

                default:
                    return Serialize(new { error = $"Unknown tool '{name}'." });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Support Copilot tool:{name}] {ex}");
            return Serialize(new { error = "Unable to retrieve that information right now." });
        }
    }

    private static string Serialize(object value) =>
        JsonSerializer.Serialize(value, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
}

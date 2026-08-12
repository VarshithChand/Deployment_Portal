using System.Text.Json;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;

namespace DeploymentAPI.Services;

// Deployment Copilot's "controlled tools" (section 9/10 of the spec) - the
// only way any AI request ever touches real portal data. Every method here
// reuses an EXISTING, already-permission-scoped service rather than a
// second GitHub/AWS API layer:
//
// - GitHub tools go through GitHubApiService, which is itself built on
//   GitHubAuthService - Scoped per request, already resolved to THIS
//   session's own configured repo/token (see GitHubAuthService.LoadAsync,
//   run by middleware before any controller executes). There is no way for
//   a tool call here to see a repository this session didn't already
//   configure - the AI can't bypass that any more than the Dashboard can.
// - AWS tools go through CloudStatusService/CloudServiceManagementService
//   with THIS session's own UserAwsCredentials, exactly like
//   CloudServicesController resolves them - same permission boundary as
//   the Cloud Services page itself.
// - The database tools are additionally gated on IsSuperAdmin, mirroring
//   AdminGate.DenyUnlessSuperAdminAsync - they're simply not present in
//   GetToolDefinitions for anyone else, so Gemini never even learns they
//   exist for that caller, let alone gets a chance to call them.
//
// Every tool returns a small, deliberately-trimmed JSON string (never a
// raw DTO dump) - see section 23's "don't send hundreds of rows" rule.
public class AiToolsService
{
    private const int DefaultListLimit = 10;
    private const int MaxListLimit = 25;

    private readonly SettingsService _settings;
    private readonly GitHubAuthService _githubAuth;
    private readonly GitHubApiService _github;
    private readonly CloudStatusService _cloud;
    private readonly CloudServiceManagementService _cloudManagement;
    private readonly DatabaseManagementService _database;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public AiToolsService(
        SettingsService settings,
        GitHubAuthService githubAuth,
        GitHubApiService github,
        CloudStatusService cloud,
        CloudServiceManagementService cloudManagement,
        DatabaseManagementService database,
        IHttpContextAccessor httpContextAccessor)
    {
        _settings = settings;
        _githubAuth = githubAuth;
        _github = github;
        _cloud = cloud;
        _cloudManagement = cloudManagement;
        _database = database;
        _httpContextAccessor = httpContextAccessor;
    }

    private static readonly JsonObject EmptyObjectSchema = new() { ["type"] = "object", ["properties"] = new object() };

    private class JsonObject : Dictionary<string, object>
    {
    }

    public List<AiToolDefinition> GetToolDefinitions(bool includeDatabaseTools)
    {
        var tools = new List<AiToolDefinition>
        {
            new("get_repository_info",
                "Get the GitHub repository currently configured for this session (owner/name) and whether a GitHub token is connected.",
                EmptyObjectSchema),

            new("get_workflow_runs",
                "List the most recent GitHub Actions workflow runs for the configured repository, optionally filtered by status.",
                new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["limit"] = new JsonObject { ["type"] = "integer", ["description"] = "Max runs to return, default 10, max 25." },
                        ["status"] = new JsonObject { ["type"] = "string", ["description"] = "Filter: 'success', 'failure', 'in_progress', 'queued', 'cancelled', or 'any' (default)." }
                    }
                }),

            new("get_workflow_run_detail",
                "Get full detail for one workflow run by its numeric ID, including which job/step failed and the actual error messages if it failed. Use this to answer 'why did my deployment/workflow fail'.",
                new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["runId"] = new JsonObject { ["type"] = "integer", ["description"] = "The workflow run ID." }
                    },
                    ["required"] = new[] { "runId" }
                }),

            new("get_pull_requests",
                "List pull requests for the configured repository.",
                new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["state"] = new JsonObject { ["type"] = "string", ["description"] = "'open' (default) or 'history' for closed/merged." },
                        ["limit"] = new JsonObject { ["type"] = "integer", ["description"] = "Max PRs to return, default 10, max 25." }
                    }
                }),

            new("get_pending_approvals",
                "List workflow runs currently waiting on a protected-environment approval gate.",
                EmptyObjectSchema),

            new("get_artifacts",
                "List recent build artifacts from GitHub Actions runs.",
                new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["limit"] = new JsonObject { ["type"] = "integer", ["description"] = "Max artifacts to return, default 10, max 25." }
                    }
                }),

            new("get_environments",
                "List the portal's configured deployment environments (e.g. Production, Staging) and each one's latest deployment status.",
                EmptyObjectSchema),

            new("get_environment_cloud_status",
                "Get live AWS/Azure status (ECS service task counts, ECR images, or Azure Web App state) for one named environment.",
                new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["name"] = new JsonObject { ["type"] = "string", ["description"] = "The environment's name, exactly as configured." }
                    },
                    ["required"] = new[] { "name" }
                }),

            new("get_aws_overview",
                "Get an account-wide summary of which AWS services this session's credentials have resources in, and how many (EC2, ECR, VPC, S3, Lambda, Route53, SNS, and others).",
                EmptyObjectSchema),

            new("get_ec2_instances",
                "List EC2 instances, optionally filtered by state.",
                new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["state"] = new JsonObject { ["type"] = "string", ["description"] = "'running', 'stopped', or 'all' (default)." }
                    }
                }),

            new("get_ecs_clusters",
                "List ECS clusters and their services, including running/desired task counts and which services are stopped.",
                EmptyObjectSchema),

            new("get_ecr_repositories",
                "List ECR container repositories.",
                new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["limit"] = new JsonObject { ["type"] = "integer", ["description"] = "Max repositories to return, default 10, max 25." }
                    }
                }),

            new("get_lambda_functions",
                "List Lambda functions.",
                new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["limit"] = new JsonObject { ["type"] = "integer", ["description"] = "Max functions to return, default 10, max 25." }
                    }
                }),

            new("get_rds_instances",
                "List RDS database instances.",
                new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["limit"] = new JsonObject { ["type"] = "integer", ["description"] = "Max instances to return, default 10, max 25." }
                    }
                })
        };

        if (includeDatabaseTools)
        {
            tools.Add(new("get_database_health",
                "Check whether the portal's own PostgreSQL database is connected and healthy, and get its version/size/table count.",
                EmptyObjectSchema));

            tools.Add(new("get_database_tables",
                "List tables in the portal's own PostgreSQL database.",
                new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["limit"] = new JsonObject { ["type"] = "integer", ["description"] = "Max tables to return, default 10, max 25." }
                    }
                }));
        }

        return tools;
    }

    public async Task<string> ExecuteToolAsync(string name, string argsJson, bool isSuperAdmin)
    {
        JsonElement args;

        try
        {
            args = string.IsNullOrWhiteSpace(argsJson) || argsJson == "null"
                ? default
                : JsonDocument.Parse(argsJson).RootElement;
        }
        catch (JsonException)
        {
            args = default;
        }

        try
        {
            return name switch
            {
                "get_repository_info" => Serialize(GetRepositoryInfo()),
                "get_workflow_runs" => Serialize(await GetWorkflowRunsAsync(args)),
                "get_workflow_run_detail" => Serialize(await GetWorkflowRunDetailAsync(args)),
                "get_pull_requests" => Serialize(await GetPullRequestsAsync(args)),
                "get_pending_approvals" => Serialize(await GetPendingApprovalsAsync()),
                "get_artifacts" => Serialize(await GetArtifactsAsync(args)),
                "get_environments" => Serialize(await GetEnvironmentsAsync()),
                "get_environment_cloud_status" => Serialize(await GetEnvironmentCloudStatusAsync(args)),
                "get_aws_overview" => Serialize(await GetAwsOverviewAsync()),
                "get_ec2_instances" => Serialize(await GetEc2InstancesAsync(args)),
                "get_ecs_clusters" => Serialize(await GetEcsClustersAsync()),
                "get_ecr_repositories" => Serialize(await GetEcrRepositoriesAsync(args)),
                "get_lambda_functions" => Serialize(await GetLambdaFunctionsAsync(args)),
                "get_rds_instances" => Serialize(await GetRdsInstancesAsync(args)),

                "get_database_health" when isSuperAdmin => Serialize(await _database.GetHealthAsync()),
                "get_database_tables" when isSuperAdmin => Serialize(await GetDatabaseTablesAsync(args)),
                "get_database_health" or "get_database_tables" =>
                    Serialize(new { error = "You don't have access to database information." }),

                _ => Serialize(new { error = $"Unknown tool '{name}'." })
            };
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Copilot tool:{name}] {ex}");
            return Serialize(new { error = "Unable to retrieve that information right now." });
        }
    }

    // ---- GitHub -----------------------------------------------------

    private object GetRepositoryInfo() => new
    {
        configured = _githubAuth.HasToken && !string.IsNullOrWhiteSpace(_githubAuth.Owner),
        owner = _githubAuth.Owner,
        repository = _githubAuth.Repository,
        githubTokenConnected = _githubAuth.HasToken
    };

    private async Task<object> GetWorkflowRunsAsync(JsonElement args)
    {
        if (!_githubAuth.HasToken)
            return new { error = "No GitHub repository is configured for this session." };

        var limit = GetIntArg(args, "limit", DefaultListLimit);
        var status = GetStringArg(args, "status", "any")?.ToLowerInvariant();

        var runs = await _github.GetWorkflowRuns();

        var filtered = status is null or "any"
            ? runs
            : runs.Where(r =>
                string.Equals(r.Status, status, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(r.Conclusion, status, StringComparison.OrdinalIgnoreCase)).ToList();

        return filtered
            .OrderByDescending(r => r.CreatedAt)
            .Take(limit)
            .Select(r => new
            {
                r.Id,
                r.Name,
                r.Branch,
                r.Status,
                r.Conclusion,
                r.CreatedAt,
                commitMessage = Truncate(r.CommitMessage, 120),
                r.HtmlUrl
            });
    }

    private async Task<object> GetWorkflowRunDetailAsync(JsonElement args)
    {
        if (!_githubAuth.HasToken)
            return new { error = "No GitHub repository is configured for this session." };

        var runId = GetLongArg(args, "runId", 0);

        if (runId == 0)
            return new { error = "runId is required." };

        var run = await _github.GetWorkflowRun(runId);

        if (run == null)
            return new { error = $"No workflow run found with ID {runId}." };

        object? failedJobs = null;

        if (string.Equals(run.Conclusion, "failure", StringComparison.OrdinalIgnoreCase)
            || string.Equals(run.Conclusion, "cancelled", StringComparison.OrdinalIgnoreCase))
        {
            var errors = await _github.GetWorkflowRunErrorsAsync(runId);

            failedJobs = errors.Select(e => new
            {
                e.JobName,
                e.FailedStep,
                e.Conclusion,
                messages = e.Messages.Take(5)
            });
        }

        return new
        {
            run.Id,
            run.Name,
            run.Branch,
            run.Status,
            run.Conclusion,
            run.CreatedAt,
            commitMessage = Truncate(run.CommitMessage, 200),
            run.CommitSha,
            run.HtmlUrl,
            failedJobs
        };
    }

    private async Task<object> GetPullRequestsAsync(JsonElement args)
    {
        if (!_githubAuth.HasToken)
            return new { error = "No GitHub repository is configured for this session." };

        var limit = GetIntArg(args, "limit", DefaultListLimit);
        var state = GetStringArg(args, "state", "open");

        var prs = string.Equals(state, "history", StringComparison.OrdinalIgnoreCase)
            ? await _github.GetPullRequestHistoryAsync()
            : await _github.GetOpenPullRequestsAsync();

        return prs
            .OrderByDescending(p => p.CreatedAt)
            .Take(limit)
            .Select(p => new
            {
                p.Number,
                title = Truncate(p.Title, 120),
                p.Author,
                p.HeadBranch,
                p.BaseBranch,
                p.Draft,
                p.CreatedAt,
                merged = p.MergedAt != null,
                p.HtmlUrl
            });
    }

    private async Task<object> GetPendingApprovalsAsync()
    {
        if (!_githubAuth.HasToken)
            return new { error = "No GitHub repository is configured for this session." };

        var approvals = await _github.GetPendingApprovalsAsync();

        return approvals.Select(a => new
        {
            a.RunId,
            a.WorkflowName,
            a.Branch,
            a.TriggeredBy,
            a.CreatedAt,
            environments = a.Environments.Select(e => e.Name)
        });
    }

    private async Task<object> GetArtifactsAsync(JsonElement args)
    {
        if (!_githubAuth.HasToken)
            return new { error = "No GitHub repository is configured for this session." };

        var limit = GetIntArg(args, "limit", DefaultListLimit);
        var artifacts = await _github.GetArtifacts();

        return artifacts
            .OrderByDescending(a => a.CreatedAt)
            .Take(limit)
            .Select(a => new
            {
                a.Name,
                a.Size,
                a.Expired,
                a.CreatedAt,
                a.Branch,
                commitMessage = Truncate(a.CommitMessage, 120)
            });
    }

    // ---- Environments -------------------------------------------------

    private async Task<object> GetEnvironmentsAsync()
    {
        var definitions = await _settings.GetEnvironmentDefinitionsAsync();

        List<WorkflowDto> runs;

        try
        {
            runs = _githubAuth.HasToken ? await _github.GetWorkflowRuns() : new List<WorkflowDto>();
        }
        catch
        {
            runs = new List<WorkflowDto>();
        }

        return definitions.Select(def =>
        {
            var latestRun = runs
                .Where(r => r.Name == def.WorkflowName)
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefault();

            return new
            {
                def.Name,
                def.CloudProvider,
                def.WorkflowName,
                status = latestRun?.Status,
                conclusion = latestRun?.Conclusion,
                branch = latestRun?.Branch,
                deployedAt = latestRun?.CreatedAt
            };
        });
    }

    private async Task<object> GetEnvironmentCloudStatusAsync(JsonElement args)
    {
        var name = GetStringArg(args, "name", null);

        if (string.IsNullOrWhiteSpace(name))
            return new { error = "name is required." };

        var definitions = await _settings.GetEnvironmentDefinitionsAsync();
        var definition = definitions.FirstOrDefault(d => string.Equals(d.Name, name, StringComparison.OrdinalIgnoreCase));

        if (definition == null)
            return new { error = $"No environment named '{name}' is configured." };

        var key = SessionKey();

        if (definition.CloudProvider == "aws")
        {
            var creds = await _settings.GetUserAwsCredentialsAsync(key);

            if (!creds.IsConfigured)
                return new { error = "AWS credentials are not configured for this session." };

            var status = await _cloud.GetEcsAndEcrStatusAsync(
                creds, definition.AwsRegion, definition.EcsCluster, definition.EcsService, definition.EcrRepository);

            return new
            {
                provider = "aws",
                status.Found,
                status.Error,
                ecsStatus = status.EcsStatus,
                status.DesiredCount,
                status.RunningCount,
                ecrImageCount = status.EcrImages.Count
            };
        }

        if (definition.CloudProvider == "azure")
        {
            var creds = await _settings.GetUserAzureCredentialsAsync(key);

            if (!creds.IsConfigured)
                return new { error = "Azure credentials are not configured for this session." };

            var status = await _cloud.GetAzureWebAppStatusAsync(
                creds, definition.AzureSubscriptionId, definition.AzureResourceGroup, definition.AzureWebAppName);

            return new { provider = "azure", status.Found, status.Error, state = status.AzureState };
        }

        return new { error = $"Environment '{name}' has no cloud provider configured." };
    }

    // ---- AWS ------------------------------------------------------------

    private async Task<UserAwsCredentials> AwsCredsAsync() => await _settings.GetUserAwsCredentialsAsync(SessionKey());

    private string SessionKey() => PortalIdentity.GetOrCreateKey(_httpContextAccessor.HttpContext!);

    private async Task<object> GetAwsOverviewAsync()
    {
        var creds = await AwsCredsAsync();

        if (!creds.IsConfigured)
            return new { configured = false, message = "AWS credentials are not configured for this session." };

        var inventory = await _cloud.GetAwsResourceInventoryAsync(creds, null);

        object Summarize(AwsServiceStatusDto s) => new { s.Found, s.Error, s.Count };

        return new
        {
            configured = inventory.Configured,
            inventory.Region,
            ec2 = Summarize(inventory.Ec2),
            ecr = Summarize(inventory.Ecr),
            vpc = Summarize(inventory.Vpc),
            s3 = Summarize(inventory.S3),
            lambda = Summarize(inventory.Lambda),
            route53 = Summarize(inventory.Route53),
            sns = Summarize(inventory.Sns),
            other = inventory.Other.Take(15).Select(o => new { o.Label, o.Count }),
            inventory.OtherError
        };
    }

    private async Task<object> GetEc2InstancesAsync(JsonElement args)
    {
        var creds = await AwsCredsAsync();

        if (!creds.IsConfigured)
            return new { configured = false, message = "AWS credentials are not configured for this session." };

        var state = GetStringArg(args, "state", "all")?.ToLowerInvariant();
        var detail = await _cloud.GetEc2DetailAsync(creds, null);

        if (detail.Error != null)
            return new { detail.Configured, detail.Error };

        var instances = state switch
        {
            "running" => detail.Instances.Where(i => string.Equals(i.State, "running", StringComparison.OrdinalIgnoreCase)),
            "stopped" => detail.Instances.Where(i => string.Equals(i.State, "stopped", StringComparison.OrdinalIgnoreCase)),
            _ => detail.Instances.AsEnumerable()
        };

        return new
        {
            detail.Configured,
            detail.RunningCount,
            detail.StoppedCount,
            instances = instances.Take(MaxListLimit).Select(i => new { i.Name, i.InstanceId, i.InstanceType, i.State })
        };
    }

    private async Task<object> GetEcsClustersAsync()
    {
        var creds = await AwsCredsAsync();

        if (!creds.IsConfigured)
            return new { configured = false, message = "AWS credentials are not configured for this session." };

        var detail = await _cloud.GetEcsDetailAsync(creds, null);

        if (detail.Error != null)
            return new { detail.Configured, detail.Error };

        return new
        {
            detail.Configured,
            clusters = detail.Clusters.Select(c => new
            {
                c.ClusterName,
                c.Status,
                services = c.Services.Select(s => new { s.ServiceName, s.Status, s.RunningCount })
            })
        };
    }

    private async Task<object> GetEcrRepositoriesAsync(JsonElement args)
    {
        var creds = await AwsCredsAsync();

        if (!creds.IsConfigured)
            return new { configured = false, message = "AWS credentials are not configured for this session." };

        var limit = GetIntArg(args, "limit", DefaultListLimit);
        var list = await _cloudManagement.GetEcrRepositoriesAsync(creds, null);

        if (list.Error != null)
            return new { list.Configured, list.Error };

        return new
        {
            list.Configured,
            totalCount = list.Repositories.Count,
            repositories = list.Repositories.Take(limit).Select(r => new { r.Name, r.ImageCount, r.LatestPushedAt })
        };
    }

    private async Task<object> GetLambdaFunctionsAsync(JsonElement args)
    {
        var creds = await AwsCredsAsync();

        if (!creds.IsConfigured)
            return new { configured = false, message = "AWS credentials are not configured for this session." };

        var limit = GetIntArg(args, "limit", DefaultListLimit);
        var list = await _cloudManagement.GetLambdaFunctionsAsync(creds, null);

        if (list.Error != null)
            return new { list.Configured, list.Error };

        return new
        {
            list.Configured,
            totalCount = list.Functions.Count,
            functions = list.Functions.Take(limit).Select(f => new { f.Name, f.Runtime, f.LastModified })
        };
    }

    private async Task<object> GetRdsInstancesAsync(JsonElement args)
    {
        var creds = await AwsCredsAsync();

        if (!creds.IsConfigured)
            return new { configured = false, message = "AWS credentials are not configured for this session." };

        var limit = GetIntArg(args, "limit", DefaultListLimit);
        var list = await _cloudManagement.GetRdsInstancesAsync(creds, null);

        if (list.Error != null)
            return new { list.Configured, list.Error };

        return new
        {
            list.Configured,
            totalCount = list.Instances.Count,
            instances = list.Instances.Take(limit).Select(i => new { i.Identifier, i.Engine, i.Status, i.InstanceClass })
        };
    }

    // ---- Database (super-admin only, see ExecuteToolAsync) --------------

    private async Task<object> GetDatabaseTablesAsync(JsonElement args)
    {
        var limit = GetIntArg(args, "limit", DefaultListLimit);
        var list = await _database.GetTablesAsync("public");

        return new
        {
            totalCount = list.Tables.Count,
            tables = list.Tables.Take(limit).Select(t => new { t.Name, t.ApproxRowCount, t.ColumnCount })
        };
    }

    // ---- helpers ----------------------------------------------------

    private static string Serialize(object value) =>
        JsonSerializer.Serialize(value, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

    private static int GetIntArg(JsonElement args, string name, int fallback)
    {
        if (args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number)
            return Math.Clamp(value.GetInt32(), 1, MaxListLimit);

        return fallback;
    }

    private static long GetLongArg(JsonElement args, string name, long fallback)
    {
        if (args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number)
            return value.GetInt64();

        return fallback;
    }

    private static string? GetStringArg(JsonElement args, string name, string? fallback)
    {
        if (args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String)
            return value.GetString();

        return fallback;
    }

    private static string Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Length <= maxLength ? value : value[..maxLength] + "...";
    }
}

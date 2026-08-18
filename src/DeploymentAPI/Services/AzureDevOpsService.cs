using System.Net.Http.Headers;
using System.Text;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Azure DevOps' REST API authenticates with plain HTTP Basic auth - an
// empty username, the PAT as the password - the standard, documented way
// most tools (including CI systems) talk to it, distinct from Azure
// Resource Manager's AAD-token model this app's other Azure integrations
// (ACR, Web App status) use. Same "raw HttpClient, not a vendor SDK"
// convention this app already follows for every PaaS/registry integration.
// Never throws to the caller - a bad/missing credential, or Azure DevOps
// itself hiccuping, comes back as a friendly Configured/Error result
// instead of a 500, same contract every other browse method in this app
// uses.
public class AzureDevOpsService
{
    private static readonly HttpClient DevOpsHttpClient = new();
    private static readonly HttpClient FeedsHttpClient = new();

    private static AuthenticationHeaderValue BuildAuth(string token) =>
        new("Basic", Convert.ToBase64String(Encoding.ASCII.GetBytes($":{token}")));

    private static async Task<string> GetAsync(HttpClient client, string baseUrl, string organization, string urlPath, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}{Uri.EscapeDataString(organization)}{urlPath}");
        request.Headers.Authorization = BuildAuth(token);

        var response = await client.SendAsync(request);
        await HttpClientHelper.EnsureSuccessAsync(response);

        return await response.Content.ReadAsStringAsync();
    }

    private static Task<string> GetDevOpsAsync(string organization, string token, string urlPath) =>
        GetAsync(DevOpsHttpClient, "https://dev.azure.com/", organization, urlPath, token);

    private static Task<string> GetFeedsAsync(string organization, string token, string urlPath) =>
        GetAsync(FeedsHttpClient, "https://feeds.dev.azure.com/", organization, urlPath, token);

    // ================= Projects (Pipelines/Build Artifacts picker) =================

    public async Task<AzureDevOpsProjectListDto> GetProjectsAsync(UserPaasCredentials credentials)
    {
        var result = new AzureDevOpsProjectListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var json = await GetDevOpsAsync(credentials.AccountId!, credentials.Token!, "/_apis/projects?api-version=7.1");
            var projects = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Projects = projects.Select(p => new AzureDevOpsProjectDto
            {
                Id = p["id"]?.ToString() ?? string.Empty,
                Name = p["name"]?.ToString() ?? string.Empty
            })
            .OrderBy(p => p.Name)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "project list");
        }

        return result;
    }

    // ================= Branches: repositories -> branches =================

    public async Task<AzureDevOpsRepositoryListDto> GetRepositoriesAsync(UserPaasCredentials credentials)
    {
        var result = new AzureDevOpsRepositoryListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var json = await GetDevOpsAsync(credentials.AccountId!, credentials.Token!, "/_apis/git/repositories?api-version=7.1");
            var repos = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Repositories = repos.Select(r => new AzureDevOpsRepositoryDto
            {
                Id = r["id"]?.ToString() ?? string.Empty,
                Name = r["name"]?.ToString() ?? string.Empty,
                ProjectName = r["project"]?["name"]?.ToString() ?? string.Empty,
                DefaultBranch = r["defaultBranch"]?.ToString()?.Replace("refs/heads/", "") ?? string.Empty,
                WebUrl = r["webUrl"]?.ToString() ?? string.Empty,
                SizeBytes = r["size"]?.ToObject<long?>()
            })
            .OrderBy(r => r.ProjectName).ThenBy(r => r.Name)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "repository list");
        }

        return result;
    }

    public async Task<AzureDevOpsBranchListDto> GetBranchesAsync(UserPaasCredentials credentials, string project, string repositoryId)
    {
        var result = new AzureDevOpsBranchListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var path = $"/{Uri.EscapeDataString(project)}/_apis/git/repositories/{Uri.EscapeDataString(repositoryId)}/refs?filter=heads&api-version=7.1";
            var json = await GetDevOpsAsync(credentials.AccountId!, credentials.Token!, path);
            var refs = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Branches = refs.Select(r => new AzureDevOpsBranchDto
            {
                Name = r["name"]?.ToString()?.Replace("refs/heads/", "") ?? string.Empty,
                ObjectId = r["objectId"]?.ToString() ?? string.Empty
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "branch list");
        }

        return result;
    }

    // ================= Pipelines: pipelines -> runs =================
    //
    // Both project-scoped - unlike repositories above, there is no org-wide
    // "every pipeline in every project" endpoint, so the frontend always
    // asks for one project's pipelines at a time (see GetProjectsAsync
    // above for the picker this feeds).

    public async Task<AzureDevOpsPipelineListDto> GetPipelinesAsync(UserPaasCredentials credentials, string project)
    {
        var result = new AzureDevOpsPipelineListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var path = $"/{Uri.EscapeDataString(project)}/_apis/pipelines?api-version=7.1";
            var json = await GetDevOpsAsync(credentials.AccountId!, credentials.Token!, path);
            var pipelines = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Pipelines = pipelines.Select(p => new AzureDevOpsPipelineDto
            {
                Id = p["id"]?.ToObject<int?>() ?? 0,
                Name = p["name"]?.ToString() ?? string.Empty,
                Folder = p["folder"]?.ToString()?.Trim('\\') ?? string.Empty
            })
            .OrderBy(p => p.Name)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "pipeline list");
        }

        return result;
    }

    public async Task<AzureDevOpsRunListDto> GetRunsAsync(UserPaasCredentials credentials, string project, int pipelineId)
    {
        var result = new AzureDevOpsRunListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var path = $"/{Uri.EscapeDataString(project)}/_apis/pipelines/{pipelineId}/runs?api-version=7.1";
            var json = await GetDevOpsAsync(credentials.AccountId!, credentials.Token!, path);
            var runs = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Runs = runs.Select(r => new AzureDevOpsRunDto
            {
                Id = r["id"]?.ToObject<int?>() ?? 0,
                Name = r["name"]?.ToString() ?? string.Empty,
                State = r["state"]?.ToString() ?? string.Empty,
                Result = r["result"]?.ToString(),
                CreatedDate = r["createdDate"]?.ToObject<DateTime?>(),
                FinishedDate = r["finishedDate"]?.ToObject<DateTime?>(),
                WebUrl = r["_links"]?["web"]?["href"]?.ToString() ?? string.Empty
            })
            .OrderByDescending(r => r.CreatedDate)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "run history");
        }

        return result;
    }

    // Triggers a new run against the pipeline's default branch (no branch
    // picker - keeps the request body to the same empty "{}" Azure DevOps'
    // own docs show for "just run it as configured"). Real GitHub Deploy
    // trigger elsewhere in this app requires AdminGate + real repo-write
    // access because it acts against this PORTAL's own shared pipeline;
    // this one deliberately doesn't - it's the calling session's own
    // connected Azure DevOps org, so that credential's real Execute
    // permission on Azure DevOps' own side is the auth boundary, same
    // self-service posture as EC2 start/stop/terminate and ECR create/
    // delete elsewhere in this app.
    public async Task<AzureDevOpsRunTriggerResultDto> RunPipelineAsync(UserPaasCredentials credentials, string project, int pipelineId)
    {
        if (!credentials.IsConfigured)
            return new AzureDevOpsRunTriggerResultDto { Success = false, Error = "Azure DevOps is not configured." };

        try
        {
            var url = $"https://dev.azure.com/{Uri.EscapeDataString(credentials.AccountId!)}/{Uri.EscapeDataString(project)}/_apis/pipelines/{pipelineId}/runs?api-version=7.1";

            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent("{}", Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = BuildAuth(credentials.Token!);

            var response = await DevOpsHttpClient.SendAsync(request);
            await HttpClientHelper.EnsureSuccessAsync(response);

            var run = JObject.Parse(await response.Content.ReadAsStringAsync());
            var runId = run["id"]?.ToObject<int?>();

            return new AzureDevOpsRunTriggerResultDto
            {
                Success = true,
                Message = runId != null ? $"Run #{runId} started." : "Run started.",
                RunId = runId
            };
        }
        catch (Exception ex)
        {
            return new AzureDevOpsRunTriggerResultDto
            {
                Success = false,
                Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "pipeline run trigger")
            };
        }
    }

    // ================= Build Artifacts: pipelines -> runs -> artifacts =================
    //
    // Reuses GetPipelinesAsync/GetRunsAsync above for its first two levels
    // (same project/pipeline/run selection Pipelines itself uses) - a run's
    // artifacts are the payoff at the bottom of this page specifically.

    public async Task<AzureDevOpsArtifactListDto> GetArtifactsAsync(UserPaasCredentials credentials, string project, int runId)
    {
        var result = new AzureDevOpsArtifactListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            // A pipeline run's ID is the same ID the classic Build API uses
            // internally (Azure Pipelines runs on top of the Build service) -
            // there is no artifacts endpoint under the newer Pipelines API
            // surface, only this one.
            var path = $"/{Uri.EscapeDataString(project)}/_apis/build/builds/{runId}/artifacts?api-version=7.1";
            var json = await GetDevOpsAsync(credentials.AccountId!, credentials.Token!, path);
            var artifacts = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Artifacts = artifacts.Select(a => new AzureDevOpsArtifactDto
            {
                Name = a["name"]?.ToString() ?? string.Empty,
                Type = a["resource"]?["type"]?.ToString() ?? string.Empty,
                DownloadUrl = a["resource"]?["downloadUrl"]?.ToString() ?? string.Empty
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "artifact list");
        }

        return result;
    }

    // ================= Package Feeds: feeds -> packages -> versions =================
    //
    // Org-wide, like repositories above - no project picker needed. Uses
    // feeds.dev.azure.com, a separate host from the rest of this file.

    public async Task<AzureDevOpsFeedListDto> GetFeedsAsync(UserPaasCredentials credentials)
    {
        var result = new AzureDevOpsFeedListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var json = await GetFeedsAsync(credentials.AccountId!, credentials.Token!, "/_apis/packaging/feeds?api-version=7.1");
            var feeds = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Feeds = feeds.Select(f => new AzureDevOpsFeedDto
            {
                Id = f["id"]?.ToString() ?? string.Empty,
                Name = f["name"]?.ToString() ?? string.Empty,
                Description = f["description"]?.ToString() ?? string.Empty
            })
            .OrderBy(f => f.Name)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "feed list");
        }

        return result;
    }

    public async Task<AzureDevOpsPackageListDto> GetPackagesAsync(UserPaasCredentials credentials, string feedId)
    {
        var result = new AzureDevOpsPackageListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var path = $"/_apis/packaging/feeds/{Uri.EscapeDataString(feedId)}/packages?api-version=7.1";
            var json = await GetFeedsAsync(credentials.AccountId!, credentials.Token!, path);
            var packages = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Packages = packages.Select(p => new AzureDevOpsPackageDto
            {
                Id = p["id"]?.ToString() ?? string.Empty,
                Name = p["name"]?.ToString() ?? string.Empty,
                ProtocolType = p["protocolType"]?.ToString() ?? string.Empty
            })
            .OrderBy(p => p.Name)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "package list");
        }

        return result;
    }

    public async Task<AzureDevOpsPackageVersionListDto> GetPackageVersionsAsync(UserPaasCredentials credentials, string feedId, string packageId)
    {
        var result = new AzureDevOpsPackageVersionListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var path = $"/_apis/packaging/feeds/{Uri.EscapeDataString(feedId)}/packages/{Uri.EscapeDataString(packageId)}/versions?api-version=7.1";
            var json = await GetFeedsAsync(credentials.AccountId!, credentials.Token!, path);
            var versions = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Versions = versions.Select(v => new AzureDevOpsPackageVersionDto
            {
                Version = v["version"]?.ToString() ?? string.Empty,
                IsLatest = v["isLatest"]?.ToObject<bool?>() ?? false,
                PublishDate = v["publishDate"]?.ToObject<DateTime?>()
            })
            .OrderByDescending(v => v.PublishDate)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "package version list");
        }

        return result;
    }
}

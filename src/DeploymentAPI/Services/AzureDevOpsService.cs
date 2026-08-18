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
    // Identity/profile lookups (see ResolveMyIdentityIdAsync) live on a
    // third, org-independent host - vssps ("Visual Studio Services Platform
    // Services") is where Azure DevOps keeps account/profile data, separate
    // from both dev.azure.com (project data) and feeds.dev.azure.com
    // (packaging data).
    private static readonly HttpClient VsspsHttpClient = new();

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

    // Shared by every mutating call below (branch create/delete, pipeline
    // run trigger, PR approve/complete) - one small helper instead of
    // repeating the request-building boilerplate four times.
    private static async Task<JObject> SendJsonAsync(HttpClient client, HttpMethod method, string url, string token, object? body)
    {
        using var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = BuildAuth(token);

        if (body != null)
            request.Content = new StringContent(Newtonsoft.Json.JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json");

        var response = await client.SendAsync(request);
        await HttpClientHelper.EnsureSuccessAsync(response);

        var text = await response.Content.ReadAsStringAsync();
        return string.IsNullOrWhiteSpace(text) ? new JObject() : JObject.Parse(text);
    }

    // Resolves the caller's own Azure DevOps identity ID - needed as the
    // reviewer ID for ApprovePullRequestAsync's vote call, since Azure
    // DevOps' reviewers endpoint has no "me" shorthand the way some of its
    // other APIs do. The Profile API's own "id" field is the same identity
    // GUID Azure DevOps expects wherever a reviewer/identity ID is needed
    // elsewhere in its REST surface.
    private static async Task<string?> ResolveMyIdentityIdAsync(string token)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1");
            request.Headers.Authorization = BuildAuth(token);

            var response = await VsspsHttpClient.SendAsync(request);
            await HttpClientHelper.EnsureSuccessAsync(response);

            var profile = JObject.Parse(await response.Content.ReadAsStringAsync());
            return profile["id"]?.ToString();
        }
        catch
        {
            return null;
        }
    }

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

    // The basic list above carries only id/name/folder - a pipeline's own
    // linked repository (needed to populate a branch picker before running
    // it) only comes back from the single-pipeline GET. Resolved on demand
    // right before showing that picker, not fetched for every pipeline in
    // the list up front.
    public async Task<AzureDevOpsPipelineDetailDto> GetPipelineDetailAsync(UserPaasCredentials credentials, string project, int pipelineId)
    {
        var result = new AzureDevOpsPipelineDetailDto { Configured = credentials.IsConfigured, Id = pipelineId };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var path = $"/{Uri.EscapeDataString(project)}/_apis/pipelines/{pipelineId}?api-version=7.1";
            var json = await GetDevOpsAsync(credentials.AccountId!, credentials.Token!, path);
            var pipeline = JObject.Parse(json);
            var repository = pipeline["configuration"]?["repository"];

            result.Name = pipeline["name"]?.ToString() ?? string.Empty;
            result.RepositoryId = repository?["id"]?.ToString();
            result.RepositoryName = repository?["name"]?.ToString();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "pipeline detail");
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

    // Triggers a new run - against the pipeline's own configured default
    // branch when branch is null/blank (an empty "{}" body, same as Azure
    // DevOps' own docs show for "just run it as configured"), or against a
    // specific one when the caller picked one from GetBranchesAsync's own
    // list for that pipeline's linked repository (see
    // GetPipelineDetailAsync). Real GitHub Deploy trigger elsewhere in this
    // app requires AdminGate + real repo-write access because it acts
    // against this PORTAL's own shared pipeline; this one deliberately
    // doesn't - it's the calling session's own connected Azure DevOps org,
    // so that credential's real Execute permission on Azure DevOps' own
    // side is the auth boundary, same self-service posture as EC2 start/
    // stop/terminate and ECR create/delete elsewhere in this app.
    public async Task<AzureDevOpsRunTriggerResultDto> RunPipelineAsync(UserPaasCredentials credentials, string project, int pipelineId, string? branch)
    {
        if (!credentials.IsConfigured)
            return new AzureDevOpsRunTriggerResultDto { Success = false, Error = "Azure DevOps is not configured." };

        try
        {
            var url = $"https://dev.azure.com/{Uri.EscapeDataString(credentials.AccountId!)}/{Uri.EscapeDataString(project)}/_apis/pipelines/{pipelineId}/runs?api-version=7.1";

            object body = string.IsNullOrWhiteSpace(branch)
                ? new { }
                : new { resources = new { repositories = new { self = new { refName = $"refs/heads/{branch}" } } } };

            var run = await SendJsonAsync(DevOpsHttpClient, HttpMethod.Post, url, credentials.Token!, body);
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

    // ================= Branches: create / delete =================
    //
    // Both are really one Git ref update, batched the way Azure DevOps'
    // own Refs API expects (see AzureDevOpsCreateBranchDto's own comment on
    // the old/new-object-id contract).

    public async Task<AzureDevOpsGitActionResultDto> CreateBranchAsync(UserPaasCredentials credentials, string project, string repositoryId, string newBranchName, string sourceObjectId)
    {
        if (!credentials.IsConfigured)
            return new AzureDevOpsGitActionResultDto { Success = false, Error = "Azure DevOps is not configured." };

        try
        {
            var url = $"https://dev.azure.com/{Uri.EscapeDataString(credentials.AccountId!)}/{Uri.EscapeDataString(project)}/_apis/git/repositories/{Uri.EscapeDataString(repositoryId)}/refs?api-version=7.1";

            var body = new[]
            {
                new
                {
                    name = $"refs/heads/{newBranchName}",
                    oldObjectId = "0000000000000000000000000000000000000000",
                    newObjectId = sourceObjectId
                }
            };

            await SendJsonAsync(DevOpsHttpClient, HttpMethod.Post, url, credentials.Token!, body);

            return new AzureDevOpsGitActionResultDto { Success = true, Message = $"Branch \"{newBranchName}\" created." };
        }
        catch (Exception ex)
        {
            return new AzureDevOpsGitActionResultDto
            {
                Success = false,
                Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "branch creation")
            };
        }
    }

    public async Task<AzureDevOpsGitActionResultDto> DeleteBranchAsync(UserPaasCredentials credentials, string project, string repositoryId, string branchName, string objectId)
    {
        if (!credentials.IsConfigured)
            return new AzureDevOpsGitActionResultDto { Success = false, Error = "Azure DevOps is not configured." };

        try
        {
            var url = $"https://dev.azure.com/{Uri.EscapeDataString(credentials.AccountId!)}/{Uri.EscapeDataString(project)}/_apis/git/repositories/{Uri.EscapeDataString(repositoryId)}/refs?api-version=7.1";

            var body = new[]
            {
                new
                {
                    name = $"refs/heads/{branchName}",
                    oldObjectId = objectId,
                    newObjectId = "0000000000000000000000000000000000000000"
                }
            };

            await SendJsonAsync(DevOpsHttpClient, HttpMethod.Post, url, credentials.Token!, body);

            return new AzureDevOpsGitActionResultDto { Success = true, Message = $"Branch \"{branchName}\" deleted." };
        }
        catch (Exception ex)
        {
            return new AzureDevOpsGitActionResultDto
            {
                Success = false,
                Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "branch deletion")
            };
        }
    }

    // ================= Build Artifacts: pipelines -> latest run's artifacts =================
    //
    // Reuses GetPipelinesAsync above for its picker (same pipeline
    // selection Pipelines itself uses) - by explicit request this page
    // skips a separate "pick a run" step entirely and always shows
    // whichever run is most recent.

    private static AzureDevOpsArtifactDto ParseArtifact(JToken a) => new()
    {
        Name = a["name"]?.ToString() ?? string.Empty,
        Type = a["resource"]?["type"]?.ToString() ?? string.Empty,
        DownloadUrl = a["resource"]?["downloadUrl"]?.ToString() ?? string.Empty,
        Location = a["resource"]?["data"]?.ToString() ?? string.Empty
    };

    // A pipeline run's ID is the same ID the classic Build API uses
    // internally (Azure Pipelines runs on top of the Build service) -
    // there is no artifacts endpoint under the newer Pipelines API surface,
    // only this one.
    public async Task<AzureDevOpsArtifactListDto> GetArtifactsAsync(UserPaasCredentials credentials, string project, int runId)
    {
        var result = new AzureDevOpsArtifactListDto { Configured = credentials.IsConfigured, RunId = runId };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var path = $"/{Uri.EscapeDataString(project)}/_apis/build/builds/{runId}/artifacts?api-version=7.1";
            var json = await GetDevOpsAsync(credentials.AccountId!, credentials.Token!, path);
            var artifacts = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Artifacts = artifacts.Select(ParseArtifact).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "artifact list");
        }

        return result;
    }

    // Finds the pipeline's most recent run, then that run's artifacts, in
    // one call - what the Build Artifacts page actually shows (no run
    // picker). Reuses GetRunsAsync's own parsing rather than a second
    // hand-rolled request, since "most recent run" is exactly what that
    // method already sorts to the front.
    public async Task<AzureDevOpsArtifactListDto> GetLatestArtifactsAsync(UserPaasCredentials credentials, string project, int pipelineId)
    {
        var result = new AzureDevOpsArtifactListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        var runs = await GetRunsAsync(credentials, project, pipelineId);

        if (runs.Error != null)
        {
            result.Error = runs.Error;
            return result;
        }

        var latest = runs.Runs.FirstOrDefault();

        if (latest == null)
        {
            result.RunId = null;
            return result;
        }

        var artifacts = await GetArtifactsAsync(credentials, project, latest.Id);

        artifacts.RunId = latest.Id;
        artifacts.RunName = latest.Name;

        return artifacts;
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

    // ================= Pull Requests: list / approve / complete =================
    //
    // Listing is project-wide (Azure DevOps' own endpoint spans every
    // repository in the project at once - see AzureDevOpsPullRequestDto's
    // own comment); approve/complete are both repo-scoped routes on Azure
    // DevOps' side even though the list isn't, so RepositoryId travels with
    // each PR from the list response for those two calls to use.

    public async Task<AzureDevOpsPullRequestListDto> GetPullRequestsAsync(UserPaasCredentials credentials, string project)
    {
        var result = new AzureDevOpsPullRequestListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var path = $"/{Uri.EscapeDataString(project)}/_apis/git/pullrequests?searchCriteria.status=active&api-version=7.1";
            var json = await GetDevOpsAsync(credentials.AccountId!, credentials.Token!, path);
            var prs = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.PullRequests = prs.Select(pr => new AzureDevOpsPullRequestDto
            {
                Id = pr["pullRequestId"]?.ToObject<int?>() ?? 0,
                Title = pr["title"]?.ToString() ?? string.Empty,
                Description = pr["description"]?.ToString() ?? string.Empty,
                Status = pr["status"]?.ToString() ?? string.Empty,
                SourceBranch = pr["sourceRefName"]?.ToString()?.Replace("refs/heads/", "") ?? string.Empty,
                TargetBranch = pr["targetRefName"]?.ToString()?.Replace("refs/heads/", "") ?? string.Empty,
                CreatedBy = pr["createdBy"]?["displayName"]?.ToString() ?? string.Empty,
                CreationDate = pr["creationDate"]?.ToObject<DateTime?>(),
                RepositoryId = pr["repository"]?["id"]?.ToString() ?? string.Empty,
                RepositoryName = pr["repository"]?["name"]?.ToString() ?? string.Empty,
                WebUrl = pr["_links"]?["web"]?["href"]?.ToString() ?? string.Empty
            })
            .OrderByDescending(pr => pr.CreationDate)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "pull request list");
        }

        return result;
    }

    // Azure DevOps' reviewers endpoint has no "me" shorthand - it needs the
    // caller's own real identity ID, resolved once per call via
    // ResolveMyIdentityIdAsync (the Profile API). Vote 10 = approved (the
    // documented value in Azure DevOps' own vote enum - 5 = approved with
    // suggestions, -5 = waiting for author, -10 = rejected; only the plain
    // "approved" vote is exposed here, matching the scope actually asked
    // for).
    public async Task<AzureDevOpsGitActionResultDto> ApprovePullRequestAsync(UserPaasCredentials credentials, string project, string repositoryId, int pullRequestId)
    {
        if (!credentials.IsConfigured)
            return new AzureDevOpsGitActionResultDto { Success = false, Error = "Azure DevOps is not configured." };

        try
        {
            var reviewerId = await ResolveMyIdentityIdAsync(credentials.Token!);

            if (reviewerId == null)
            {
                return new AzureDevOpsGitActionResultDto
                {
                    Success = false,
                    Error = "Unable to resolve your Azure DevOps identity - check that your Personal Access Token is still valid."
                };
            }

            var url = $"https://dev.azure.com/{Uri.EscapeDataString(credentials.AccountId!)}/{Uri.EscapeDataString(project)}/_apis/git/repositories/{Uri.EscapeDataString(repositoryId)}/pullrequests/{pullRequestId}/reviewers/{reviewerId}?api-version=7.1";

            await SendJsonAsync(DevOpsHttpClient, HttpMethod.Put, url, credentials.Token!, new { vote = 10 });

            return new AzureDevOpsGitActionResultDto { Success = true, Message = "Pull request approved." };
        }
        catch (Exception ex)
        {
            return new AzureDevOpsGitActionResultDto
            {
                Success = false,
                Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "pull request approval")
            };
        }
    }

    // Azure DevOps requires lastMergeSourceCommit.commitId to match the
    // PR's CURRENT source commit for a complete call to succeed (optimistic
    // concurrency - protects against completing a stale view of the PR if
    // it changed since the list was fetched), so this re-reads the PR
    // fresh immediately before completing it rather than trusting whatever
    // the frontend last saw.
    public async Task<AzureDevOpsGitActionResultDto> CompletePullRequestAsync(UserPaasCredentials credentials, string project, string repositoryId, int pullRequestId)
    {
        if (!credentials.IsConfigured)
            return new AzureDevOpsGitActionResultDto { Success = false, Error = "Azure DevOps is not configured." };

        try
        {
            var getUrl = $"https://dev.azure.com/{Uri.EscapeDataString(credentials.AccountId!)}/{Uri.EscapeDataString(project)}/_apis/git/repositories/{Uri.EscapeDataString(repositoryId)}/pullrequests/{pullRequestId}?api-version=7.1";
            var current = await SendJsonAsync(DevOpsHttpClient, HttpMethod.Get, getUrl, credentials.Token!, null);
            var lastMergeSourceCommitId = current["lastMergeSourceCommit"]?["commitId"]?.ToString();

            if (string.IsNullOrWhiteSpace(lastMergeSourceCommitId))
            {
                return new AzureDevOpsGitActionResultDto
                {
                    Success = false,
                    Error = "Unable to read this pull request's current source commit - it may have just changed. Refresh and try again."
                };
            }

            var patchBody = new
            {
                status = "completed",
                lastMergeSourceCommit = new { commitId = lastMergeSourceCommitId },
                completionOptions = new { mergeStrategy = "noFastForward", deleteSourceBranch = false }
            };

            await SendJsonAsync(DevOpsHttpClient, HttpMethod.Patch, getUrl, credentials.Token!, patchBody);

            return new AzureDevOpsGitActionResultDto { Success = true, Message = "Pull request completed." };
        }
        catch (Exception ex)
        {
            return new AzureDevOpsGitActionResultDto
            {
                Success = false,
                Error = CloudErrorSanitizer.Describe(ex, "Azure DevOps", "pull request completion")
            };
        }
    }
}

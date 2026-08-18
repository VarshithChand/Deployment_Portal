using System.Net.Http.Headers;
using System.Text;
using Amazon;
using Amazon.CodeCommit;
using Amazon.CodeCommit.Model;
using Amazon.Runtime;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Source Control hub's Azure Repos and AWS CodeCommit sub-pages. Azure
// Repos uses a session-scoped credential (Organization + PAT, reusing
// UserPaasCredentials/GetUserPaasCredentialsAsync directly under provider
// "azureRepos" - a DIFFERENT credential from the Azure App Registration
// ACR/Web App status already use, just the same isolation model); AWS
// CodeCommit reuses this session's own UserAwsCredentials, the same one
// ECR/EC2/ECS/RDS/Lambda already use - no new credential to set up, same
// "raw HttpClient, not a vendor SDK" convention for Azure Repos and
// "official per-service AWS SDK package" convention for CodeCommit this
// app already follows elsewhere.
public class SourceControlService
{
    private static AWSCredentials BuildAwsCredentials(UserAwsCredentials credentials) =>
        CloudStatusService.BuildCredentials(credentials);

    private static (bool ok, RegionEndpoint? endpoint, string? error) ResolveAwsRegion(UserAwsCredentials credentials, string? region)
    {
        if (!credentials.IsConfigured)
            return (false, null, null);

        if (credentials.RequiresMfaRefresh)
            return (false, null, "MFA session expired — re-enter your 6-digit code in Settings → Credentials → AWS.");

        var effectiveRegion = string.IsNullOrWhiteSpace(region) ? credentials.Region : region;

        if (string.IsNullOrWhiteSpace(effectiveRegion))
            return (false, null, "No AWS region configured — set one in Settings → Credentials → AWS.");

        return (true, RegionEndpoint.GetBySystemName(effectiveRegion), null);
    }

    // ================= Azure Repos =================
    //
    // Azure DevOps' REST API authenticates with plain HTTP Basic auth - an
    // empty username, the PAT as the password - the standard, documented
    // way most tools (including CI systems) talk to it, distinct from
    // Azure Resource Manager's AAD-token model this app's other Azure
    // integrations (ACR, Web App status) use. The org-wide repository list
    // endpoint (no project scope needed) keeps the credential down to just
    // Organization + PAT, matching exactly what was asked for - no third
    // "project" field required up front.

    private static readonly HttpClient AzureReposHttpClient = new();

    private static async Task<string> GetAzureReposAsync(string organization, string token, string urlPath)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"https://dev.azure.com/{Uri.EscapeDataString(organization)}{urlPath}");

        var basic = Convert.ToBase64String(Encoding.ASCII.GetBytes($":{token}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

        var response = await AzureReposHttpClient.SendAsync(request);
        await HttpClientHelper.EnsureSuccessAsync(response);

        return await response.Content.ReadAsStringAsync();
    }

    public async Task<AzureReposRepositoryListDto> GetAzureReposRepositoriesAsync(UserPaasCredentials credentials)
    {
        var result = new AzureReposRepositoryListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var json = await GetAzureReposAsync(credentials.AccountId!, credentials.Token!, "/_apis/git/repositories?api-version=7.1");
            var repos = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Repositories = repos.Select(r => new AzureReposRepositoryDto
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

    public async Task<AzureReposBranchListDto> GetAzureReposBranchesAsync(UserPaasCredentials credentials, string project, string repositoryId)
    {
        var result = new AzureReposBranchListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var path = $"/{Uri.EscapeDataString(project)}/_apis/git/repositories/{Uri.EscapeDataString(repositoryId)}/refs?filter=heads&api-version=7.1";
            var json = await GetAzureReposAsync(credentials.AccountId!, credentials.Token!, path);
            var refs = JObject.Parse(json)["value"] as JArray ?? new JArray();

            result.Branches = refs.Select(r => new AzureReposBranchDto
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

    // ================= AWS CodeCommit =================
    //
    // Same shape as ECR's own GetEcrRepositoriesAsync above - list, then a
    // best-effort per-repo detail call (GetRepository) for description/
    // default branch/clone URL, one repo's failure not blanking the table.

    public async Task<CodeCommitRepositoryListDto> GetCodeCommitRepositoriesAsync(UserAwsCredentials credentials, string? region)
    {
        var result = new CodeCommitRepositoryListDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveAwsRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            using var client = new AmazonCodeCommitClient(BuildAwsCredentials(credentials), endpoint);

            var repos = new List<RepositoryNameIdPair>();
            string? nextToken = null;

            do
            {
                var page = await client.ListRepositoriesAsync(new ListRepositoriesRequest { NextToken = nextToken });
                repos.AddRange(page.Repositories ?? new List<RepositoryNameIdPair>());
                nextToken = page.NextToken;
            }
            while (!string.IsNullOrEmpty(nextToken) && repos.Count < 500);

            foreach (var repo in repos)
            {
                var entry = new CodeCommitRepositoryDto { Name = repo.RepositoryName, Id = repo.RepositoryId };

                try
                {
                    var detail = await client.GetRepositoryAsync(new GetRepositoryRequest { RepositoryName = repo.RepositoryName });
                    var meta = detail.RepositoryMetadata;

                    entry.DefaultBranch = meta.DefaultBranch;
                    entry.Description = meta.RepositoryDescription;
                    entry.CloneUrlHttp = meta.CloneUrlHttp;
                    entry.LastModified = meta.LastModifiedDate;
                }
                catch
                {
                    // leave the detail fields blank - see the section comment.
                }

                result.Repositories.Add(entry);
            }

            result.Repositories = result.Repositories.OrderBy(r => r.Name).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "CodeCommit repository list");
        }

        return result;
    }

    public async Task<CodeCommitBranchListDto> GetCodeCommitBranchesAsync(UserAwsCredentials credentials, string? region, string repositoryName)
    {
        var result = new CodeCommitBranchListDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveAwsRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            using var client = new AmazonCodeCommitClient(BuildAwsCredentials(credentials), endpoint);

            var branches = new List<string>();
            string? nextToken = null;

            do
            {
                var page = await client.ListBranchesAsync(new ListBranchesRequest { RepositoryName = repositoryName, NextToken = nextToken });
                branches.AddRange(page.Branches ?? new List<string>());
                nextToken = page.NextToken;
            }
            while (!string.IsNullOrEmpty(nextToken) && branches.Count < 500);

            result.Branches = branches.OrderBy(b => b).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "CodeCommit branch list");
        }

        return result;
    }
}

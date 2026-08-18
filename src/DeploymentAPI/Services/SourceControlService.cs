using Amazon;
using Amazon.CodeCommit;
using Amazon.CodeCommit.Model;
using Amazon.Runtime;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;

namespace DeploymentAPI.Services;

// Source Control hub's AWS CodeCommit sub-page (Azure DevOps moved to its
// own AzureDevOpsService.cs - it grew from one repos-browsing page into
// four). CodeCommit reuses this session's own UserAwsCredentials, the same
// one ECR/EC2/ECS/RDS/Lambda already use - no new credential to set up,
// "official per-service AWS SDK package" convention this app already
// follows elsewhere.
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

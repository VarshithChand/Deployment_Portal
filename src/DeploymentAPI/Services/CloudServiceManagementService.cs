using Amazon;
using Amazon.EC2;
using Amazon.EC2.Model;
using Amazon.ECR;
using Amazon.ECR.Model;
using Amazon.ECS;
using Amazon.ECS.Model;
using Amazon.Lambda;
using Amazon.Lambda.Model;
using Amazon.RDS;
using Amazon.RDS.Model;
using Amazon.Runtime;
using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Everything the Cloud Services *management* pages need beyond the
// read-only Dashboard/inventory data CloudStatusService already provides
// (see GetAwsResourceInventoryAsync/GetEc2DetailAsync/GetEcsDetailAsync
// there) - mutating actions (EC2 start/stop/reboot/terminate, ECS scale,
// ECR create/delete) plus a handful of additional read-only resource
// lists (ECR repositories/images, Lambda functions, RDS instances) that
// didn't exist before this feature.
//
// Every method here follows the same shape as CloudStatusService's own:
// never throws out to the caller, never assumes success - an action
// returns whether AWS actually accepted the request, and the frontend is
// the one that re-fetches the resource list afterward rather than this
// service claiming a new state it hasn't actually observed.
public class CloudServiceManagementService
{
    private static AWSCredentials BuildCredentials(UserAwsCredentials credentials) =>
        CloudStatusService.BuildCredentials(credentials);

    private static (bool ok, RegionEndpoint? endpoint, string? error) ResolveRegion(UserAwsCredentials credentials, string? region)
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

    // ================= EC2 actions =================

    public async Task<CloudServiceActionResultDto> StartEc2InstanceAsync(UserAwsCredentials credentials, string? region, string instanceId)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonEC2Client(BuildCredentials(credentials), endpoint);
            await client.StartInstancesAsync(new StartInstancesRequest { InstanceIds = new List<string> { instanceId } });

            return new CloudServiceActionResultDto { Success = true, Message = "Start requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = ex.Message };
        }
    }

    public async Task<CloudServiceActionResultDto> StopEc2InstanceAsync(UserAwsCredentials credentials, string? region, string instanceId)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonEC2Client(BuildCredentials(credentials), endpoint);
            await client.StopInstancesAsync(new StopInstancesRequest { InstanceIds = new List<string> { instanceId } });

            return new CloudServiceActionResultDto { Success = true, Message = "Stop requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = ex.Message };
        }
    }

    public async Task<CloudServiceActionResultDto> RebootEc2InstanceAsync(UserAwsCredentials credentials, string? region, string instanceId)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonEC2Client(BuildCredentials(credentials), endpoint);
            await client.RebootInstancesAsync(new RebootInstancesRequest { InstanceIds = new List<string> { instanceId } });

            return new CloudServiceActionResultDto { Success = true, Message = "Reboot requested." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = ex.Message };
        }
    }

    // Irreversible - the frontend requires typing the instance name to
    // confirm before this is ever called (see section 24 of the request
    // this feature came from), but the backend doesn't trust that on its
    // own; AWS's own IAM permission check is the real gate.
    public async Task<CloudServiceActionResultDto> TerminateEc2InstanceAsync(UserAwsCredentials credentials, string? region, string instanceId)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonEC2Client(BuildCredentials(credentials), endpoint);
            await client.TerminateInstancesAsync(new TerminateInstancesRequest { InstanceIds = new List<string> { instanceId } });

            return new CloudServiceActionResultDto { Success = true, Message = "Termination requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = ex.Message };
        }
    }

    // ================= ECS actions =================

    public async Task<CloudServiceActionResultDto> ScaleEcsServiceAsync(
        UserAwsCredentials credentials, string? region, string cluster, string service, int desiredCount)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        if (desiredCount < 0)
            return new CloudServiceActionResultDto { Success = false, Error = "Desired count can't be negative." };

        try
        {
            using var client = new AmazonECSClient(BuildCredentials(credentials), endpoint);

            await client.UpdateServiceAsync(new UpdateServiceRequest
            {
                Cluster = cluster,
                Service = service,
                DesiredCount = desiredCount
            });

            return new CloudServiceActionResultDto { Success = true, Message = "Scale requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = ex.Message };
        }
    }

    // ================= ECR =================

    public async Task<AwsEcrRepositoryListDto> GetEcrRepositoriesAsync(UserAwsCredentials credentials, string? region)
    {
        var result = new AwsEcrRepositoryListDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            using var client = new AmazonECRClient(BuildCredentials(credentials), endpoint);

            var repos = new List<Amazon.ECR.Model.Repository>();
            string? nextToken = null;

            do
            {
                var page = await client.DescribeRepositoriesAsync(new DescribeRepositoriesRequest { NextToken = nextToken, MaxResults = 100 });
                repos.AddRange(page.Repositories ?? new List<Amazon.ECR.Model.Repository>());
                nextToken = page.NextToken;
            }
            while (!string.IsNullOrEmpty(nextToken) && repos.Count < 500);

            foreach (var repo in repos)
            {
                var entry = new AwsEcrRepositoryDto
                {
                    Name = repo.RepositoryName,
                    Uri = repo.RepositoryUri,
                    CreatedAt = repo.CreatedAt
                };

                // Best-effort - one repository's image listing failing
                // (permission gap, transient error) shouldn't blank the
                // whole table, it just shows 0 images for that one row.
                try
                {
                    var images = await client.DescribeImagesAsync(new Amazon.ECR.Model.DescribeImagesRequest
                    {
                        RepositoryName = repo.RepositoryName,
                        MaxResults = 100
                    });

                    entry.ImageCount = images.ImageDetails?.Count ?? 0;
                    entry.LatestPushedAt = images.ImageDetails?.OrderByDescending(i => i.ImagePushedAt).FirstOrDefault()?.ImagePushedAt;
                }
                catch
                {
                    // leave ImageCount at 0 / LatestPushedAt at null
                }

                result.Repositories.Add(entry);
            }
        }
        catch (Exception ex)
        {
            result.Error = ex.Message;
        }

        return result;
    }

    public async Task<AwsEcrImageListDto> GetEcrImagesAsync(UserAwsCredentials credentials, string? region, string repositoryName)
    {
        var result = new AwsEcrImageListDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            using var client = new AmazonECRClient(BuildCredentials(credentials), endpoint);

            var described = await client.DescribeImagesAsync(new Amazon.ECR.Model.DescribeImagesRequest
            {
                RepositoryName = repositoryName,
                MaxResults = 200
            });

            result.Images = (described.ImageDetails ?? new List<ImageDetail>())
                .OrderByDescending(i => i.ImagePushedAt)
                .Select(i => new AwsEcrImageDto
                {
                    Tag = i.ImageTags?.FirstOrDefault() ?? "(untagged)",
                    Digest = i.ImageDigest,
                    SizeBytes = i.ImageSizeInBytes ?? 0,
                    PushedAt = i.ImagePushedAt
                })
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = ex.Message;
        }

        return result;
    }

    public async Task<CloudServiceActionResultDto> CreateEcrRepositoryAsync(UserAwsCredentials credentials, string? region, string repositoryName)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonECRClient(BuildCredentials(credentials), endpoint);
            await client.CreateRepositoryAsync(new CreateRepositoryRequest { RepositoryName = repositoryName });

            return new CloudServiceActionResultDto { Success = true, Message = $"Repository \"{repositoryName}\" created." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = ex.Message };
        }
    }

    // Irreversible - destroys every image in the repository. The frontend
    // requires typing the repository name to confirm (see section 24)
    // before this is ever called.
    public async Task<CloudServiceActionResultDto> DeleteEcrRepositoryAsync(UserAwsCredentials credentials, string? region, string repositoryName)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonECRClient(BuildCredentials(credentials), endpoint);

            await client.DeleteRepositoryAsync(new Amazon.ECR.Model.DeleteRepositoryRequest
            {
                RepositoryName = repositoryName,
                Force = true
            });

            return new CloudServiceActionResultDto { Success = true, Message = $"Repository \"{repositoryName}\" deleted." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = ex.Message };
        }
    }

    // ================= Lambda (read-only) =================

    public async Task<AwsLambdaFunctionListDto> GetLambdaFunctionsAsync(UserAwsCredentials credentials, string? region)
    {
        var result = new AwsLambdaFunctionListDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            using var client = new AmazonLambdaClient(BuildCredentials(credentials), endpoint);

            var functions = new List<FunctionConfiguration>();
            string? marker = null;

            do
            {
                var page = await client.ListFunctionsAsync(new ListFunctionsRequest { Marker = marker, MaxItems = 100 });
                functions.AddRange(page.Functions ?? new List<FunctionConfiguration>());
                marker = page.NextMarker;
            }
            while (!string.IsNullOrEmpty(marker) && functions.Count < 500);

            result.Functions = functions
                .Select(f => new AwsLambdaFunctionDto
                {
                    Name = f.FunctionName,
                    Runtime = f.Runtime?.Value ?? "",
                    Architecture = f.Architectures?.FirstOrDefault() ?? "x86_64",
                    MemorySize = f.MemorySize ?? 0,
                    Timeout = f.Timeout ?? 0,
                    LastModified = DateTime.TryParse(f.LastModified, out var lastModified) ? lastModified : null
                })
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = ex.Message;
        }

        return result;
    }

    // ================= RDS (read-only) =================

    public async Task<AwsRdsInstanceListDto> GetRdsInstancesAsync(UserAwsCredentials credentials, string? region)
    {
        var result = new AwsRdsInstanceListDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            using var client = new AmazonRDSClient(BuildCredentials(credentials), endpoint);

            var instances = new List<DBInstance>();
            string? marker = null;

            do
            {
                var page = await client.DescribeDBInstancesAsync(new DescribeDBInstancesRequest { Marker = marker, MaxRecords = 100 });
                instances.AddRange(page.DBInstances ?? new List<DBInstance>());
                marker = page.Marker;
            }
            while (!string.IsNullOrEmpty(marker) && instances.Count < 500);

            result.Instances = instances
                .Select(d => new AwsRdsInstanceDto
                {
                    Identifier = d.DBInstanceIdentifier,
                    Engine = d.Engine,
                    EngineVersion = d.EngineVersion,
                    Status = d.DBInstanceStatus,
                    InstanceClass = d.DBInstanceClass,
                    StorageGb = d.AllocatedStorage ?? 0,
                    AvailabilityZone = d.AvailabilityZone
                })
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = ex.Message;
        }

        return result;
    }
}

using Amazon;
using Amazon.EC2;
using Amazon.EC2.Model;
using Amazon.ECR;
using Amazon.ECR.Model;
using Amazon.ECS;
using Amazon.ECS.Model;
using Amazon.Lambda;
using Amazon.Lambda.Model;
using Amazon.ResourceGroupsTaggingAPI;
using Amazon.ResourceGroupsTaggingAPI.Model;
using Amazon.Route53;
using Amazon.Route53.Model;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Amazon.SecurityToken;
using Amazon.SecurityToken.Model;
using Amazon.SimpleNotificationService;
using Amazon.SimpleNotificationService.Model;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Live AWS ECS/ECR and Azure Web App lookups for the Environment detail
// view — always against whatever credentials the current visitor typed
// into their own session (see UserAwsCredentials/UserAzureCredentials in
// SettingsService), never a portal-wide credential. Every call is wrapped
// so a wrong key, a wrong cluster/service name, or the account simply not
// having access comes back as Found=false + a message instead of a 500 —
// this is a "nice to have" status panel, not something that should ever
// break the rest of the environment detail view.
public class CloudStatusService
{
    private static readonly HttpClient AzureHttpClient = new();

    // AWS has no username/password API — this is the real equivalent for
    // an MFA-enrolled IAM user: their long-term access key authenticates
    // to STS, the 6-digit device code proves the second factor, and STS
    // hands back a temporary session that's what every subsequent AWS call
    // actually uses (see BuildCredentials below). The code itself is never
    // stored - only this resulting session is.
    public async Task<AwsMfaVerificationResult> GetSessionTokenAsync(
        string accessKeyId, string secretAccessKey, string region, string mfaSerialNumber, string mfaCode)
    {
        try
        {
            using var stsClient = new AmazonSecurityTokenServiceClient(
                new BasicAWSCredentials(accessKeyId, secretAccessKey),
                RegionEndpoint.GetBySystemName(region));

            var response = await stsClient.GetSessionTokenAsync(new GetSessionTokenRequest
            {
                SerialNumber = mfaSerialNumber,
                TokenCode = mfaCode,
                DurationSeconds = 3600 * 12
            });

            var credentials = response.Credentials;

            return new AwsMfaVerificationResult
            {
                Success = true,
                Session = new AwsSessionCredentials(
                    credentials.AccessKeyId,
                    credentials.SecretAccessKey,
                    credentials.SessionToken,
                    credentials.Expiration ?? DateTime.UtcNow.AddHours(12))
            };
        }
        catch (Exception ex)
        {
            return new AwsMfaVerificationResult
            {
                Success = false,
                Error = CloudErrorSanitizer.Describe(ex, "AWS", "MFA verification")
            };
        }
    }

    // Internal (not private) so CloudServiceManagementService - the Cloud
    // Services management pages' own AWS calls - can build the exact same
    // credentials rather than duplicating this.
    internal static AWSCredentials BuildCredentials(UserAwsCredentials credentials) =>
        credentials.HasValidSession
            ? new SessionAWSCredentials(credentials.SessionAccessKeyId, credentials.SessionSecretAccessKey, credentials.SessionToken)
            : new BasicAWSCredentials(credentials.AccessKeyId, credentials.SecretAccessKey);

    // "Which cloud user am I" for the top bar — SSO sessions already carry
    // their own account/role (chosen on AWS's own sign-in page, no API call
    // needed to know it); the plain access-key path has no equivalent until
    // asked, so this calls STS's GetCallerIdentity, the one AWS API every
    // credential (however scoped) is always allowed to call regardless of
    // its actual permissions - existing purely to answer "who is this?".
    // Region falls back to us-east-1 since STS answers identically from any
    // region and a caller who hasn't set one yet shouldn't block on that.
    public async Task<string?> GetCallerIdentityLabelAsync(UserAwsCredentials credentials)
    {
        if (credentials.IsSsoSession)
            return $"{credentials.SsoAccountName}/{credentials.SsoRoleName}";

        if (!credentials.IsConfigured)
            return null;

        try
        {
            var region = string.IsNullOrWhiteSpace(credentials.Region) ? "us-east-1" : credentials.Region;

            using var stsClient = new AmazonSecurityTokenServiceClient(
                BuildCredentials(credentials), RegionEndpoint.GetBySystemName(region));

            var response = await stsClient.GetCallerIdentityAsync(new GetCallerIdentityRequest());

            // arn:aws:iam::123456789012:user/varshith -> "varshith"
            // arn:aws:sts::123456789012:assumed-role/RoleName/session -> "session"
            var arn = response.Arn ?? string.Empty;
            var lastSlash = arn.LastIndexOf('/');

            return lastSlash >= 0 && lastSlash < arn.Length - 1 ? arn[(lastSlash + 1)..] : response.UserId;
        }
        catch
        {
            // Same "never break the caller" posture as the rest of this
            // service - a bad/expired key just means no label, not a 500.
            return null;
        }
    }

    public async Task<CloudStatusDto> GetEcsAndEcrStatusAsync(
        UserAwsCredentials credentials,
        string? region,
        string? cluster,
        string? service,
        string? ecrRepository)
    {
        if (!credentials.IsConfigured)
            return new CloudStatusDto { Provider = "aws", Configured = false };

        var result = new CloudStatusDto { Provider = "aws", Configured = true };

        if (credentials.RequiresMfaRefresh)
        {
            result.Found = false;
            result.Error = "Your MFA session has expired — re-enter your 6-digit code in Settings → Credentials → AWS.";
            return result;
        }

        var effectiveRegion = string.IsNullOrWhiteSpace(region) ? credentials.Region : region;

        if (string.IsNullOrWhiteSpace(effectiveRegion))
        {
            result.Found = false;
            result.Error = "No AWS region configured — set one on the environment or when entering credentials.";
            return result;
        }

        var awsCredentials = BuildCredentials(credentials);
        var regionEndpoint = RegionEndpoint.GetBySystemName(effectiveRegion);

        var hasEcsTarget = !string.IsNullOrWhiteSpace(cluster) && !string.IsNullOrWhiteSpace(service);
        var hasEcrTarget = !string.IsNullOrWhiteSpace(ecrRepository);

        if (hasEcsTarget)
            await DescribeEcsServiceAsync(awsCredentials, regionEndpoint, cluster!, service!, result);

        if (hasEcrTarget)
            await DescribeEcrImagesAsync(awsCredentials, regionEndpoint, ecrRepository!, result);

        if (!hasEcsTarget && !hasEcrTarget)
        {
            result.Error = "This environment has no ECS cluster/service or ECR repository configured yet.";
        }

        result.Found = result.Error == null;
        return result;
    }

    private static async System.Threading.Tasks.Task DescribeEcsServiceAsync(
        AWSCredentials awsCredentials, RegionEndpoint regionEndpoint, string cluster, string service, CloudStatusDto result)
    {
        try
        {
            using var ecsClient = new AmazonECSClient(awsCredentials, regionEndpoint);

            var response = await ecsClient.DescribeServicesAsync(new DescribeServicesRequest
            {
                Cluster = cluster,
                Services = new List<string> { service }
            });

            var svc = response.Services?.FirstOrDefault();

            if (svc == null)
            {
                result.Error = $"ECS service \"{service}\" not found in cluster \"{cluster}\".";
            }
            else
            {
                result.EcsStatus = svc.Status;
                result.DesiredCount = svc.DesiredCount;
                result.RunningCount = svc.RunningCount;
                result.TaskDefinition = svc.TaskDefinition;
            }
        }
        catch (Exception ex)
        {
            result.Error = AppendError(result.Error, CloudErrorSanitizer.Describe(ex, "AWS", "ECS"));
        }
    }

    private static async System.Threading.Tasks.Task DescribeEcrImagesAsync(
        AWSCredentials awsCredentials, RegionEndpoint regionEndpoint, string ecrRepository, CloudStatusDto result)
    {
        try
        {
            using var ecrClient = new AmazonECRClient(awsCredentials, regionEndpoint);

            var listResponse = await ecrClient.ListImagesAsync(new ListImagesRequest
            {
                RepositoryName = ecrRepository,
                MaxResults = 10
            });

            if (listResponse.ImageIds.Count == 0)
                return;

            var describeResponse = await ecrClient.DescribeImagesAsync(new Amazon.ECR.Model.DescribeImagesRequest
            {
                RepositoryName = ecrRepository,
                ImageIds = listResponse.ImageIds
            });

            result.EcrImages = describeResponse.ImageDetails
                .OrderByDescending(i => i.ImagePushedAt)
                .Take(5)
                .Select(i => new EcrImageDto
                {
                    Tag = i.ImageTags?.FirstOrDefault(),
                    PushedAt = i.ImagePushedAt,
                    SizeBytes = i.ImageSizeInBytes ?? 0
                })
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = AppendError(result.Error, CloudErrorSanitizer.Describe(ex, "AWS", "ECR"));
        }
    }

    // Dashboard's "AWS Services" container — a broader account-wide look
    // than the Environments feature's ECS/ECR panel above, which only ever
    // shows the one cluster/service/repository a specific environment
    // happens to be wired to. This instead surveys the services teams
    // actually watch day to day, all in parallel, each wrapped separately
    // so one missing IAM permission (e.g. no route53:ListHostedZones) only
    // blanks that one tile instead of the whole card.
    public async Task<AwsResourceInventoryDto> GetAwsResourceInventoryAsync(UserAwsCredentials credentials, string? region)
    {
        var result = new AwsResourceInventoryDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        if (credentials.RequiresMfaRefresh)
        {
            const string mfaError = "MFA session expired — re-enter your 6-digit code in Settings → Credentials → AWS.";
            result.Ec2.Error = result.Ecr.Error = result.Vpc.Error = result.S3.Error = result.Lambda.Error = result.Route53.Error = result.Sns.Error = mfaError;
            result.OtherError = mfaError;
            return result;
        }

        var effectiveRegion = string.IsNullOrWhiteSpace(region) ? credentials.Region : region;
        result.Region = effectiveRegion;

        var awsCredentials = BuildCredentials(credentials);
        var tasks = new List<System.Threading.Tasks.Task>();

        // EC2, ECR, VPC, Lambda, and SNS are regional - nothing to call
        // without one.
        if (!string.IsNullOrWhiteSpace(effectiveRegion))
        {
            var regionEndpoint = RegionEndpoint.GetBySystemName(effectiveRegion);

            tasks.Add(DescribeEc2InstancesAsync(awsCredentials, regionEndpoint, result));
            tasks.Add(DescribeEcrRepositoriesAsync(awsCredentials, regionEndpoint, result));
            tasks.Add(DescribeVpcsAsync(awsCredentials, regionEndpoint, result));
            tasks.Add(DescribeLambdaFunctionsAsync(awsCredentials, regionEndpoint, result));
            tasks.Add(DescribeSnsTopicsAsync(awsCredentials, regionEndpoint, result));
            tasks.Add(DescribeOtherResourcesAsync(awsCredentials, regionEndpoint, result));
        }
        else
        {
            const string noRegionError = "No AWS region configured — set one in Settings → Credentials → AWS.";
            result.Ec2.Error = result.Ecr.Error = result.Vpc.Error = result.Lambda.Error = result.Sns.Error = noRegionError;
            result.OtherError = noRegionError;
        }

        // S3 and Route 53 are global services - any region's endpoint sees
        // the whole account, so these run regardless of the block above.
        var globalEndpoint = string.IsNullOrWhiteSpace(effectiveRegion)
            ? RegionEndpoint.USEast1
            : RegionEndpoint.GetBySystemName(effectiveRegion);

        tasks.Add(DescribeS3BucketsAsync(awsCredentials, globalEndpoint, result));
        tasks.Add(DescribeRoute53ZonesAsync(awsCredentials, globalEndpoint, result));

        await System.Threading.Tasks.Task.WhenAll(tasks);

        return result;
    }

    // Cloud Services page's EC2 detail (click-through, not the Dashboard
    // tile) - both running AND stopped, since "how many are running vs
    // stopped" is exactly what this view exists to answer.
    public async Task<AwsEc2DetailDto> GetEc2DetailAsync(UserAwsCredentials credentials, string? region)
    {
        var result = new AwsEc2DetailDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        if (credentials.RequiresMfaRefresh)
        {
            result.Error = "MFA session expired — re-enter your 6-digit code in Settings → Credentials → AWS.";
            return result;
        }

        var effectiveRegion = string.IsNullOrWhiteSpace(region) ? credentials.Region : region;

        if (string.IsNullOrWhiteSpace(effectiveRegion))
        {
            result.Error = "No AWS region configured — set one in Settings → Credentials → AWS.";
            return result;
        }

        try
        {
            using var client = new AmazonEC2Client(BuildCredentials(credentials), RegionEndpoint.GetBySystemName(effectiveRegion));

            var response = await client.DescribeInstancesAsync(new DescribeInstancesRequest());

            var instances = (response.Reservations ?? new List<Reservation>())
                .SelectMany(r => r.Instances ?? new List<Instance>())
                // Terminated instances linger in the API response for a
                // while after deletion - neither "running" nor genuinely
                // "stopped" in any way worth showing, so they're dropped
                // rather than inflating the stopped count.
                .Where(i => i.State?.Name != InstanceStateName.Terminated)
                .ToList();

            result.Instances = instances
                .Select(i => new AwsEc2InstanceDto
                {
                    Name = i.Tags?.FirstOrDefault(t => t.Key == "Name")?.Value ?? i.InstanceId,
                    InstanceId = i.InstanceId,
                    InstanceType = i.InstanceType?.Value ?? "",
                    State = i.State?.Name?.Value ?? "unknown",
                    PrivateIp = i.PrivateIpAddress,
                    PublicIp = i.PublicIpAddress,
                    AvailabilityZone = i.Placement?.AvailabilityZone,
                    LaunchTime = i.LaunchTime
                })
                .ToList();

            result.RunningCount = result.Instances.Count(i => i.State == "running");
            result.StoppedCount = result.Instances.Count(i => i.State == "stopped");
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "EC2 instance detail");
        }

        return result;
    }

    // Cloud Services page's ECS detail - every cluster this access key can
    // see, and every service within each, with running/desired task
    // counts. Capped, not literally unbounded - each additional cluster
    // costs a couple more AWS API calls (ListServices + DescribeServices),
    // so an account with hundreds of clusters shouldn't make this call
    // hang. The caps sit well above the frontend's own page size (see
    // CloudServiceDetailModal's RESOURCE_PAGE_SIZE) specifically so its
    // pagination has real multiple-page depth to page through, rather
    // than a cap that silently matches page size and makes "page 2"
    // always empty.
    public async Task<AwsEcsDetailDto> GetEcsDetailAsync(UserAwsCredentials credentials, string? region)
    {
        var result = new AwsEcsDetailDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        if (credentials.RequiresMfaRefresh)
        {
            result.Error = "MFA session expired — re-enter your 6-digit code in Settings → Credentials → AWS.";
            return result;
        }

        var effectiveRegion = string.IsNullOrWhiteSpace(region) ? credentials.Region : region;

        if (string.IsNullOrWhiteSpace(effectiveRegion))
        {
            result.Error = "No AWS region configured — set one in Settings → Credentials → AWS.";
            return result;
        }

        try
        {
            using var client = new AmazonECSClient(BuildCredentials(credentials), RegionEndpoint.GetBySystemName(effectiveRegion));

            var clusterArns = (await client.ListClustersAsync(new Amazon.ECS.Model.ListClustersRequest()))
                .ClusterArns ?? new List<string>();

            foreach (var clusterArn in clusterArns.Take(30))
            {
                var clusterName = clusterArn.Contains('/') ? clusterArn[(clusterArn.LastIndexOf('/') + 1)..] : clusterArn;
                var clusterEntry = new AwsEcsClusterDto { ClusterName = clusterName };

                try
                {
                    var serviceArns = (await client.ListServicesAsync(new Amazon.ECS.Model.ListServicesRequest { Cluster = clusterArn }))
                        .ServiceArns ?? new List<string>();

                    var toDescribe = serviceArns.Take(50).ToList();
                    var services = new List<AwsEcsServiceDto>();

                    // DescribeServices only accepts up to 10 ARNs per call
                    // (an AWS API limit, not a choice made here) - batching
                    // is what lets the cap above actually be 50, not 10.
                    for (var i = 0; i < toDescribe.Count; i += 10)
                    {
                        var batch = toDescribe.Skip(i).Take(10).ToList();

                        var described = await client.DescribeServicesAsync(new Amazon.ECS.Model.DescribeServicesRequest
                        {
                            Cluster = clusterArn,
                            Services = batch
                        });

                        services.AddRange((described.Services ?? new List<Amazon.ECS.Model.Service>())
                            .Select(s => new AwsEcsServiceDto
                            {
                                ServiceName = s.ServiceName,
                                Status = s.Status,
                                RunningCount = s.RunningCount ?? 0,
                                DesiredCount = s.DesiredCount ?? 0,
                                PendingCount = s.PendingCount ?? 0,
                                TaskDefinition = s.TaskDefinition?.Contains('/') == true
                                    ? s.TaskDefinition[(s.TaskDefinition.LastIndexOf('/') + 1)..]
                                    : s.TaskDefinition,
                                DeploymentStatus = s.Deployments?.FirstOrDefault()?.RolloutState?.Value
                            }));
                    }

                    clusterEntry.Status = "ACTIVE";
                    clusterEntry.Services = services;
                }
                catch (Exception ex)
                {
                    // One cluster's services failing to describe (e.g. a
                    // permission gap scoped to just that cluster) shouldn't
                    // blank out every other cluster already fetched.
                    clusterEntry.Status = $"Error: {CloudErrorSanitizer.Describe(ex, "AWS", $"cluster {clusterName}")}";
                }

                result.Clusters.Add(clusterEntry);
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECS cluster detail");
        }

        return result;
    }

    // Filtered server-side to instance-state-name=running - a stopped
    // instance still exists (still shows in the Console, still billed for
    // its EBS volumes) but isn't actually running, and this tile is meant
    // to answer "what's live right now", not "what has ever been created".
    private static async System.Threading.Tasks.Task DescribeEc2InstancesAsync(
        AWSCredentials awsCredentials, RegionEndpoint regionEndpoint, AwsResourceInventoryDto result)
    {
        try
        {
            using var client = new AmazonEC2Client(awsCredentials, regionEndpoint);

            var response = await client.DescribeInstancesAsync(new DescribeInstancesRequest
            {
                Filters = new List<Amazon.EC2.Model.Filter>
                {
                    new() { Name = "instance-state-name", Values = new List<string> { "running" } }
                }
            });

            // An account/filter combination that matches nothing can come
            // back with these collections left null rather than empty - a
            // zero-instance account is the common case for a freshly wired
            // up credential, not an edge case to skip guarding against.
            var instances = (response.Reservations ?? new List<Reservation>())
                .SelectMany(r => r.Instances ?? new List<Instance>())
                .ToList();

            result.Ec2.Items = instances
                .Select(i => new AwsResourceItemDto
                {
                    Name = i.Tags?.FirstOrDefault(t => t.Key == "Name")?.Value ?? i.InstanceId,
                    Detail = i.InstanceType
                })
                .ToList();

            result.Ec2.Count = instances.Count;
            result.Ec2.Found = true;
        }
        catch (Exception ex)
        {
            result.Ec2.Error = CloudErrorSanitizer.Describe(ex, "AWS", "EC2 inventory");
        }
    }

    private static async System.Threading.Tasks.Task DescribeEcrRepositoriesAsync(
        AWSCredentials awsCredentials, RegionEndpoint regionEndpoint, AwsResourceInventoryDto result)
    {
        try
        {
            using var client = new AmazonECRClient(awsCredentials, regionEndpoint);
            var response = await client.DescribeRepositoriesAsync(new Amazon.ECR.Model.DescribeRepositoriesRequest());
            var repositories = response.Repositories ?? new List<Amazon.ECR.Model.Repository>();

            result.Ecr.Items = repositories
                .Select(r => new AwsResourceItemDto
                {
                    Name = r.RepositoryName,
                    Detail = r.CreatedAt?.ToString("yyyy-MM-dd")
                })
                .ToList();

            result.Ecr.Count = repositories.Count;
            result.Ecr.Found = true;
        }
        catch (Exception ex)
        {
            result.Ecr.Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECR inventory");
        }
    }

    private static async System.Threading.Tasks.Task DescribeVpcsAsync(
        AWSCredentials awsCredentials, RegionEndpoint regionEndpoint, AwsResourceInventoryDto result)
    {
        try
        {
            using var client = new AmazonEC2Client(awsCredentials, regionEndpoint);
            var response = await client.DescribeVpcsAsync(new DescribeVpcsRequest());
            var vpcs = response.Vpcs ?? new List<Vpc>();

            result.Vpc.Items = vpcs
                .Select(v => new AwsResourceItemDto
                {
                    Name = v.Tags?.FirstOrDefault(t => t.Key == "Name")?.Value ?? v.VpcId,
                    Detail = $"{v.CidrBlock}{(v.IsDefault == true ? " · default" : "")}"
                })
                .ToList();

            result.Vpc.Count = vpcs.Count;
            result.Vpc.Found = true;
        }
        catch (Exception ex)
        {
            result.Vpc.Error = CloudErrorSanitizer.Describe(ex, "AWS", "VPC inventory");
        }
    }

    private static async System.Threading.Tasks.Task DescribeLambdaFunctionsAsync(
        AWSCredentials awsCredentials, RegionEndpoint regionEndpoint, AwsResourceInventoryDto result)
    {
        try
        {
            using var client = new AmazonLambdaClient(awsCredentials, regionEndpoint);
            var response = await client.ListFunctionsAsync(new ListFunctionsRequest());
            var functions = response.Functions ?? new List<FunctionConfiguration>();

            result.Lambda.Items = functions
                .Select(f => new AwsResourceItemDto { Name = f.FunctionName, Detail = f.Runtime })
                .ToList();

            result.Lambda.Count = functions.Count;
            result.Lambda.Found = true;
        }
        catch (Exception ex)
        {
            result.Lambda.Error = CloudErrorSanitizer.Describe(ex, "AWS", "Lambda inventory");
        }
    }

    private static async System.Threading.Tasks.Task DescribeSnsTopicsAsync(
        AWSCredentials awsCredentials, RegionEndpoint regionEndpoint, AwsResourceInventoryDto result)
    {
        try
        {
            using var client = new AmazonSimpleNotificationServiceClient(awsCredentials, regionEndpoint);
            var response = await client.ListTopicsAsync(new ListTopicsRequest());
            var topics = response.Topics ?? new List<Topic>();

            result.Sns.Items = topics
                .Select(t => new AwsResourceItemDto
                {
                    // arn:aws:sns:us-east-1:123456789012:my-topic -> "my-topic"
                    Name = t.TopicArn[(t.TopicArn.LastIndexOf(':') + 1)..],
                    Detail = null
                })
                .ToList();

            result.Sns.Count = topics.Count;
            result.Sns.Found = true;
        }
        catch (Exception ex)
        {
            result.Sns.Error = CloudErrorSanitizer.Describe(ex, "AWS", "SNS inventory");
        }
    }

    private static async System.Threading.Tasks.Task DescribeS3BucketsAsync(
        AWSCredentials awsCredentials, RegionEndpoint regionEndpoint, AwsResourceInventoryDto result)
    {
        try
        {
            using var client = new AmazonS3Client(awsCredentials, regionEndpoint);
            var response = await client.ListBucketsAsync(new ListBucketsRequest());
            var buckets = response.Buckets ?? new List<S3Bucket>();

            result.S3.Items = buckets
                .Select(b => new AwsResourceItemDto
                {
                    Name = b.BucketName,
                    Detail = b.CreationDate?.ToString("yyyy-MM-dd")
                })
                .ToList();

            result.S3.Count = buckets.Count;
            result.S3.Found = true;
        }
        catch (Exception ex)
        {
            result.S3.Error = CloudErrorSanitizer.Describe(ex, "AWS", "S3 inventory");
        }
    }

    private static async System.Threading.Tasks.Task DescribeRoute53ZonesAsync(
        AWSCredentials awsCredentials, RegionEndpoint regionEndpoint, AwsResourceInventoryDto result)
    {
        try
        {
            using var client = new AmazonRoute53Client(awsCredentials, regionEndpoint);
            var response = await client.ListHostedZonesAsync(new ListHostedZonesRequest());
            var zones = response.HostedZones ?? new List<HostedZone>();

            result.Route53.Items = zones
                .Select(z => new AwsResourceItemDto
                {
                    Name = z.Name,
                    Detail = $"{z.ResourceRecordSetCount} records"
                })
                .ToList();

            result.Route53.Count = zones.Count;
            result.Route53.Found = true;
        }
        catch (Exception ex)
        {
            result.Route53.Error = CloudErrorSanitizer.Describe(ex, "AWS", "Route53 inventory");
        }
    }

    // ARN service namespaces already covered by their own dedicated tile
    // above - skipped here so the same resource never shows up twice.
    // "ec2" also covers VPC/subnet/security-group/volume ARNs, not just
    // instances; excluding the whole namespace is a deliberate trade-off
    // (those stay covered only by the Ec2/Vpc tiles' own explicit calls,
    // not by this broader scan) rather than re-splitting "ec2" back apart
    // here.
    private static readonly HashSet<string> KnownServiceNamespaces = new(StringComparer.OrdinalIgnoreCase)
    {
        "ec2", "ecr", "s3", "lambda", "route53", "sns"
    };

    // Friendly plural names for the ARN service namespaces this commonly
    // turns up - anything not listed here still gets a tile, just with a
    // titleized fallback label instead of a hand-picked one.
    private static readonly Dictionary<string, string> ServiceLabels = new(StringComparer.OrdinalIgnoreCase)
    {
        ["dynamodb"] = "DynamoDB Tables",
        ["rds"] = "RDS Databases",
        ["sqs"] = "SQS Queues",
        ["secretsmanager"] = "Secrets Manager Secrets",
        ["kms"] = "KMS Keys",
        ["elasticloadbalancing"] = "Load Balancers",
        ["cloudfront"] = "CloudFront Distributions",
        ["apigateway"] = "API Gateways",
        ["eks"] = "EKS Clusters",
        ["ecs"] = "ECS Clusters/Services",
        ["elasticache"] = "ElastiCache Clusters",
        ["states"] = "Step Functions",
        ["events"] = "EventBridge Rules",
        ["logs"] = "CloudWatch Log Groups",
        ["cloudwatch"] = "CloudWatch Alarms",
        ["iam"] = "IAM Roles",
        ["acm"] = "ACM Certificates",
        ["es"] = "OpenSearch Domains",
        ["kinesis"] = "Kinesis Streams",
        ["cloudformation"] = "CloudFormation Stacks",
        ["autoscaling"] = "Auto Scaling Groups",
        ["elasticfilesystem"] = "EFS File Systems",
        ["redshift"] = "Redshift Clusters",
        ["glue"] = "Glue Resources",
        ["sagemaker"] = "SageMaker Resources"
    };

    // "All the services on that region, based on the access key" — rather
    // than hand-writing one SDK call per AWS service (there are ~300),
    // this asks the Resource Groups Tagging API for every resource it can
    // see in the region in one paginated scan, then groups whatever comes
    // back by ARN service namespace into a tile per service actually in
    // use. Capped at a few pages - this is a Dashboard glance, not an
    // exhaustive account audit, and an account with thousands of tagged
    // resources shouldn't make this card hang.
    private static async System.Threading.Tasks.Task DescribeOtherResourcesAsync(
        AWSCredentials awsCredentials, RegionEndpoint regionEndpoint, AwsResourceInventoryDto result)
    {
        try
        {
            using var client = new AmazonResourceGroupsTaggingAPIClient(awsCredentials, regionEndpoint);

            var groups = new Dictionary<string, AwsServiceGroupDto>(StringComparer.OrdinalIgnoreCase);
            string? paginationToken = null;
            var pagesFetched = 0;

            do
            {
                var response = await client.GetResourcesAsync(new GetResourcesRequest
                {
                    ResourcesPerPage = 100,
                    PaginationToken = paginationToken
                });

                foreach (var mapping in response.ResourceTagMappingList ?? new List<ResourceTagMapping>())
                {
                    var (service, type, name) = ParseArn(mapping.ResourceARN);

                    if (KnownServiceNamespaces.Contains(service))
                        continue;

                    if (!groups.TryGetValue(service, out var group))
                    {
                        group = new AwsServiceGroupDto { Key = service, Label = LabelFor(service) };
                        groups[service] = group;
                    }

                    group.Items.Add(new AwsResourceItemDto { Name = name, Detail = type });
                    group.Count++;
                }

                paginationToken = response.PaginationToken;
                pagesFetched++;
            }
            while (!string.IsNullOrEmpty(paginationToken) && pagesFetched < 5);

            foreach (var group in groups.Values)
                group.Items = group.Items.Take(MaxOtherItemsPerGroup).ToList();

            result.Other = groups.Values.OrderByDescending(g => g.Count).ToList();
        }
        catch (Exception ex)
        {
            result.OtherError = CloudErrorSanitizer.Describe(ex, "AWS", "resource discovery");
        }
    }

    // Well above the Cloud Services page's own 10-per-page list (see
    // CloudServiceDetailModal's RESOURCE_PAGE_SIZE) so its pagination has
    // real depth to page through - a cap that happened to match page size
    // exactly would've made "page 2" always come up empty regardless of
    // how many resources actually exist.
    private const int MaxOtherItemsPerGroup = 50;

    // arn:partition:service:region:account:resource -> (service, type, name).
    // "resource" itself varies by service: "type/id" (ecr, ecs), "type:id"
    // (lambda), or just a bare id/name with no type prefix at all (s3,
    // sns) - the split on the first '/' or ':' handles all three shapes.
    private static (string Service, string? Type, string Name) ParseArn(string arn)
    {
        var parts = arn.Split(':', 6);
        var service = parts.Length > 2 ? parts[2] : "aws";
        var resource = parts.Length > 5 ? parts[5] : arn;

        var separatorIndex = resource.IndexOfAny(new[] { '/', ':' });

        return separatorIndex > 0 && separatorIndex < resource.Length - 1
            ? (service, resource[..separatorIndex], resource[(separatorIndex + 1)..])
            : (service, null, resource);
    }

    private static string LabelFor(string service) =>
        ServiceLabels.TryGetValue(service, out var label)
            ? label
            : System.Globalization.CultureInfo.InvariantCulture.TextInfo.ToTitleCase(service) + " Resources";

    public async Task<CloudStatusDto> GetAzureWebAppStatusAsync(
        UserAzureCredentials credentials,
        string? subscriptionId,
        string? resourceGroup,
        string? webAppName)
    {
        if (!credentials.IsConfigured)
            return new CloudStatusDto { Provider = "azure", Configured = false };

        var result = new CloudStatusDto { Provider = "azure", Configured = true };

        if (string.IsNullOrWhiteSpace(subscriptionId) || string.IsNullOrWhiteSpace(resourceGroup) || string.IsNullOrWhiteSpace(webAppName))
        {
            result.Error = "This environment has no Azure subscription/resource group/Web App name configured yet.";
            return result;
        }

        try
        {
            var token = await GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
            {
                result.Error = "Azure sign-in failed — check the tenant, client ID, and client secret.";
                return result;
            }

            var url = $"https://management.azure.com/subscriptions/{Uri.EscapeDataString(subscriptionId)}" +
                      $"/resourceGroups/{Uri.EscapeDataString(resourceGroup)}" +
                      $"/providers/Microsoft.Web/sites/{Uri.EscapeDataString(webAppName)}?api-version=2022-03-01";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await AzureHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = response.StatusCode == System.Net.HttpStatusCode.NotFound
                    ? $"No Azure Web App named \"{webAppName}\" found in that resource group."
                    : $"Azure returned {(int)response.StatusCode}.";

                return result;
            }

            var json = await response.Content.ReadAsStringAsync();
            var site = JObject.Parse(json);
            var properties = site["properties"];

            result.AzureState = properties?["state"]?.ToString();
            result.AzureDefaultHostname = properties?["defaultHostName"]?.ToString();

            result.AzureLastModifiedUtc = DateTime.TryParse(
                properties?["lastModifiedTimeUtc"]?.ToString(),
                out var lastModified)
                    ? lastModified
                    : null;

            result.Found = true;
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "Web App status");
        }

        return result;
    }

    // Internal (not private) so CloudServiceManagementService's own ACR
    // calls can get an ARM/registry-scoped token the exact same way,
    // rather than duplicating this OAuth client-credentials exchange.
    //
    // On failure this THROWS (an HttpRequestException carrying AAD's own
    // error_description, e.g. "AADSTS7000215: Invalid client secret
    // provided...") rather than returning null - same fix, same reasoning
    // as AzureDevOpsService's own EnsureAzureDevOpsSuccessAsync (Round 69):
    // every caller already wraps its own work in a try/catch that hands
    // the exception to CloudErrorSanitizer.Describe, which already has an
    // HttpRequestException branch that surfaces .Message verbatim - so a
    // wrong tenant, wrong client ID, or a pasted Secret ID instead of the
    // actual Secret VALUE now shows AAD's own real reason instead of a
    // generic "Azure sign-in failed" that gave no lead to chase. Callers
    // that still null-check this method's result (from before this fix)
    // are harmless dead code for the "token request itself failed" case -
    // left in place rather than stripped everywhere, since this method
    // can still legitimately return a null access_token if AAD's response
    // body is shaped unexpectedly.
    internal static async Task<string?> GetAzureAccessTokenAsync(
        string tenantId, string clientId, string clientSecret, string scope = "https://management.azure.com/.default")
    {
        var url = $"https://login.microsoftonline.com/{Uri.EscapeDataString(tenantId)}/oauth2/v2.0/token";

        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["scope"] = scope
        });

        var response = await AzureHttpClient.PostAsync(url, form);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            string? message = null;

            try
            {
                var parsed = JObject.Parse(body);
                message = parsed["error_description"]?.ToString() ?? parsed["error"]?.ToString();
            }
            catch
            {
                // AAD's error responses are always JSON in practice, but
                // fall through to the raw body below rather than assume.
            }

            var detail = !string.IsNullOrWhiteSpace(message) ? message
                : !string.IsNullOrWhiteSpace(body) ? body
                : $"{(int)response.StatusCode} {response.StatusCode}";

            throw new HttpRequestException(detail, null, response.StatusCode);
        }

        var json = await response.Content.ReadAsStringAsync();
        return JObject.Parse(json)["access_token"]?.ToString();
    }

    // "Which App Registration am I" for the Settings > Azure tab, the
    // Azure equivalent of GetCallerIdentityLabelAsync above. Unlike AWS's
    // STS call (always allowed, no permission needed), reading a service
    // principal's own display name from Microsoft Graph needs that app to
    // actually have been granted a Graph read permission with admin
    // consent - not guaranteed for an arbitrary App Registration set up
    // only for Azure Resource Manager access. Best-effort: silently
    // returns null (falls back to just showing "Configured") rather than
    // surfacing a Graph permission error on what's meant to be a minor
    // display nicety, not a required step.
    public async Task<string?> GetAzureIdentityLabelAsync(UserAzureCredentials credentials)
    {
        if (!credentials.IsConfigured)
            return null;

        try
        {
            var token = await GetAzureAccessTokenAsync(
                credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!,
                "https://graph.microsoft.com/.default");

            if (token == null)
                return null;

            var url = $"https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '{Uri.EscapeDataString(credentials.ClientId!)}'&$select=displayName";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await AzureHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return null;

            var json = await response.Content.ReadAsStringAsync();
            var displayName = JObject.Parse(json)["value"]?.FirstOrDefault()?["displayName"]?.ToString();

            return string.IsNullOrWhiteSpace(displayName) ? null : displayName;
        }
        catch
        {
            return null;
        }
    }

    private static string AppendError(string? existing, string next) =>
        string.IsNullOrEmpty(existing) ? next : $"{existing}; {next}";

    // Friendly labels for the ARM resource types this subscription is most
    // likely to actually have - anything not listed here still gets a
    // group (see AzureLabelFor's own fallback), just with a plainer,
    // auto-derived label instead of a hand-written one.
    private static readonly Dictionary<string, string> AzureResourceTypeLabels = new(StringComparer.OrdinalIgnoreCase)
    {
        ["microsoft.compute/virtualmachines"] = "Virtual Machines",
        ["microsoft.compute/disks"] = "Managed Disks",
        ["microsoft.compute/virtualmachinescalesets"] = "VM Scale Sets",
        ["microsoft.storage/storageaccounts"] = "Storage Accounts",
        ["microsoft.web/sites"] = "App Services",
        ["microsoft.web/serverfarms"] = "App Service Plans",
        ["microsoft.sql/servers"] = "SQL Servers",
        ["microsoft.sql/servers/databases"] = "SQL Databases",
        ["microsoft.documentdb/databaseaccounts"] = "Cosmos DB Accounts",
        ["microsoft.dbformysql/flexibleservers"] = "Azure Database for MySQL",
        ["microsoft.dbforpostgresql/flexibleservers"] = "Azure Database for PostgreSQL",
        ["microsoft.cache/redis"] = "Azure Cache for Redis",
        ["microsoft.network/virtualnetworks"] = "Virtual Networks",
        ["microsoft.network/networksecuritygroups"] = "Network Security Groups",
        ["microsoft.network/publicipaddresses"] = "Public IP Addresses",
        ["microsoft.network/loadbalancers"] = "Load Balancers",
        ["microsoft.network/applicationgateways"] = "Application Gateways",
        ["microsoft.network/dnszones"] = "DNS Zones",
        ["microsoft.containerregistry/registries"] = "Container Registries",
        ["microsoft.containerservice/managedclusters"] = "AKS Clusters",
        ["microsoft.containerinstance/containergroups"] = "Container Instances",
        ["microsoft.keyvault/vaults"] = "Key Vaults",
        ["microsoft.insights/components"] = "Application Insights",
        ["microsoft.operationalinsights/workspaces"] = "Log Analytics Workspaces",
        ["microsoft.servicebus/namespaces"] = "Service Bus Namespaces",
        ["microsoft.eventhub/namespaces"] = "Event Hubs Namespaces",
        ["microsoft.logic/workflows"] = "Logic Apps",
        ["microsoft.cdn/profiles"] = "CDN Profiles"
    };

    private static string AzureLabelFor(string resourceType) =>
        AzureResourceTypeLabels.TryGetValue(resourceType, out var label)
            ? label
            : resourceType.Contains('/') ? resourceType[(resourceType.LastIndexOf('/') + 1)..] : resourceType;

    // Cloud Services' Azure sub-page - the Azure equivalent of
    // GetAwsResourceInventoryAsync above, but built on ARM's own generic
    // resource-listing endpoint (subscriptions/{sub}/resources) rather than
    // one hand-written call per service - Azure Resource Manager already
    // returns every resource in the subscription, of every type, in one
    // paginated scan, so there's no AWS-style "known services + tagging API
    // fallback" split needed here at all. Grouped by ARM's own `type` field
    // (e.g. "Microsoft.Compute/virtualMachines") - one tile per resource
    // type actually found, same shape the AWS inventory's "Other" bucket
    // already uses (see DescribeOtherResourcesAsync above). Capped at 5
    // pages, same reasoning as that method: this is a glance, not an
    // exhaustive audit.
    public async Task<AzureResourceInventoryDto> GetAzureResourceInventoryAsync(UserAzureCredentials credentials)
    {
        var result = new AzureResourceInventoryDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        if (string.IsNullOrWhiteSpace(credentials.SubscriptionId))
        {
            result.Error = "No Subscription ID configured — set one in Settings → Credentials → Azure.";
            return result;
        }

        try
        {
            var token = await GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
            {
                result.Error = "Azure sign-in failed — check the tenant, client ID, and client secret.";
                return result;
            }

            var groups = new Dictionary<string, AwsServiceGroupDto>(StringComparer.OrdinalIgnoreCase);
            var url = $"https://management.azure.com/subscriptions/{Uri.EscapeDataString(credentials.SubscriptionId)}/resources?api-version=2021-04-01&$top=100";
            var pagesFetched = 0;

            while (!string.IsNullOrEmpty(url) && pagesFetched < 5)
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                var response = await AzureHttpClient.SendAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    result.Error = $"Unable to reach Azure for resource discovery ({(int)response.StatusCode}).";
                    return result;
                }

                var json = JObject.Parse(await response.Content.ReadAsStringAsync());
                var resources = json["value"] as JArray ?? new JArray();

                foreach (var r in resources)
                {
                    var type = r["type"]?.ToString();

                    if (string.IsNullOrWhiteSpace(type))
                        continue;

                    var key = type.ToLowerInvariant();

                    if (!groups.TryGetValue(key, out var group))
                    {
                        group = new AwsServiceGroupDto { Key = key, Label = AzureLabelFor(key) };
                        groups[key] = group;
                    }

                    group.Items.Add(new AwsResourceItemDto
                    {
                        Name = r["name"]?.ToString() ?? string.Empty,
                        Detail = r["location"]?.ToString()
                    });
                    group.Count++;
                }

                url = json["nextLink"]?.ToString();
                pagesFetched++;
            }

            foreach (var group in groups.Values)
                group.Items = group.Items.Take(50).ToList();

            result.Groups = groups.Values.OrderByDescending(g => g.Count).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "resource discovery");
        }

        return result;
    }
}

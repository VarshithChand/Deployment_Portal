using Amazon;
using Amazon.EC2;
using Amazon.EC2.Model;
using Amazon.ECR;
using Amazon.ECR.Model;
using Amazon.ECS;
using Amazon.ECS.Model;
using Amazon.Lambda;
using Amazon.Lambda.Model;
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
                Error = $"MFA verification failed: {ex.Message}"
            };
        }
    }

    private static AWSCredentials BuildCredentials(UserAwsCredentials credentials) =>
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
            result.Error = AppendError(result.Error, $"ECS: {ex.Message}");
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
            result.Error = AppendError(result.Error, $"ECR: {ex.Message}");
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
            result.Ec2.Error = result.Vpc.Error = result.S3.Error = result.Lambda.Error = result.Route53.Error = result.Sns.Error = mfaError;
            return result;
        }

        var effectiveRegion = string.IsNullOrWhiteSpace(region) ? credentials.Region : region;
        result.Region = effectiveRegion;

        var awsCredentials = BuildCredentials(credentials);
        var tasks = new List<System.Threading.Tasks.Task>();

        // EC2, VPC, and Lambda are regional - nothing to call without one.
        if (!string.IsNullOrWhiteSpace(effectiveRegion))
        {
            var regionEndpoint = RegionEndpoint.GetBySystemName(effectiveRegion);

            tasks.Add(DescribeEc2InstancesAsync(awsCredentials, regionEndpoint, result));
            tasks.Add(DescribeVpcsAsync(awsCredentials, regionEndpoint, result));
            tasks.Add(DescribeLambdaFunctionsAsync(awsCredentials, regionEndpoint, result));
            tasks.Add(DescribeSnsTopicsAsync(awsCredentials, regionEndpoint, result));
        }
        else
        {
            const string noRegionError = "No AWS region configured — set one in Settings → Credentials → AWS.";
            result.Ec2.Error = result.Vpc.Error = result.Lambda.Error = result.Sns.Error = noRegionError;
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
            result.Ec2.Error = ex.Message;
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
            result.Vpc.Error = ex.Message;
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
            result.Lambda.Error = ex.Message;
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
            result.Sns.Error = ex.Message;
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
            result.S3.Error = ex.Message;
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
            result.Route53.Error = ex.Message;
        }
    }

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
            result.Error = $"Azure: {ex.Message}";
        }

        return result;
    }

    private static async Task<string?> GetAzureAccessTokenAsync(
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
            return null;

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
}

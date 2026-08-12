using Amazon;
using Amazon.ECR;
using Amazon.ECR.Model;
using Amazon.ECS;
using Amazon.ECS.Model;
using Amazon.Runtime;
using Amazon.SecurityToken;
using Amazon.SecurityToken.Model;
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

            var describeResponse = await ecrClient.DescribeImagesAsync(new DescribeImagesRequest
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

    private static async Task<string?> GetAzureAccessTokenAsync(string tenantId, string clientId, string clientSecret)
    {
        var url = $"https://login.microsoftonline.com/{Uri.EscapeDataString(tenantId)}/oauth2/v2.0/token";

        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["scope"] = "https://management.azure.com/.default"
        });

        var response = await AzureHttpClient.PostAsync(url, form);

        if (!response.IsSuccessStatusCode)
            return null;

        var json = await response.Content.ReadAsStringAsync();
        return JObject.Parse(json)["access_token"]?.ToString();
    }

    private static string AppendError(string? existing, string next) =>
        string.IsNullOrEmpty(existing) ? next : $"{existing}; {next}";
}

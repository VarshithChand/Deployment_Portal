using Amazon;
using Amazon.ECR;
using Amazon.ECR.Model;
using Amazon.ECS;
using Amazon.ECS.Model;
using Amazon.Runtime;
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

        var effectiveRegion = string.IsNullOrWhiteSpace(region) ? credentials.Region : region;

        if (string.IsNullOrWhiteSpace(effectiveRegion))
        {
            result.Found = false;
            result.Error = "No AWS region configured — set one on the environment or when entering credentials.";
            return result;
        }

        var awsCredentials = new BasicAWSCredentials(credentials.AccessKeyId, credentials.SecretAccessKey);
        var regionEndpoint = RegionEndpoint.GetBySystemName(effectiveRegion);

        var anyTarget = false;

        if (!string.IsNullOrWhiteSpace(cluster) && !string.IsNullOrWhiteSpace(service))
        {
            anyTarget = true;

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

        if (!string.IsNullOrWhiteSpace(ecrRepository))
        {
            anyTarget = true;

            try
            {
                using var ecrClient = new AmazonECRClient(awsCredentials, regionEndpoint);

                var listResponse = await ecrClient.ListImagesAsync(new ListImagesRequest
                {
                    RepositoryName = ecrRepository,
                    MaxResults = 10
                });

                if (listResponse.ImageIds.Count > 0)
                {
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
            }
            catch (Exception ex)
            {
                result.Error = AppendError(result.Error, $"ECR: {ex.Message}");
            }
        }

        if (!anyTarget)
        {
            result.Error = "This environment has no ECS cluster/service or ECR repository configured yet.";
        }

        result.Found = result.Error == null;
        return result;
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

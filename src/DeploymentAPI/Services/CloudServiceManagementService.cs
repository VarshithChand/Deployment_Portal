using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using Amazon;
using Amazon.CloudWatch;
using Amazon.CloudWatch.Model;
using Amazon.CloudWatchLogs;
using Amazon.CloudWatchLogs.Model;
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
using DeploymentAPI.Helpers;
using Newtonsoft.Json.Linq;

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
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "EC2 start") };
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
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "EC2 stop") };
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
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "EC2 reboot") };
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
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "EC2 termination") };
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
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECS scale") };
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
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECR repository list");
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
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECR image list");
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
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECR repository creation") };
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
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECR repository deletion") };
        }
    }

    // ================= ACR (Azure Container Registry) =================
    //
    // Mirrors the ECR section above's shape - Configured/Error contract,
    // never throws out to the caller - but the auth mechanics are entirely
    // different: ECR uses the AWS SDK's own signed-request machinery, ACR
    // has no .NET SDK dependency in this project at all, so this talks to
    // ARM and the registry's own data-plane REST API directly (same "raw
    // HttpClient, not a vendor SDK" convention this app already uses for
    // every PaaS provider integration in PaasProviderService).
    //
    // Getting from an App Registration's client secret to something the
    // registry's Docker Registry HTTP API V2 endpoints (/v2/_catalog etc.)
    // will accept is a real two-step exchange, not one token:
    //   1. ARM-scoped AAD token (CloudStatusService.GetAzureAccessTokenAsync,
    //      the same one the Web App status panel already uses) -> exchanged
    //      at POST https://{loginServer}/oauth2/exchange for an ACR refresh
    //      token.
    //   2. That refresh token -> exchanged at
    //      POST https://{loginServer}/oauth2/token for a repository-scoped
    //      ACR access token, which is what actually authenticates the
    //      /v2/... and /acr/v1/... calls below.
    // This exact exchange is the standard, documented ACR auth flow - not
    // guessed - but the exact JSON field names ACR's ARM listing endpoint
    // and its own /acr/v1/{repo}/_tags extension API return are the least-
    // certain part of this integration (same posture as this app's own
    // Render Metrics API integration) - written defensively so an
    // unexpected field name degrades to a blank value, never a 500.

    private static readonly HttpClient AcrHttpClient = new();

    private static async Task<string?> GetAcrAccessTokenAsync(UserAzureCredentials credentials, string loginServer)
    {
        var aadToken = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

        if (aadToken == null)
            return null;

        var exchangeForm = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "access_token",
            ["service"] = loginServer,
            ["access_token"] = aadToken
        });

        var exchangeResponse = await AcrHttpClient.PostAsync($"https://{loginServer}/oauth2/exchange", exchangeForm);

        if (!exchangeResponse.IsSuccessStatusCode)
            return null;

        var refreshToken = JObject.Parse(await exchangeResponse.Content.ReadAsStringAsync())["refresh_token"]?.ToString();

        if (string.IsNullOrEmpty(refreshToken))
            return null;

        var tokenForm = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["service"] = loginServer,
            ["scope"] = "repository:*:pull",
            ["refresh_token"] = refreshToken
        });

        var tokenResponse = await AcrHttpClient.PostAsync($"https://{loginServer}/oauth2/token", tokenForm);

        if (!tokenResponse.IsSuccessStatusCode)
            return null;

        return JObject.Parse(await tokenResponse.Content.ReadAsStringAsync())["access_token"]?.ToString();
    }

    public async Task<AzureAcrRegistryListDto> GetAcrRegistriesAsync(UserAzureCredentials credentials)
    {
        var result = new AzureAcrRegistryListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        if (string.IsNullOrWhiteSpace(credentials.SubscriptionId))
        {
            result.Error = "No Subscription ID configured — set one in Settings → Credentials → Azure.";
            return result;
        }

        try
        {
            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
            {
                result.Error = "Unable to authenticate with Azure.";
                return result;
            }

            var url = $"https://management.azure.com/subscriptions/{Uri.EscapeDataString(credentials.SubscriptionId)}" +
                      "/providers/Microsoft.ContainerRegistry/registries?api-version=2023-11-01-preview";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await AcrHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = $"Unable to reach Azure for ACR registry list ({(int)response.StatusCode}).";
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var registries = json["value"] as JArray ?? new JArray();

            result.Registries = registries.Select(r => new AzureAcrRegistryDto
            {
                Name = r["name"]?.ToString() ?? string.Empty,
                LoginServer = r["properties"]?["loginServer"]?.ToString() ?? string.Empty,
                Sku = r["sku"]?["name"]?.ToString(),
                CreatedAt = DateTime.TryParse(r["properties"]?["creationDate"]?.ToString(), out var created) ? created : null
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "ACR registry list");
        }

        return result;
    }

    public async Task<AzureAcrRepositoryListDto> GetAcrRepositoriesAsync(UserAzureCredentials credentials, string loginServer)
    {
        var result = new AzureAcrRepositoryListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var token = await GetAcrAccessTokenAsync(credentials, loginServer);

            if (token == null)
            {
                result.Error = "Unable to authenticate with this registry.";
                return result;
            }

            using var request = new HttpRequestMessage(HttpMethod.Get, $"https://{loginServer}/v2/_catalog");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await AcrHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = $"Unable to reach the registry for its repository list ({(int)response.StatusCode}).";
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var repoNames = (json["repositories"] as JArray)?.Select(r => r.ToString()).ToList() ?? new List<string>();

            foreach (var name in repoNames)
            {
                var entry = new AzureAcrRepositoryDto { Name = name };

                // Best-effort - one repository's tag count failing shouldn't
                // blank the whole table, same posture as ECR's own image
                // count above.
                try
                {
                    using var tagsRequest = new HttpRequestMessage(HttpMethod.Get, $"https://{loginServer}/v2/{Uri.EscapeDataString(name)}/tags/list");
                    tagsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                    var tagsResponse = await AcrHttpClient.SendAsync(tagsRequest);

                    if (tagsResponse.IsSuccessStatusCode)
                    {
                        var tagsJson = JObject.Parse(await tagsResponse.Content.ReadAsStringAsync());
                        entry.TagCount = (tagsJson["tags"] as JArray)?.Count ?? 0;
                    }
                }
                catch
                {
                    // leave TagCount at 0
                }

                result.Repositories.Add(entry);
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "ACR repository list");
        }

        return result;
    }

    public async Task<AzureAcrImageListDto> GetAcrTagsAsync(UserAzureCredentials credentials, string loginServer, string repositoryName)
    {
        var result = new AzureAcrImageListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var token = await GetAcrAccessTokenAsync(credentials, loginServer);

            if (token == null)
            {
                result.Error = "Unable to authenticate with this registry.";
                return result;
            }

            // ACR's own extension API (not the base Docker Registry V2
            // spec) - richer than plain /v2/{repo}/tags/list, which only
            // returns bare tag names with no push date/digest.
            using var request = new HttpRequestMessage(HttpMethod.Get, $"https://{loginServer}/acr/v1/{Uri.EscapeDataString(repositoryName)}/_tags");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await AcrHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = $"Unable to reach the registry for its tag list ({(int)response.StatusCode}).";
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var tags = json["tags"] as JArray ?? new JArray();

            result.Images = tags.Select(t => new AzureAcrImageDto
            {
                Tag = t["name"]?.ToString() ?? string.Empty,
                Digest = t["digest"]?.ToString(),
                PushedAt = DateTime.TryParse(t["createdTime"]?.ToString(), out var created) ? created : null
            })
            .OrderByDescending(i => i.PushedAt)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "ACR tag list");
        }

        return result;
    }

    // ============== GCP Artifact Registry ==============
    //
    // No GCP SDK dependency in this project either - same raw-HttpClient
    // posture as ACR above. The one genuinely new piece with no precedent
    // anywhere in this codebase: GCP's server-to-server auth is a service-
    // account JWT-bearer flow, not a simple client-credentials POST like
    // Azure's - this signs its own JWT assertion with the service
    // account's RSA private key (straight from the pasted JSON key, never
    // written to disk) and exchanges it at Google's token endpoint. This is
    // the single least-certain, most novel part of this whole feature -
    // most likely failure points against a real service account: PEM
    // parsing of the private key, and the JWT's exp/iat claims.

    private static readonly HttpClient GcpHttpClient = new();

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    // Internal (not private) so ObservabilityService's own GCP Cloud
    // Monitoring calls can reuse the exact same service-account JWT
    // exchange rather than duplicating it.
    internal static async Task<string?> GetGcpAccessTokenAsync(string serviceAccountKeyJson, string scope = "https://www.googleapis.com/auth/cloud-platform")
    {
        JObject key;

        try
        {
            key = JObject.Parse(serviceAccountKeyJson);
        }
        catch
        {
            return null;
        }

        var clientEmail = key["client_email"]?.ToString();
        var privateKeyPem = key["private_key"]?.ToString();
        var tokenUri = key["token_uri"]?.ToString();

        if (string.IsNullOrWhiteSpace(clientEmail) || string.IsNullOrWhiteSpace(privateKeyPem))
            return null;

        if (string.IsNullOrWhiteSpace(tokenUri))
            tokenUri = "https://oauth2.googleapis.com/token";

        var now = DateTimeOffset.UtcNow;

        var header = new JObject { ["alg"] = "RS256", ["typ"] = "JWT" };

        var claims = new JObject
        {
            ["iss"] = clientEmail,
            ["scope"] = scope,
            ["aud"] = tokenUri,
            ["exp"] = now.AddMinutes(60).ToUnixTimeSeconds(),
            ["iat"] = now.ToUnixTimeSeconds()
        };

        var headerSegment = Base64UrlEncode(Encoding.UTF8.GetBytes(header.ToString(Newtonsoft.Json.Formatting.None)));
        var claimsSegment = Base64UrlEncode(Encoding.UTF8.GetBytes(claims.ToString(Newtonsoft.Json.Formatting.None)));
        var signingInput = $"{headerSegment}.{claimsSegment}";

        using var rsa = RSA.Create();
        rsa.ImportFromPem(privateKeyPem);

        var signature = rsa.SignData(Encoding.UTF8.GetBytes(signingInput), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var assertion = $"{signingInput}.{Base64UrlEncode(signature)}";

        var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer",
            ["assertion"] = assertion
        });

        var response = await GcpHttpClient.PostAsync(tokenUri, form);

        if (!response.IsSuccessStatusCode)
            return null;

        return JObject.Parse(await response.Content.ReadAsStringAsync())["access_token"]?.ToString();
    }

    public async Task<GcpArtifactRegistryRepositoryListDto> GetArtifactRegistryRepositoriesAsync(UserGcpCredentials credentials)
    {
        var result = new GcpArtifactRegistryRepositoryListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        if (string.IsNullOrWhiteSpace(credentials.Location))
        {
            result.Error = "No location configured — set one in Settings → Credentials → GCP.";
            return result;
        }

        try
        {
            var token = await GetGcpAccessTokenAsync(credentials.ServiceAccountKeyJson!);

            if (token == null)
            {
                result.Error = "Unable to authenticate with GCP.";
                return result;
            }

            var url = $"https://artifactregistry.googleapis.com/v1/projects/{Uri.EscapeDataString(credentials.ProjectId!)}" +
                      $"/locations/{Uri.EscapeDataString(credentials.Location)}/repositories";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await GcpHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = $"Unable to reach GCP for Artifact Registry's repository list ({(int)response.StatusCode}).";
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var repos = json["repositories"] as JArray ?? new JArray();

            result.Repositories = repos.Select(r => new GcpArtifactRegistryRepositoryDto
            {
                Name = r["name"]?.ToString()?.Split('/').LastOrDefault() ?? string.Empty,
                Format = r["format"]?.ToString(),
                CreatedAt = DateTime.TryParse(r["createTime"]?.ToString(), out var created) ? created : null
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GCP", "Artifact Registry repository list");
        }

        return result;
    }

    public async Task<GcpArtifactRegistryImageListDto> GetArtifactRegistryImagesAsync(UserGcpCredentials credentials, string repositoryName)
    {
        var result = new GcpArtifactRegistryImageListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var token = await GetGcpAccessTokenAsync(credentials.ServiceAccountKeyJson!);

            if (token == null)
            {
                result.Error = "Unable to authenticate with GCP.";
                return result;
            }

            // One entry per (digest, tags[]) pair, not one per tag -
            // flattened below so the frontend gets one row per tag, same
            // convention ECR/ACR's own image lists already use.
            var url = $"https://artifactregistry.googleapis.com/v1/projects/{Uri.EscapeDataString(credentials.ProjectId!)}" +
                      $"/locations/{Uri.EscapeDataString(credentials.Location!)}/repositories/{Uri.EscapeDataString(repositoryName)}/dockerImages";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await GcpHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = $"Unable to reach GCP for Artifact Registry's image list ({(int)response.StatusCode}).";
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var images = json["dockerImages"] as JArray ?? new JArray();

            foreach (var image in images)
            {
                var digest = image["name"]?.ToString()?.Split('@').LastOrDefault();
                var pushedAt = DateTime.TryParse(image["uploadTime"]?.ToString(), out var uploaded) ? uploaded : (DateTime?)null;
                var tags = image["tags"] as JArray;

                if (tags != null && tags.Count > 0)
                {
                    foreach (var tag in tags)
                        result.Images.Add(new GcpArtifactRegistryImageDto { Tag = tag.ToString(), Digest = digest, PushedAt = pushedAt });
                }
                else
                {
                    result.Images.Add(new GcpArtifactRegistryImageDto { Tag = "(untagged)", Digest = digest, PushedAt = pushedAt });
                }
            }

            result.Images = result.Images.OrderByDescending(i => i.PushedAt).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GCP", "Artifact Registry image list");
        }

        return result;
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
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "Lambda function list");
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
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "RDS instance list");
        }

        return result;
    }

    // ================= Azure Virtual Machines =================
    //
    // Real VM management (list/start/stop/restart/delete/create) - unlike
    // ACR above (control-plane list + registry data-plane calls) or every
    // other Azure feature in this app so far (read-only), this is genuine
    // write access against ARM's compute/network resource providers,
    // parallel to what AWS's own EC2 management already does in this app
    // (see StartEc2InstanceAsync above) but through raw ARM REST calls
    // instead of an SDK - same "no vendor SDK, raw HttpClient" convention
    // ACR already established for Azure.
    //
    // CreateAzureVmAsync in particular goes further than this app's own
    // AWS EC2 page (which explicitly does NOT implement instance creation
    // - see Ec2ManagementPage.jsx's own comment) because a VM cannot exist
    // without a network interface, which cannot exist without a subnet,
    // which cannot exist without a virtual network - unlike EC2, there is
    // no "just launch it, AWS infers the rest" shortcut on Azure. This
    // mirrors what `az vm create` itself does by default: auto-create a
    // new VNet/Subnet/NSG/Public IP/NIC per VM with sensible defaults
    // rather than requiring the caller to already have networking set up
    // (see Round 78's own scoping decision - confirmed with the user
    // directly rather than guessed).

    private static readonly HttpClient AzureArmHttpClient = new();

    private const string ComputeApiVersion = "2024-07-01";
    private const string NetworkApiVersion = "2023-09-01";
    private const string ResourceGroupApiVersion = "2021-04-01";

    // A small, curated set rather than every Azure VM size/marketplace
    // image (there are hundreds of each, and most need a per-region
    // availability check this app has no reason to build) - same
    // reasoning as data/awsRegions.js being a curated, not exhaustive,
    // list. Image references match Azure's own long-stable "gen2" Ubuntu
    // 22.04 LTS and Windows Server 2022 Datacenter marketplace listings at
    // time of writing - if Microsoft/Canonical ever retire these specific
    // publisher/offer/sku strings, VM creation fails with ARM's own real
    // "image not found" error (surfaced via DescribeArmErrorAsync), not a
    // silent wrong image.
    public static readonly Dictionary<string, string> VmSizeCatalog = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Standard_B1s"] = "B1s — 1 vCPU, 1 GiB RAM (burstable, smallest)",
        ["Standard_B2s"] = "B2s — 2 vCPU, 4 GiB RAM (burstable)",
        ["Standard_D2s_v3"] = "D2s v3 — 2 vCPU, 8 GiB RAM (general purpose)",
        ["Standard_D4s_v3"] = "D4s v3 — 4 vCPU, 16 GiB RAM (general purpose)"
    };

    public record VmImageRef(string Publisher, string Offer, string Sku, string Version, bool IsWindows, string Label);

    public static readonly Dictionary<string, VmImageRef> VmImageCatalog = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ubuntu-22-04"] = new VmImageRef("Canonical", "0001-com-ubuntu-server-jammy", "22_04-lts-gen2", "latest", false, "Ubuntu Server 22.04 LTS"),
        ["windows-server-2022"] = new VmImageRef("MicrosoftWindowsServer", "WindowsServer", "2022-datacenter-azure-edition", "latest", true, "Windows Server 2022 Datacenter")
    };

    // Every VM in the subscription, in one call - statusOnly=true asks
    // ARM to include each VM's instanceView (which is where PowerState
    // actually lives) directly in the list response, rather than needing
    // a second GET per VM the way a plain list would. PrivateIp/PublicIp
    // are deliberately left blank here - resolving them needs a follow-up
    // NIC (and, for the public one, a further public-IP) lookup per VM,
    // which this list intentionally doesn't fan out to keep this call
    // count bounded regardless of how many VMs exist; click into a VM's
    // own resource detail (GetAzureResourceDetailAsync) for its full
    // networkProfile.
    public async Task<AzureVmListDto> GetAzureVmsAsync(UserAzureCredentials credentials)
    {
        var result = new AzureVmListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        if (string.IsNullOrWhiteSpace(credentials.SubscriptionId))
        {
            result.Error = "No Subscription ID configured — set one in Settings → Credentials → Azure.";
            return result;
        }

        try
        {
            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
            {
                result.Error = "Azure sign-in failed — check the tenant, client ID, and client secret.";
                return result;
            }

            var url = $"https://management.azure.com/subscriptions/{Uri.EscapeDataString(credentials.SubscriptionId)}" +
                      $"/providers/Microsoft.Compute/virtualMachines?statusOnly=true&api-version={ComputeApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await AzureArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = await CloudStatusService.DescribeArmErrorAsync(response);
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var vms = json["value"] as JArray ?? new JArray();

            result.Vms = vms.Select(v =>
            {
                var props = v["properties"];
                var statuses = props?["extended"]?["instanceView"]?["statuses"] as JArray ?? new JArray();

                var powerStatus = statuses.FirstOrDefault(s => (s["code"]?.ToString() ?? "").StartsWith("PowerState/", StringComparison.OrdinalIgnoreCase));
                var powerState = powerStatus?["code"]?.ToString()?.Replace("PowerState/", "", StringComparison.OrdinalIgnoreCase) ?? "unknown";

                var resourceId = v["id"]?.ToString() ?? string.Empty;

                return new AzureVmDto
                {
                    Name = v["name"]?.ToString() ?? string.Empty,
                    ResourceGroup = CloudStatusService.ExtractResourceGroup(resourceId) ?? string.Empty,
                    Location = v["location"]?.ToString() ?? string.Empty,
                    Size = props?["hardwareProfile"]?["vmSize"]?.ToString() ?? string.Empty,
                    OsType = props?["storageProfile"]?["osDisk"]?["osType"]?.ToString() ?? string.Empty,
                    PowerState = powerState
                };
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "VM list");
        }

        return result;
    }

    // Start/stop/restart/delete are all real ARM long-running operations
    // (a 200/202 here means "accepted," not "already done") - same "never
    // claims the new state itself, the frontend re-fetches" contract as
    // every AWS action above. Stop uses ARM's deallocate action, not the
    // separate (rarely useful) "power off but keep billing for compute"
    // stop - matches what the Azure Portal's own "Stop" button does, and
    // what a visitor actually wants when they click "Stop" here.
    private async Task<CloudServiceActionResultDto> RunVmActionAsync(UserAzureCredentials credentials, string resourceGroup, string vmName, string action, string verbFriendly)
    {
        if (!credentials.IsConfigured)
            return new CloudServiceActionResultDto { Success = false, Error = "Azure is not configured." };

        try
        {
            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
                return new CloudServiceActionResultDto { Success = false, Error = "Azure sign-in failed — check the tenant, client ID, and client secret." };

            var url = $"https://management.azure.com/subscriptions/{Uri.EscapeDataString(credentials.SubscriptionId ?? string.Empty)}" +
                      $"/resourceGroups/{Uri.EscapeDataString(resourceGroup)}/providers/Microsoft.Compute/virtualMachines/{Uri.EscapeDataString(vmName)}/{action}?api-version={ComputeApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await AzureArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(response) };

            return new CloudServiceActionResultDto { Success = true, Message = $"{verbFriendly} requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", $"VM {verbFriendly.ToLowerInvariant()}") };
        }
    }

    public Task<CloudServiceActionResultDto> StartAzureVmAsync(UserAzureCredentials credentials, string resourceGroup, string vmName) =>
        RunVmActionAsync(credentials, resourceGroup, vmName, "start", "Start");

    public Task<CloudServiceActionResultDto> StopAzureVmAsync(UserAzureCredentials credentials, string resourceGroup, string vmName) =>
        RunVmActionAsync(credentials, resourceGroup, vmName, "deallocate", "Stop");

    public Task<CloudServiceActionResultDto> RestartAzureVmAsync(UserAzureCredentials credentials, string resourceGroup, string vmName) =>
        RunVmActionAsync(credentials, resourceGroup, vmName, "restart", "Restart");

    // Deletes the VM resource only - its OS disk, NIC, and public IP (all
    // separate ARM resources, same ones CreateAzureVmAsync below creates)
    // are NOT deleted along with it and keep billing until removed
    // separately. Surfaced as a field-hint in the frontend rather than
    // silently cascading a delete across resources the caller never
    // explicitly asked to remove - same "no surprise blast radius"
    // reasoning as this app's other destructive actions.
    public async Task<CloudServiceActionResultDto> DeleteAzureVmAsync(UserAzureCredentials credentials, string resourceGroup, string vmName)
    {
        if (!credentials.IsConfigured)
            return new CloudServiceActionResultDto { Success = false, Error = "Azure is not configured." };

        try
        {
            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
                return new CloudServiceActionResultDto { Success = false, Error = "Azure sign-in failed — check the tenant, client ID, and client secret." };

            var url = $"https://management.azure.com/subscriptions/{Uri.EscapeDataString(credentials.SubscriptionId ?? string.Empty)}" +
                      $"/resourceGroups/{Uri.EscapeDataString(resourceGroup)}/providers/Microsoft.Compute/virtualMachines/{Uri.EscapeDataString(vmName)}?api-version={ComputeApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Delete, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await AzureArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(response) };

            return new CloudServiceActionResultDto { Success = true, Message = "Delete requested — the VM's disk, network interface, and public IP were NOT deleted and may still be billing; remove them separately if you don't need them." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", "VM delete") };
        }
    }

    // One ARM PUT, JSON body in, expects 2xx back - every step of
    // CreateAzureVmAsync below is this same shape, so it's factored out
    // once rather than repeated per resource type.
    private static async Task<(bool Success, string? Error, JObject? Body)> PutArmResourceAsync(string token, string url, object body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Put, url)
        {
            Content = new StringContent(JObject.FromObject(body).ToString(), Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await AzureArmHttpClient.SendAsync(request);
        var responseBody = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
            return (false, await CloudStatusService.DescribeArmErrorAsync(response), null);

        JObject? parsed = null;

        try { parsed = JObject.Parse(responseBody); }
        catch { /* some PUTs (e.g. resource group) return a body this app doesn't need to read */ }

        return (true, null, parsed);
    }

    // Auto-creates a whole new VNet/Subnet/NSG/Public IP/NIC per VM, named
    // off the VM's own name, then the VM itself - see this section's own
    // top comment for why (unlike EC2, Azure has no "launch and let the
    // platform infer the network" shortcut). Each dependent resource's
    // own PUT is awaited (not fired in parallel) since the VM's own
    // creation genuinely depends on the NIC existing first, which depends
    // on the subnet and public IP existing first - a real dependency
    // chain, not an arbitrary ordering choice.
    public async Task<CloudServiceActionResultDto> CreateAzureVmAsync(UserAzureCredentials credentials, AzureCreateVmRequestDto request)
    {
        if (!credentials.IsConfigured)
            return new CloudServiceActionResultDto { Success = false, Error = "Azure is not configured." };

        if (string.IsNullOrWhiteSpace(credentials.SubscriptionId))
            return new CloudServiceActionResultDto { Success = false, Error = "No Subscription ID configured — set one in Settings → Credentials → Azure." };

        if (!VmSizeCatalog.ContainsKey(request.Size))
            return new CloudServiceActionResultDto { Success = false, Error = $"Unknown VM size \"{request.Size}\"." };

        if (!VmImageCatalog.TryGetValue(request.Image, out var image))
            return new CloudServiceActionResultDto { Success = false, Error = $"Unknown VM image \"{request.Image}\"." };

        var hasPassword = !string.IsNullOrWhiteSpace(request.AdminPassword);
        var hasSshKey = !string.IsNullOrWhiteSpace(request.SshPublicKey);

        if (image.IsWindows && !hasPassword)
            return new CloudServiceActionResultDto { Success = false, Error = "Windows images require an admin password — an SSH key alone isn't enough." };

        if (!image.IsWindows && !hasPassword && !hasSshKey)
            return new CloudServiceActionResultDto { Success = false, Error = "Provide an admin password or an SSH public key." };

        try
        {
            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
                return new CloudServiceActionResultDto { Success = false, Error = "Azure sign-in failed — check the tenant, client ID, and client secret." };

            var sub = Uri.EscapeDataString(credentials.SubscriptionId);
            var rg = Uri.EscapeDataString(request.ResourceGroup);
            var name = request.Name;
            var baseUrl = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers";

            // 1. Resource group (idempotent - a no-op if it already exists
            // with the same location).
            var rgUrl = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}?api-version={ResourceGroupApiVersion}";
            var rgResult = await PutArmResourceAsync(token, rgUrl, new { location = request.Location });

            if (!rgResult.Success)
                return new CloudServiceActionResultDto { Success = false, Error = $"Resource group: {rgResult.Error}" };

            // 2. Public IP.
            var pipUrl = $"{baseUrl}/Microsoft.Network/publicIPAddresses/{Uri.EscapeDataString(name)}-pip?api-version={NetworkApiVersion}";
            var pipResult = await PutArmResourceAsync(token, pipUrl, new
            {
                location = request.Location,
                sku = new { name = "Standard" },
                properties = new { publicIPAllocationMethod = "Static" }
            });

            if (!pipResult.Success)
                return new CloudServiceActionResultDto { Success = false, Error = $"Public IP: {pipResult.Error}" };

            var publicIpId = pipResult.Body?["id"]?.ToString()
                ?? $"/subscriptions/{credentials.SubscriptionId}/resourceGroups/{request.ResourceGroup}/providers/Microsoft.Network/publicIPAddresses/{name}-pip";

            // 3. Virtual network + one subnet, in one call.
            var vnetUrl = $"{baseUrl}/Microsoft.Network/virtualNetworks/{Uri.EscapeDataString(name)}-vnet?api-version={NetworkApiVersion}";
            var vnetResult = await PutArmResourceAsync(token, vnetUrl, new
            {
                location = request.Location,
                properties = new
                {
                    addressSpace = new { addressPrefixes = new[] { "10.0.0.0/16" } },
                    subnets = new[] { new { name = "default", properties = new { addressPrefix = "10.0.0.0/24" } } }
                }
            });

            if (!vnetResult.Success)
                return new CloudServiceActionResultDto { Success = false, Error = $"Virtual network: {vnetResult.Error}" };

            var vnetId = vnetResult.Body?["id"]?.ToString()
                ?? $"/subscriptions/{credentials.SubscriptionId}/resourceGroups/{request.ResourceGroup}/providers/Microsoft.Network/virtualNetworks/{name}-vnet";
            var subnetId = $"{vnetId}/subnets/default";

            // 4. Network security group - opens SSH (22) for Linux images
            // or RDP (3389) for Windows, since a NIC with no NSG accepts
            // no inbound traffic from the internet by default (matches
            // what `az vm create` itself opens automatically).
            var nsgUrl = $"{baseUrl}/Microsoft.Network/networkSecurityGroups/{Uri.EscapeDataString(name)}-nsg?api-version={NetworkApiVersion}";
            var remotePort = image.IsWindows ? "3389" : "22";
            var nsgResult = await PutArmResourceAsync(token, nsgUrl, new
            {
                location = request.Location,
                properties = new
                {
                    securityRules = new[]
                    {
                        new
                        {
                            name = "Allow-Remote-Access",
                            properties = new
                            {
                                priority = 1000,
                                direction = "Inbound",
                                access = "Allow",
                                protocol = "Tcp",
                                sourceAddressPrefix = "*",
                                sourcePortRange = "*",
                                destinationAddressPrefix = "*",
                                destinationPortRange = remotePort
                            }
                        }
                    }
                }
            });

            if (!nsgResult.Success)
                return new CloudServiceActionResultDto { Success = false, Error = $"Network security group: {nsgResult.Error}" };

            var nsgId = nsgResult.Body?["id"]?.ToString()
                ?? $"/subscriptions/{credentials.SubscriptionId}/resourceGroups/{request.ResourceGroup}/providers/Microsoft.Network/networkSecurityGroups/{name}-nsg";

            // 5. Network interface, tying the subnet + public IP + NSG
            // together.
            var nicUrl = $"{baseUrl}/Microsoft.Network/networkInterfaces/{Uri.EscapeDataString(name)}-nic?api-version={NetworkApiVersion}";
            var nicResult = await PutArmResourceAsync(token, nicUrl, new
            {
                location = request.Location,
                properties = new
                {
                    ipConfigurations = new[]
                    {
                        new
                        {
                            name = "ipconfig1",
                            properties = new
                            {
                                subnet = new { id = subnetId },
                                publicIPAddress = new { id = publicIpId },
                                privateIPAllocationMethod = "Dynamic"
                            }
                        }
                    },
                    networkSecurityGroup = new { id = nsgId }
                }
            });

            if (!nicResult.Success)
                return new CloudServiceActionResultDto { Success = false, Error = $"Network interface: {nicResult.Error}" };

            var nicId = nicResult.Body?["id"]?.ToString()
                ?? $"/subscriptions/{credentials.SubscriptionId}/resourceGroups/{request.ResourceGroup}/providers/Microsoft.Network/networkInterfaces/{name}-nic";

            // 6. The VM itself.
            object osProfile = image.IsWindows
                ? new { computerName = name, adminUsername = request.AdminUsername, adminPassword = request.AdminPassword }
                : hasSshKey
                    ? new
                    {
                        computerName = name,
                        adminUsername = request.AdminUsername,
                        adminPassword = request.AdminPassword,
                        linuxConfiguration = new
                        {
                            disablePasswordAuthentication = !hasPassword,
                            ssh = new
                            {
                                publicKeys = new[]
                                {
                                    new { path = $"/home/{request.AdminUsername}/.ssh/authorized_keys", keyData = request.SshPublicKey }
                                }
                            }
                        }
                    }
                    : new { computerName = name, adminUsername = request.AdminUsername, adminPassword = request.AdminPassword };

            var vmUrl = $"{baseUrl}/Microsoft.Compute/virtualMachines/{Uri.EscapeDataString(name)}?api-version={ComputeApiVersion}";
            var vmResult = await PutArmResourceAsync(token, vmUrl, new
            {
                location = request.Location,
                properties = new
                {
                    hardwareProfile = new { vmSize = request.Size },
                    storageProfile = new
                    {
                        imageReference = new { publisher = image.Publisher, offer = image.Offer, sku = image.Sku, version = image.Version },
                        osDisk = new { createOption = "FromImage", managedDisk = new { storageAccountType = "Standard_LRS" } }
                    },
                    osProfile,
                    networkProfile = new { networkInterfaces = new[] { new { id = nicId, properties = new { primary = true } } } }
                }
            });

            if (!vmResult.Success)
                return new CloudServiceActionResultDto { Success = false, Error = $"Virtual machine: {vmResult.Error} (its network resources were created and may still be billing even though the VM itself failed - resource group \"{request.ResourceGroup}\")" };

            return new CloudServiceActionResultDto { Success = true, Message = $"\"{name}\" is being created — refresh in a minute to see it." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", "VM creation") };
        }
    }

    // ================= AWS EC2 — instance detail, security groups, metrics =================
    //
    // Phase 1 of the multi-cloud infrastructure console (see
    // security_findings.txt). Connection info (SSH command) is computed
    // client-side from PublicIp/Os below - no backend call, no key
    // material ever crosses this API (section 5/6 of the request this
    // came from).

    public async Task<Ec2InstanceDetailDto> GetEc2InstanceDetailAsync(UserAwsCredentials credentials, string? region, string instanceId)
    {
        var result = new Ec2InstanceDetailDto { Configured = credentials.IsConfigured, InstanceId = instanceId };
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
            using var client = new AmazonEC2Client(BuildCredentials(credentials), endpoint);

            var response = await client.DescribeInstancesAsync(new DescribeInstancesRequest
            {
                InstanceIds = new List<string> { instanceId }
            });

            var instance = response.Reservations?.SelectMany(r => r.Instances ?? new List<Instance>()).FirstOrDefault();

            if (instance == null)
            {
                result.Error = $"Instance \"{instanceId}\" not found.";
                return result;
            }

            result.Name = instance.Tags?.FirstOrDefault(t => t.Key == "Name")?.Value ?? instanceId;
            result.Region = endpoint!.SystemName;
            result.AvailabilityZone = instance.Placement?.AvailabilityZone;
            result.InstanceType = instance.InstanceType?.Value ?? string.Empty;
            result.Os = instance.PlatformDetails ?? (instance.Platform == PlatformValues.Windows ? "Windows" : "Linux/UNIX");
            result.State = instance.State?.Name?.Value ?? "unknown";
            result.LaunchTime = instance.LaunchTime;
            result.PublicIp = instance.PublicIpAddress;
            result.PrivateIp = instance.PrivateIpAddress;
            result.PublicIpv6 = instance.NetworkInterfaces?
                .SelectMany(n => n.Ipv6Addresses ?? new List<InstanceIpv6Address>())
                .FirstOrDefault()?.Ipv6Address;
            result.VpcId = instance.VpcId;
            result.SubnetId = instance.SubnetId;
            result.SecurityGroupIds = instance.SecurityGroups?.Select(g => g.GroupId).ToList() ?? new List<string>();
            result.Tags = instance.Tags?.ToDictionary(t => t.Key, t => t.Value) ?? new Dictionary<string, string>();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "EC2 instance detail");
        }

        return result;
    }

    private static SecurityRuleDto MapEc2Rule(IpPermission perm, string direction, string cidr, string? description) => new()
    {
        Direction = direction,
        Protocol = perm.IpProtocol == "-1" ? "all" : perm.IpProtocol,
        FromPort = perm.IpProtocol == "-1" ? null : perm.FromPort,
        ToPort = perm.IpProtocol == "-1" ? null : perm.ToPort,
        Cidr = cidr,
        Description = description
    };

    private static IEnumerable<SecurityRuleDto> FlattenEc2Permissions(List<IpPermission> permissions, string direction)
    {
        foreach (var perm in permissions)
        {
            foreach (var range in perm.Ipv4Ranges ?? new List<IpRange>())
                yield return MapEc2Rule(perm, direction, range.CidrIp, range.Description);

            foreach (var range in perm.Ipv6Ranges ?? new List<Ipv6Range>())
                yield return MapEc2Rule(perm, direction, range.CidrIpv6, range.Description);
        }
    }

    public async Task<SecurityRuleListDto> GetEc2SecurityGroupsAsync(UserAwsCredentials credentials, string? region, string instanceId)
    {
        var result = new SecurityRuleListDto { Configured = credentials.IsConfigured, Scope = "instance" };
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
            using var client = new AmazonEC2Client(BuildCredentials(credentials), endpoint);

            var instanceResponse = await client.DescribeInstancesAsync(new DescribeInstancesRequest { InstanceIds = new List<string> { instanceId } });
            var instance = instanceResponse.Reservations?.SelectMany(r => r.Instances ?? new List<Instance>()).FirstOrDefault();
            var groupIds = instance?.SecurityGroups?.Select(g => g.GroupId).ToList() ?? new List<string>();

            if (groupIds.Count == 0)
            {
                result.Error = instance == null ? $"Instance \"{instanceId}\" not found." : "This instance has no security groups attached.";
                return result;
            }

            var sgResponse = await client.DescribeSecurityGroupsAsync(new DescribeSecurityGroupsRequest { GroupIds = groupIds });

            foreach (var group in sgResponse.SecurityGroups ?? new List<SecurityGroup>())
            {
                result.Inbound.AddRange(FlattenEc2Permissions(group.IpPermissions ?? new List<IpPermission>(), "Inbound"));
                result.Outbound.AddRange(FlattenEc2Permissions(group.IpPermissionsEgress ?? new List<IpPermission>(), "Outbound"));
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "EC2 security group list");
        }

        return result;
    }

    // Applies to the instance's primary (first-attached) security group -
    // most single-purpose instances only have one; an instance with
    // several SGs attached needs the AWS Console for anything beyond the
    // first (the frontend's own field-hint says so, this isn't hidden).
    private static async Task<(bool ok, string? groupId, string? error)> ResolvePrimarySecurityGroupAsync(AmazonEC2Client client, string instanceId)
    {
        var instanceResponse = await client.DescribeInstancesAsync(new DescribeInstancesRequest { InstanceIds = new List<string> { instanceId } });
        var instance = instanceResponse.Reservations?.SelectMany(r => r.Instances ?? new List<Instance>()).FirstOrDefault();
        var groupId = instance?.SecurityGroups?.FirstOrDefault()?.GroupId;

        if (instance == null)
            return (false, null, $"Instance \"{instanceId}\" not found.");

        if (groupId == null)
            return (false, null, "This instance has no security group attached.");

        return (true, groupId, null);
    }

    public async Task<CloudServiceActionResultDto> AddEc2SecurityGroupRuleAsync(UserAwsCredentials credentials, string? region, string instanceId, AddSecurityRuleRequestDto request)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonEC2Client(BuildCredentials(credentials), endpoint);
            var (resolved, groupId, resolveError) = await ResolvePrimarySecurityGroupAsync(client, instanceId);

            if (!resolved)
                return new CloudServiceActionResultDto { Success = false, Error = resolveError };

            var permission = new IpPermission
            {
                IpProtocol = request.Protocol,
                FromPort = request.FromPort,
                ToPort = request.ToPort,
                Ipv4Ranges = new List<IpRange> { new() { CidrIp = request.Cidr, Description = request.Description } }
            };

            if (string.Equals(request.Direction, "Outbound", StringComparison.OrdinalIgnoreCase))
            {
                await client.AuthorizeSecurityGroupEgressAsync(new AuthorizeSecurityGroupEgressRequest
                {
                    GroupId = groupId,
                    IpPermissions = new List<IpPermission> { permission }
                });
            }
            else
            {
                await client.AuthorizeSecurityGroupIngressAsync(new AuthorizeSecurityGroupIngressRequest
                {
                    GroupId = groupId,
                    IpPermissions = new List<IpPermission> { permission }
                });
            }

            return new CloudServiceActionResultDto { Success = true, Message = "Rule added." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "security group rule add") };
        }
    }

    public async Task<CloudServiceActionResultDto> RemoveEc2SecurityGroupRuleAsync(UserAwsCredentials credentials, string? region, string instanceId, RemoveSecurityRuleRequestDto request)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonEC2Client(BuildCredentials(credentials), endpoint);
            var (resolved, groupId, resolveError) = await ResolvePrimarySecurityGroupAsync(client, instanceId);

            if (!resolved)
                return new CloudServiceActionResultDto { Success = false, Error = resolveError };

            var permission = new IpPermission
            {
                IpProtocol = request.Protocol,
                FromPort = request.FromPort,
                ToPort = request.ToPort,
                Ipv4Ranges = new List<IpRange> { new() { CidrIp = request.Cidr } }
            };

            if (string.Equals(request.Direction, "Outbound", StringComparison.OrdinalIgnoreCase))
            {
                await client.RevokeSecurityGroupEgressAsync(new RevokeSecurityGroupEgressRequest
                {
                    GroupId = groupId,
                    IpPermissions = new List<IpPermission> { permission }
                });
            }
            else
            {
                await client.RevokeSecurityGroupIngressAsync(new RevokeSecurityGroupIngressRequest
                {
                    GroupId = groupId,
                    IpPermissions = new List<IpPermission> { permission }
                });
            }

            return new CloudServiceActionResultDto { Success = true, Message = "Rule removed." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "security group rule removal") };
        }
    }

    public async Task<ResourceMetricsDto> GetEc2MetricsAsync(UserAwsCredentials credentials, string? region, string instanceId, int rangeMinutes)
    {
        var result = new ResourceMetricsDto { Configured = credentials.IsConfigured };
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
            using var client = new AmazonCloudWatchClient(BuildCredentials(credentials), endpoint);

            var end = DateTime.UtcNow;
            var start = end.AddMinutes(-Math.Max(15, rangeMinutes));
            var periodSeconds = rangeMinutes <= 60 ? 60 : rangeMinutes <= 360 ? 300 : rangeMinutes <= 1440 ? 900 : 3600;

            var metrics = new (string Id, string MetricName, string Label, string Unit)[]
            {
                ("cpu", "CPUUtilization", "CPU Utilization", "%"),
                ("netin", "NetworkIn", "Network In", "bytes"),
                ("netout", "NetworkOut", "Network Out", "bytes")
            };

            var response = await client.GetMetricDataAsync(new GetMetricDataRequest
            {
                StartTime = start,
                EndTime = end,
                MetricDataQueries = metrics.Select(m => new MetricDataQuery
                {
                    Id = m.Id,
                    MetricStat = new MetricStat
                    {
                        Metric = new Amazon.CloudWatch.Model.Metric
                        {
                            Namespace = "AWS/EC2",
                            MetricName = m.MetricName,
                            Dimensions = new List<Dimension> { new() { Name = "InstanceId", Value = instanceId } }
                        },
                        Period = periodSeconds,
                        Stat = "Average"
                    }
                }).ToList()
            });

            foreach (var m in metrics)
            {
                var series = response.MetricDataResults?.FirstOrDefault(r => r.Id == m.Id);

                result.Series.Add(new MetricSeriesDto
                {
                    Label = m.Label,
                    Unit = m.Unit,
                    Points = series?.Timestamps == null
                        ? new List<MetricPointDto>()
                        : series.Timestamps.Zip(series.Values, (t, v) => new MetricPointDto { Timestamp = t, Value = v })
                            .OrderBy(p => p.Timestamp).ToList()
                });
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "EC2 metrics");
        }

        return result;
    }

    // ================= Azure VM — detail, NSG rules, metrics =================
    //
    // GetAzureVmDetailAsync follows the NIC -> IPConfig -> PublicIP/
    // Subnet/NSG chain (several ARM calls, unavoidable - ARM doesn't
    // flatten this into the VM response the way EC2's DescribeInstances
    // does).

    public async Task<AzureVmDetailDto> GetAzureVmDetailAsync(UserAzureCredentials credentials, string resourceGroup, string vmName)
    {
        var result = new AzureVmDetailDto { Configured = credentials.IsConfigured, Name = vmName, ResourceGroup = resourceGroup };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
            {
                result.Error = "Azure sign-in failed — check the tenant, client ID, and client secret.";
                return result;
            }

            var sub = Uri.EscapeDataString(credentials.SubscriptionId ?? string.Empty);
            var rg = Uri.EscapeDataString(resourceGroup);
            var vmUrl = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{Uri.EscapeDataString(vmName)}?$expand=instanceView&api-version={ComputeApiVersion}";

            using var vmRequest = new HttpRequestMessage(HttpMethod.Get, vmUrl);
            vmRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var vmResponse = await AzureArmHttpClient.SendAsync(vmRequest);

            if (!vmResponse.IsSuccessStatusCode)
            {
                result.Error = await CloudStatusService.DescribeArmErrorAsync(vmResponse);
                return result;
            }

            var vmJson = JObject.Parse(await vmResponse.Content.ReadAsStringAsync());
            var props = vmJson["properties"];

            result.Location = vmJson["location"]?.ToString() ?? string.Empty;
            result.Size = props?["hardwareProfile"]?["vmSize"]?.ToString() ?? string.Empty;
            result.OsType = props?["storageProfile"]?["osDisk"]?["osType"]?.ToString();
            result.Tags = vmJson["tags"]?.ToObject<Dictionary<string, string>>() ?? new Dictionary<string, string>();

            var statuses = props?["instanceView"]?["statuses"] as JArray ?? new JArray();
            var powerStatus = statuses.FirstOrDefault(s => (s["code"]?.ToString() ?? "").StartsWith("PowerState/", StringComparison.OrdinalIgnoreCase));
            result.PowerState = powerStatus?["code"]?.ToString()?.Replace("PowerState/", "", StringComparison.OrdinalIgnoreCase) ?? "unknown";

            var nicRef = (props?["networkProfile"]?["networkInterfaces"] as JArray)?.FirstOrDefault();
            var nicId = nicRef?["id"]?.ToString();

            if (!string.IsNullOrWhiteSpace(nicId))
            {
                var nicUrl = $"https://management.azure.com{nicId}?api-version={NetworkApiVersion}";
                using var nicRequest = new HttpRequestMessage(HttpMethod.Get, nicUrl);
                nicRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var nicResponse = await AzureArmHttpClient.SendAsync(nicRequest);

                if (nicResponse.IsSuccessStatusCode)
                {
                    var nicJson = JObject.Parse(await nicResponse.Content.ReadAsStringAsync());
                    var ipConfig = (nicJson["properties"]?["ipConfigurations"] as JArray)?.FirstOrDefault();

                    result.PrivateIp = ipConfig?["properties"]?["privateIPAddress"]?.ToString();
                    result.SubnetId = ipConfig?["properties"]?["subnet"]?["id"]?.ToString();
                    result.NsgId = nicJson["properties"]?["networkSecurityGroup"]?["id"]?.ToString();

                    if (!string.IsNullOrWhiteSpace(result.SubnetId) && result.SubnetId.Contains("/subnets/"))
                        result.VNetId = result.SubnetId[..result.SubnetId.IndexOf("/subnets/", StringComparison.Ordinal)];

                    var publicIpId = ipConfig?["properties"]?["publicIPAddress"]?["id"]?.ToString();

                    if (!string.IsNullOrWhiteSpace(publicIpId))
                    {
                        var pipUrl = $"https://management.azure.com{publicIpId}?api-version={NetworkApiVersion}";
                        using var pipRequest = new HttpRequestMessage(HttpMethod.Get, pipUrl);
                        pipRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                        var pipResponse = await AzureArmHttpClient.SendAsync(pipRequest);

                        if (pipResponse.IsSuccessStatusCode)
                        {
                            var pipJson = JObject.Parse(await pipResponse.Content.ReadAsStringAsync());
                            result.PublicIp = pipJson["properties"]?["ipAddress"]?.ToString();
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "VM detail");
        }

        return result;
    }

    private static SecurityRuleDto MapNsgRule(JToken rule)
    {
        var props = rule["properties"];
        var portRangeText = props?["destinationPortRange"]?.ToString();
        var hasPort = int.TryParse(portRangeText, out var port);

        return new SecurityRuleDto
        {
            Id = rule["name"]?.ToString(),
            Direction = props?["direction"]?.ToString() ?? "Inbound",
            Protocol = props?["protocol"]?.ToString() ?? "*",
            FromPort = hasPort ? port : null,
            ToPort = hasPort ? port : null,
            Cidr = props?["sourceAddressPrefix"]?.ToString() ?? "*",
            Description = props?["description"]?.ToString()
        };
    }

    public async Task<SecurityRuleListDto> GetAzureNsgRulesAsync(UserAzureCredentials credentials, string? nsgResourceId)
    {
        var result = new SecurityRuleListDto { Configured = credentials.IsConfigured, Scope = "instance" };

        if (!credentials.IsConfigured)
            return result;

        if (string.IsNullOrWhiteSpace(nsgResourceId))
        {
            result.Error = "This VM has no network security group attached.";
            return result;
        }

        try
        {
            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
            {
                result.Error = "Azure sign-in failed — check the tenant, client ID, and client secret.";
                return result;
            }

            var url = $"https://management.azure.com{nsgResourceId}?api-version={NetworkApiVersion}";
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await AzureArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = await CloudStatusService.DescribeArmErrorAsync(response);
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var rules = json["properties"]?["securityRules"] as JArray ?? new JArray();

            foreach (var rule in rules)
            {
                var mapped = MapNsgRule(rule);

                if (string.Equals(mapped.Direction, "Outbound", StringComparison.OrdinalIgnoreCase))
                    result.Outbound.Add(mapped);
                else
                    result.Inbound.Add(mapped);
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "NSG rule list");
        }

        return result;
    }

    public async Task<CloudServiceActionResultDto> AddAzureNsgRuleAsync(UserAzureCredentials credentials, string? nsgResourceId, AddSecurityRuleRequestDto request)
    {
        if (!credentials.IsConfigured)
            return new CloudServiceActionResultDto { Success = false, Error = "Azure is not configured." };

        if (string.IsNullOrWhiteSpace(nsgResourceId))
            return new CloudServiceActionResultDto { Success = false, Error = "This VM has no network security group attached." };

        try
        {
            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
                return new CloudServiceActionResultDto { Success = false, Error = "Azure sign-in failed — check the tenant, client ID, and client secret." };

            var ruleName = $"portal-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
            var url = $"https://management.azure.com{nsgResourceId}/securityRules/{ruleName}?api-version={NetworkApiVersion}";
            var isInbound = string.Equals(request.Direction, "Inbound", StringComparison.OrdinalIgnoreCase);
            var portRange = request.FromPort == request.ToPort ? request.FromPort.ToString() : $"{request.FromPort}-{request.ToPort}";

            var result = await PutArmResourceAsync(token, url, new
            {
                properties = new
                {
                    priority = 1000 + Random.Shared.Next(0, 3000),
                    direction = isInbound ? "Inbound" : "Outbound",
                    access = "Allow",
                    protocol = request.Protocol.Equals("tcp", StringComparison.OrdinalIgnoreCase) ? "Tcp"
                        : request.Protocol.Equals("udp", StringComparison.OrdinalIgnoreCase) ? "Udp" : "*",
                    sourceAddressPrefix = isInbound ? request.Cidr : "*",
                    sourcePortRange = "*",
                    destinationAddressPrefix = isInbound ? "*" : request.Cidr,
                    destinationPortRange = portRange,
                    description = request.Description
                }
            });

            return result.Success
                ? new CloudServiceActionResultDto { Success = true, Message = "Rule added." }
                : new CloudServiceActionResultDto { Success = false, Error = result.Error };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", "NSG rule add") };
        }
    }

    public async Task<CloudServiceActionResultDto> RemoveAzureNsgRuleAsync(UserAzureCredentials credentials, string? nsgResourceId, string ruleName)
    {
        if (!credentials.IsConfigured)
            return new CloudServiceActionResultDto { Success = false, Error = "Azure is not configured." };

        if (string.IsNullOrWhiteSpace(nsgResourceId))
            return new CloudServiceActionResultDto { Success = false, Error = "This VM has no network security group attached." };

        try
        {
            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
                return new CloudServiceActionResultDto { Success = false, Error = "Azure sign-in failed — check the tenant, client ID, and client secret." };

            var url = $"https://management.azure.com{nsgResourceId}/securityRules/{Uri.EscapeDataString(ruleName)}?api-version={NetworkApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Delete, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await AzureArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(response) };

            return new CloudServiceActionResultDto { Success = true, Message = "Rule removed." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", "NSG rule removal") };
        }
    }

    public async Task<ResourceMetricsDto> GetAzureVmMetricsAsync(UserAzureCredentials credentials, string resourceGroup, string vmName, int rangeMinutes)
    {
        var result = new ResourceMetricsDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
            {
                result.Error = "Azure sign-in failed — check the tenant, client ID, and client secret.";
                return result;
            }

            var sub = Uri.EscapeDataString(credentials.SubscriptionId ?? string.Empty);
            var rg = Uri.EscapeDataString(resourceGroup);
            var resourceId = $"/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{Uri.EscapeDataString(vmName)}";

            var end = DateTimeOffset.UtcNow;
            var start = end.AddMinutes(-Math.Max(15, rangeMinutes));
            var timespan = $"{start:O}/{end:O}";
            var interval = rangeMinutes <= 60 ? "PT1M" : rangeMinutes <= 360 ? "PT5M" : rangeMinutes <= 1440 ? "PT15M" : "PT1H";

            var url = $"https://management.azure.com{resourceId}/providers/microsoft.insights/metrics" +
                      "?api-version=2019-07-01&metricnames=Percentage CPU,Network In Total,Network Out Total" +
                      $"&timespan={Uri.EscapeDataString(timespan)}&interval={interval}&aggregation=Average";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await AzureArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = await CloudStatusService.DescribeArmErrorAsync(response);
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var values = json["value"] as JArray ?? new JArray();

            foreach (var metric in values)
            {
                var name = metric["name"]?["value"]?.ToString() ?? "metric";
                var unit = metric["unit"]?.ToString() ?? "";
                var timeseries = (metric["timeseries"] as JArray)?.FirstOrDefault();
                var data = timeseries?["data"] as JArray ?? new JArray();

                result.Series.Add(new MetricSeriesDto
                {
                    Label = name,
                    Unit = unit,
                    Points = data
                        .Where(d => d["average"] != null)
                        .Select(d => new MetricPointDto
                        {
                            Timestamp = DateTime.Parse(d["timeStamp"]!.ToString()),
                            Value = d["average"]!.Value<double>()
                        })
                        .ToList()
                });
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "VM metrics");
        }

        return result;
    }

    // ================= GCP Compute Engine =================
    //
    // Real VM management (list/start/stop/reset/delete) + VPC firewall
    // rules + metrics via Cloud Monitoring - replaces the "not built yet"
    // stub (CloudServicesGcp.jsx). Reuses GetGcpAccessTokenAsync above -
    // zero new auth code. GCP firewall rules are VPC-global, not attached
    // to one instance the way an AWS security group or Azure NSG is -
    // SecurityRuleListDto.Scope surfaces this honestly.

    public async Task<GcpVmListDto> GetGcpComputeInstancesAsync(UserGcpCredentials credentials)
    {
        var result = new GcpVmListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var token = await GetGcpAccessTokenAsync(credentials.ServiceAccountKeyJson!);

            if (token == null)
            {
                result.Error = "Unable to authenticate with GCP.";
                return result;
            }

            // One aggregatedList call across every zone rather than
            // polling zone by zone (section 29 - bounded call count
            // regardless of how many zones a project actually uses).
            var url = $"https://compute.googleapis.com/compute/v1/projects/{Uri.EscapeDataString(credentials.ProjectId!)}/aggregated/instances";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await GcpHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = $"Unable to reach GCP for Compute Engine's instance list ({(int)response.StatusCode}).";
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var items = json["items"] as JObject ?? new JObject();

            foreach (var zoneEntry in items.Properties())
            {
                var instances = zoneEntry.Value["instances"] as JArray;

                if (instances == null)
                    continue;

                foreach (var instance in instances)
                {
                    var netInterface = (instance["networkInterfaces"] as JArray)?.FirstOrDefault();
                    var accessConfig = (netInterface?["accessConfigs"] as JArray)?.FirstOrDefault();

                    result.Instances.Add(new GcpVmInstanceDto
                    {
                        Name = instance["name"]?.ToString() ?? string.Empty,
                        Zone = instance["zone"]?.ToString()?.Split('/').LastOrDefault() ?? string.Empty,
                        MachineType = instance["machineType"]?.ToString()?.Split('/').LastOrDefault() ?? string.Empty,
                        Status = instance["status"]?.ToString() ?? "UNKNOWN",
                        PrivateIp = netInterface?["networkIP"]?.ToString(),
                        PublicIp = accessConfig?["natIP"]?.ToString(),
                        InstanceId = instance["id"]?.ToString(),
                        Labels = instance["labels"]?.ToObject<Dictionary<string, string>>() ?? new Dictionary<string, string>()
                    });
                }
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GCP", "Compute Engine instance list");
        }

        return result;
    }

    private async Task<CloudServiceActionResultDto> RunGcpVmActionAsync(UserGcpCredentials credentials, string zone, string instanceName, string action, string verbFriendly)
    {
        if (!credentials.IsConfigured)
            return new CloudServiceActionResultDto { Success = false, Error = "GCP is not configured." };

        try
        {
            var token = await GetGcpAccessTokenAsync(credentials.ServiceAccountKeyJson!);

            if (token == null)
                return new CloudServiceActionResultDto { Success = false, Error = "Unable to authenticate with GCP." };

            var url = $"https://compute.googleapis.com/compute/v1/projects/{Uri.EscapeDataString(credentials.ProjectId!)}" +
                      $"/zones/{Uri.EscapeDataString(zone)}/instances/{Uri.EscapeDataString(instanceName)}/{action}";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await GcpHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = $"GCP returned {(int)response.StatusCode} for {verbFriendly.ToLowerInvariant()}." };

            return new CloudServiceActionResultDto { Success = true, Message = $"{verbFriendly} requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "GCP", $"VM {verbFriendly.ToLowerInvariant()}") };
        }
    }

    public Task<CloudServiceActionResultDto> StartGcpVmAsync(UserGcpCredentials credentials, string zone, string instanceName) =>
        RunGcpVmActionAsync(credentials, zone, instanceName, "start", "Start");

    public Task<CloudServiceActionResultDto> StopGcpVmAsync(UserGcpCredentials credentials, string zone, string instanceName) =>
        RunGcpVmActionAsync(credentials, zone, instanceName, "stop", "Stop");

    public Task<CloudServiceActionResultDto> ResetGcpVmAsync(UserGcpCredentials credentials, string zone, string instanceName) =>
        RunGcpVmActionAsync(credentials, zone, instanceName, "reset", "Reset");

    public async Task<CloudServiceActionResultDto> DeleteGcpVmAsync(UserGcpCredentials credentials, string zone, string instanceName)
    {
        if (!credentials.IsConfigured)
            return new CloudServiceActionResultDto { Success = false, Error = "GCP is not configured." };

        try
        {
            var token = await GetGcpAccessTokenAsync(credentials.ServiceAccountKeyJson!);

            if (token == null)
                return new CloudServiceActionResultDto { Success = false, Error = "Unable to authenticate with GCP." };

            var url = $"https://compute.googleapis.com/compute/v1/projects/{Uri.EscapeDataString(credentials.ProjectId!)}" +
                      $"/zones/{Uri.EscapeDataString(zone)}/instances/{Uri.EscapeDataString(instanceName)}";

            using var request = new HttpRequestMessage(HttpMethod.Delete, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await GcpHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = $"GCP returned {(int)response.StatusCode} for delete." };

            return new CloudServiceActionResultDto { Success = true, Message = "Delete requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "GCP", "VM deletion") };
        }
    }

    private static SecurityRuleDto MapGcpFirewallRule(JToken rule)
    {
        var allowed = (rule["allowed"] as JArray)?.FirstOrDefault();
        var denied = allowed == null ? (rule["denied"] as JArray)?.FirstOrDefault() : null;
        var spec = allowed ?? denied;
        var ports = (spec?["ports"] as JArray)?.Select(p => p.ToString()).ToList() ?? new List<string>();
        var portRange = ports.FirstOrDefault() ?? "all";
        var parts = portRange.Split('-');
        var hasFrom = int.TryParse(parts[0], out var from);
        var hasTo = int.TryParse(parts.Length > 1 ? parts[1] : parts[0], out var to);

        return new SecurityRuleDto
        {
            Id = rule["name"]?.ToString(),
            Direction = string.Equals(rule["direction"]?.ToString(), "EGRESS", StringComparison.OrdinalIgnoreCase) ? "Outbound" : "Inbound",
            Protocol = spec?["IPProtocol"]?.ToString() ?? "all",
            FromPort = hasFrom ? from : null,
            ToPort = hasTo ? to : null,
            Cidr = (rule["sourceRanges"] as JArray)?.FirstOrDefault()?.ToString()
                ?? (rule["destinationRanges"] as JArray)?.FirstOrDefault()?.ToString() ?? "*",
            Description = rule["description"]?.ToString()
        };
    }

    public async Task<SecurityRuleListDto> GetGcpFirewallRulesAsync(UserGcpCredentials credentials)
    {
        var result = new SecurityRuleListDto { Configured = credentials.IsConfigured, Scope = "network" };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var token = await GetGcpAccessTokenAsync(credentials.ServiceAccountKeyJson!);

            if (token == null)
            {
                result.Error = "Unable to authenticate with GCP.";
                return result;
            }

            var url = $"https://compute.googleapis.com/compute/v1/projects/{Uri.EscapeDataString(credentials.ProjectId!)}/global/firewalls";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await GcpHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = $"Unable to reach GCP for the firewall rule list ({(int)response.StatusCode}).";
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var rules = json["items"] as JArray ?? new JArray();

            foreach (var rule in rules)
            {
                var mapped = MapGcpFirewallRule(rule);

                if (mapped.Direction == "Outbound")
                    result.Outbound.Add(mapped);
                else
                    result.Inbound.Add(mapped);
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GCP", "firewall rule list");
        }

        return result;
    }

    public async Task<CloudServiceActionResultDto> AddGcpFirewallRuleAsync(UserGcpCredentials credentials, AddSecurityRuleRequestDto request)
    {
        if (!credentials.IsConfigured)
            return new CloudServiceActionResultDto { Success = false, Error = "GCP is not configured." };

        try
        {
            var token = await GetGcpAccessTokenAsync(credentials.ServiceAccountKeyJson!);

            if (token == null)
                return new CloudServiceActionResultDto { Success = false, Error = "Unable to authenticate with GCP." };

            var ruleName = $"portal-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
            var url = $"https://compute.googleapis.com/compute/v1/projects/{Uri.EscapeDataString(credentials.ProjectId!)}/global/firewalls";
            var isEgress = string.Equals(request.Direction, "Outbound", StringComparison.OrdinalIgnoreCase);
            var portRange = request.FromPort == request.ToPort ? request.FromPort.ToString() : $"{request.FromPort}-{request.ToPort}";

            var body = new JObject
            {
                ["name"] = ruleName,
                ["direction"] = isEgress ? "EGRESS" : "INGRESS",
                ["allowed"] = new JArray { new JObject { ["IPProtocol"] = request.Protocol, ["ports"] = new JArray { portRange } } },
                ["description"] = request.Description ?? string.Empty
            };

            body[isEgress ? "destinationRanges" : "sourceRanges"] = new JArray { request.Cidr };

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(body.ToString(), Encoding.UTF8, "application/json")
            };
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await GcpHttpClient.SendAsync(httpRequest);

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                string? message = null;

                try { message = JObject.Parse(errorBody)["error"]?["message"]?.ToString(); }
                catch { /* fall through to the generic message below */ }

                return new CloudServiceActionResultDto { Success = false, Error = message ?? $"GCP returned {(int)response.StatusCode}." };
            }

            return new CloudServiceActionResultDto { Success = true, Message = "Firewall rule added." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "GCP", "firewall rule add") };
        }
    }

    public async Task<CloudServiceActionResultDto> RemoveGcpFirewallRuleAsync(UserGcpCredentials credentials, string ruleName)
    {
        if (!credentials.IsConfigured)
            return new CloudServiceActionResultDto { Success = false, Error = "GCP is not configured." };

        try
        {
            var token = await GetGcpAccessTokenAsync(credentials.ServiceAccountKeyJson!);

            if (token == null)
                return new CloudServiceActionResultDto { Success = false, Error = "Unable to authenticate with GCP." };

            var url = $"https://compute.googleapis.com/compute/v1/projects/{Uri.EscapeDataString(credentials.ProjectId!)}/global/firewalls/{Uri.EscapeDataString(ruleName)}";

            using var request = new HttpRequestMessage(HttpMethod.Delete, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await GcpHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = $"GCP returned {(int)response.StatusCode}." };

            return new CloudServiceActionResultDto { Success = true, Message = "Firewall rule removed." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "GCP", "firewall rule removal") };
        }
    }

    // GCP's gce_instance monitored resource type filters on the numeric
    // instance ID, not its human-readable name - see GcpVmInstanceDto.
    // InstanceId's own comment. Best-effort, least-certain part of this
    // integration (same posture as this app's other GCP work) - untested
    // against a real project.
    public async Task<ResourceMetricsDto> GetGcpVmMetricsAsync(UserGcpCredentials credentials, string numericInstanceId, int rangeMinutes)
    {
        var result = new ResourceMetricsDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var token = await GetGcpAccessTokenAsync(credentials.ServiceAccountKeyJson!, "https://www.googleapis.com/auth/monitoring.read");

            if (token == null)
            {
                result.Error = "Unable to authenticate with GCP.";
                return result;
            }

            var end = DateTimeOffset.UtcNow;
            var start = end.AddMinutes(-Math.Max(15, rangeMinutes));

            var metrics = new (string Type, string Label, string Unit)[]
            {
                ("compute.googleapis.com/instance/cpu/utilization", "CPU Utilization", "%"),
                ("compute.googleapis.com/instance/network/received_bytes_count", "Network In", "bytes"),
                ("compute.googleapis.com/instance/network/sent_bytes_count", "Network Out", "bytes")
            };

            foreach (var m in metrics)
            {
                var filter = $"metric.type=\"{m.Type}\" AND resource.labels.instance_id=\"{numericInstanceId}\"";
                var url = $"https://monitoring.googleapis.com/v3/projects/{Uri.EscapeDataString(credentials.ProjectId!)}/timeSeries" +
                          $"?filter={Uri.EscapeDataString(filter)}" +
                          $"&interval.startTime={Uri.EscapeDataString(start.ToString("O"))}" +
                          $"&interval.endTime={Uri.EscapeDataString(end.ToString("O"))}";

                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var response = await GcpHttpClient.SendAsync(request);

                var series = new MetricSeriesDto { Label = m.Label, Unit = m.Unit };

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(await response.Content.ReadAsStringAsync());
                    var points = (json["timeSeries"] as JArray)?.FirstOrDefault()?["points"] as JArray ?? new JArray();

                    series.Points = points
                        .Select(p => new MetricPointDto
                        {
                            Timestamp = DateTime.Parse(p["interval"]?["endTime"]?.ToString() ?? DateTime.UtcNow.ToString("O")),
                            Value = p["value"]?["doubleValue"]?.Value<double?>() ?? p["value"]?["int64Value"]?.Value<double?>() ?? 0
                        })
                        .OrderBy(p => p.Timestamp)
                        .ToList();
                }

                result.Series.Add(series);
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GCP", "Compute Engine metrics");
        }

        return result;
    }

    // ================= ECS — service detail, tasks, logs, metrics, bulk scale, running image =================
    //
    // Phase 2 of the multi-cloud infrastructure console. Environment
    // variables live on the task DEFINITION, not the running task instance
    // (ECS has no per-task env API) - fetched once per service detail call
    // and redacted before ever leaving this method, never the real value
    // for anything that looks like a secret (section 12's "WITHOUT
    // secrets"). Log line redaction (RedactLogLine below) is best-effort
    // pattern matching, not exhaustive - stated plainly, matching this
    // app's own posture on every other "can't be perfectly certain" piece.

    private static readonly HashSet<string> SecretEnvKeyMarkers = new(StringComparer.OrdinalIgnoreCase)
    {
        "SECRET", "PASSWORD", "PASSWD", "PWD", "TOKEN", "KEY", "CREDENTIAL", "CONNSTR", "CONNECTIONSTRING"
    };

    private static bool LooksLikeSecretKey(string key) =>
        SecretEnvKeyMarkers.Any(marker => key.Contains(marker, StringComparison.OrdinalIgnoreCase));

    private static readonly System.Text.RegularExpressions.Regex[] SecretLinePatterns =
    {
        new(@"AKIA[0-9A-Z]{16}", System.Text.RegularExpressions.RegexOptions.Compiled),
        new(@"(?i)(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+", System.Text.RegularExpressions.RegexOptions.Compiled)
    };

    private static string RedactLogLine(string line)
    {
        foreach (var pattern in SecretLinePatterns)
            line = pattern.Replace(line, "***redacted***");

        return line;
    }

    public async Task<EcsServiceDetailDto> GetEcsServiceDetailAsync(UserAwsCredentials credentials, string? region, string cluster, string service)
    {
        var result = new EcsServiceDetailDto { Configured = credentials.IsConfigured, ClusterName = cluster, ServiceName = service };
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
            using var client = new AmazonECSClient(BuildCredentials(credentials), endpoint);

            var svcResponse = await client.DescribeServicesAsync(new DescribeServicesRequest { Cluster = cluster, Services = new List<string> { service } });
            var svc = svcResponse.Services?.FirstOrDefault();

            if (svc == null)
            {
                result.Error = $"Service \"{service}\" not found in cluster \"{cluster}\".";
                return result;
            }

            result.Status = svc.Status;
            result.DesiredCount = svc.DesiredCount ?? 0;
            result.RunningCount = svc.RunningCount ?? 0;
            result.PendingCount = svc.PendingCount ?? 0;
            result.TaskDefinition = svc.TaskDefinition;
            result.DeploymentStatus = svc.Deployments?.FirstOrDefault()?.RolloutState?.Value;

            var envByContainer = new Dictionary<string, Dictionary<string, string>>();

            if (!string.IsNullOrWhiteSpace(svc.TaskDefinition))
            {
                try
                {
                    var tdResponse = await client.DescribeTaskDefinitionAsync(new DescribeTaskDefinitionRequest { TaskDefinition = svc.TaskDefinition });

                    foreach (var containerDef in tdResponse.TaskDefinition.ContainerDefinitions ?? new List<Amazon.ECS.Model.ContainerDefinition>())
                    {
                        var env = new Dictionary<string, string>();

                        foreach (var kv in containerDef.Environment ?? new List<Amazon.ECS.Model.KeyValuePair>())
                            env[kv.Name] = LooksLikeSecretKey(kv.Name) ? "***redacted***" : kv.Value;

                        envByContainer[containerDef.Name] = env;
                    }
                }
                catch
                {
                    // Best-effort - task detail is still useful without env vars.
                }
            }

            var taskArns = (await client.ListTasksAsync(new Amazon.ECS.Model.ListTasksRequest { Cluster = cluster, ServiceName = service, MaxResults = 50 })).TaskArns
                ?? new List<string>();

            if (taskArns.Count > 0)
            {
                var tasksResponse = await client.DescribeTasksAsync(new Amazon.ECS.Model.DescribeTasksRequest { Cluster = cluster, Tasks = taskArns });

                result.Tasks = (tasksResponse.Tasks ?? new List<Amazon.ECS.Model.Task>()).Select(t => new EcsTaskDto
                {
                    TaskArn = t.TaskArn,
                    TaskId = t.TaskArn.Contains('/') ? t.TaskArn[(t.TaskArn.LastIndexOf('/') + 1)..] : t.TaskArn,
                    LastStatus = t.LastStatus,
                    HealthStatus = t.HealthStatus?.Value,
                    StartedAt = t.StartedAt,
                    Cpu = t.Cpu,
                    Memory = t.Memory,
                    AvailabilityZone = t.AvailabilityZone,
                    Containers = (t.Containers ?? new List<Amazon.ECS.Model.Container>()).Select(c => new EcsContainerDto
                    {
                        Name = c.Name,
                        Image = c.Image,
                        ImageDigest = c.ImageDigest,
                        LastStatus = c.LastStatus,
                        HealthStatus = c.HealthStatus?.Value,
                        ExitCode = c.ExitCode,
                        Ports = c.NetworkBindings?.Select(nb => $"{nb.ContainerPort}->{nb.HostPort} {nb.Protocol}").ToList() ?? new List<string>(),
                        Environment = envByContainer.TryGetValue(c.Name, out var env) ? env : new Dictionary<string, string>()
                    }).ToList()
                }).ToList();
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECS service detail");
        }

        return result;
    }

    // Stops one task - the service scheduler replaces it if the service's
    // desired count still calls for one (ECS's normal reconciliation, not
    // something this method has to orchestrate itself).
    public async Task<CloudServiceActionResultDto> StopEcsTaskAsync(UserAwsCredentials credentials, string? region, string cluster, string taskId)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonECSClient(BuildCredentials(credentials), endpoint);

            await client.StopTaskAsync(new Amazon.ECS.Model.StopTaskRequest
            {
                Cluster = cluster,
                Task = taskId,
                Reason = "Stopped from the Deployment Portal"
            });

            return new CloudServiceActionResultDto { Success = true, Message = "Stop requested — the service scheduler will replace this task if its desired count still calls for one." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECS task stop") };
        }
    }

    // Section 9's "Restart Tasks" - ECS's own mechanism for this is
    // forcing a new deployment of the current task definition, which
    // replaces every running task with a fresh one; there's no separate
    // "restart" API call on ECS itself.
    public async Task<CloudServiceActionResultDto> RestartEcsServiceAsync(UserAwsCredentials credentials, string? region, string cluster, string service)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonECSClient(BuildCredentials(credentials), endpoint);

            await client.UpdateServiceAsync(new UpdateServiceRequest
            {
                Cluster = cluster,
                Service = service,
                ForceNewDeployment = true
            });

            return new CloudServiceActionResultDto { Success = true, Message = "Restart requested — ECS is replacing every task with a fresh one from the current task definition." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECS service restart") };
        }
    }

    // Section 11's bulk scaling - each service is scaled independently and
    // its own success/failure is recorded, so a partial failure across a
    // selected set never gets reported as a single pass/fail (section 27).
    public async Task<EcsBulkActionResultDto> BulkScaleEcsServicesAsync(UserAwsCredentials credentials, string? region, List<EcsServiceRefDto> services, int desiredCount)
    {
        var result = new EcsBulkActionResultDto();

        foreach (var svc in services)
        {
            var scaleResult = await ScaleEcsServiceAsync(credentials, region, svc.Cluster, svc.Service, desiredCount);

            result.Results.Add(new EcsBulkActionItemResultDto
            {
                Cluster = svc.Cluster,
                Service = svc.Service,
                Success = scaleResult.Success,
                Error = scaleResult.Error
            });
        }

        return result;
    }

    public async Task<ResourceMetricsDto> GetEcsMetricsAsync(UserAwsCredentials credentials, string? region, string cluster, string service, int rangeMinutes)
    {
        var result = new ResourceMetricsDto { Configured = credentials.IsConfigured };
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
            using var client = new AmazonCloudWatchClient(BuildCredentials(credentials), endpoint);

            var end = DateTime.UtcNow;
            var start = end.AddMinutes(-Math.Max(15, rangeMinutes));
            var periodSeconds = rangeMinutes <= 60 ? 60 : rangeMinutes <= 360 ? 300 : rangeMinutes <= 1440 ? 900 : 3600;

            var metrics = new (string Id, string MetricName, string Label, string Unit)[]
            {
                ("cpu", "CPUUtilization", "CPU Utilization", "%"),
                ("mem", "MemoryUtilization", "Memory Utilization", "%")
            };

            var response = await client.GetMetricDataAsync(new GetMetricDataRequest
            {
                StartTime = start,
                EndTime = end,
                MetricDataQueries = metrics.Select(m => new MetricDataQuery
                {
                    Id = m.Id,
                    MetricStat = new MetricStat
                    {
                        Metric = new Amazon.CloudWatch.Model.Metric
                        {
                            Namespace = "AWS/ECS",
                            MetricName = m.MetricName,
                            Dimensions = new List<Amazon.CloudWatch.Model.Dimension>
                            {
                                new() { Name = "ClusterName", Value = cluster },
                                new() { Name = "ServiceName", Value = service }
                            }
                        },
                        Period = periodSeconds,
                        Stat = "Average"
                    }
                }).ToList()
            });

            foreach (var m in metrics)
            {
                var series = response.MetricDataResults?.FirstOrDefault(r => r.Id == m.Id);

                result.Series.Add(new MetricSeriesDto
                {
                    Label = m.Label,
                    Unit = m.Unit,
                    Points = series?.Timestamps == null
                        ? new List<MetricPointDto>()
                        : series.Timestamps.Zip(series.Values, (t, v) => new MetricPointDto { Timestamp = t, Value = v })
                            .OrderBy(p => p.Timestamp).ToList()
                });
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECS metrics");
        }

        return result;
    }

    // A glance at recent log lines for one container of one task (last N
    // minutes, matching this app's own "glance, not a full query builder"
    // posture already used for CloudWatch/X-Ray/Azure Monitor), not a
    // stream/time-range explorer. Resolves the log group/stream from the
    // task definition's own awslogs configuration - ECS doesn't expose
    // this any other way.
    public async Task<EcsLogsDto> GetEcsTaskLogsAsync(UserAwsCredentials credentials, string? region, string cluster, string taskId, string containerName, int rangeMinutes)
    {
        var result = new EcsLogsDto { Configured = credentials.IsConfigured };
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
            using var ecsClient = new AmazonECSClient(BuildCredentials(credentials), endpoint);

            var taskResponse = await ecsClient.DescribeTasksAsync(new Amazon.ECS.Model.DescribeTasksRequest { Cluster = cluster, Tasks = new List<string> { taskId } });
            var task = taskResponse.Tasks?.FirstOrDefault();

            if (task == null)
            {
                result.Error = $"Task \"{taskId}\" not found.";
                return result;
            }

            var tdResponse = await ecsClient.DescribeTaskDefinitionAsync(new DescribeTaskDefinitionRequest { TaskDefinition = task.TaskDefinitionArn });
            var containerDef = tdResponse.TaskDefinition.ContainerDefinitions?.FirstOrDefault(c => c.Name == containerName);

            if (containerDef?.LogConfiguration?.LogDriver?.Value != "awslogs")
            {
                result.Error = "This container isn't configured with the awslogs log driver - logs aren't reachable through this console.";
                return result;
            }

            var options = containerDef.LogConfiguration.Options ?? new Dictionary<string, string>();
            options.TryGetValue("awslogs-group", out var logGroup);
            options.TryGetValue("awslogs-stream-prefix", out var streamPrefix);

            if (string.IsNullOrWhiteSpace(logGroup) || string.IsNullOrWhiteSpace(streamPrefix))
            {
                result.Error = "This container's log configuration is missing awslogs-group or awslogs-stream-prefix.";
                return result;
            }

            var shortTaskId = taskId.Contains('/') ? taskId[(taskId.LastIndexOf('/') + 1)..] : taskId;
            var logStream = $"{streamPrefix}/{containerName}/{shortTaskId}";

            using var logsClient = new AmazonCloudWatchLogsClient(BuildCredentials(credentials), endpoint);

            var logsResponse = await logsClient.GetLogEventsAsync(new GetLogEventsRequest
            {
                LogGroupName = logGroup,
                LogStreamName = logStream,
                StartTime = DateTime.UtcNow.AddMinutes(-Math.Max(15, rangeMinutes)),
                StartFromHead = false,
                Limit = 500
            });

            result.Lines = (logsResponse.Events ?? new List<OutputLogEvent>())
                .Select(e => new LogLineDto
                {
                    Timestamp = e.Timestamp ?? DateTime.UtcNow,
                    Message = RedactLogLine(e.Message)
                })
                .OrderBy(l => l.Timestamp)
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECS task logs");
        }

        return result;
    }

    // Section 15's "which image/repository is running" - parses the task
    // definition's container image URI; if it matches this account's ECR
    // registry pattern, correlates it against a real DescribeImages call
    // for that exact tag's digest/push time/size rather than guessing.
    public async Task<EcsRunningImageDto> GetEcsRunningImageAsync(UserAwsCredentials credentials, string? region, string cluster, string service)
    {
        var result = new EcsRunningImageDto { Configured = credentials.IsConfigured };
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
            using var ecsClient = new AmazonECSClient(BuildCredentials(credentials), endpoint);

            var svcResponse = await ecsClient.DescribeServicesAsync(new DescribeServicesRequest { Cluster = cluster, Services = new List<string> { service } });
            var svc = svcResponse.Services?.FirstOrDefault();

            if (svc == null || string.IsNullOrWhiteSpace(svc.TaskDefinition))
            {
                result.Error = "Service or task definition not found.";
                return result;
            }

            var tdResponse = await ecsClient.DescribeTaskDefinitionAsync(new DescribeTaskDefinitionRequest { TaskDefinition = svc.TaskDefinition });
            var image = tdResponse.TaskDefinition.ContainerDefinitions?.FirstOrDefault()?.Image;

            result.Image = image;

            if (string.IsNullOrWhiteSpace(image))
                return result;

            var ecrMatch = System.Text.RegularExpressions.Regex.Match(image, @"^\d+\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/([^:]+):?(.*)$");

            if (!ecrMatch.Success)
                return result;

            result.IsEcr = true;
            result.Repository = ecrMatch.Groups[1].Value;
            result.Tag = string.IsNullOrEmpty(ecrMatch.Groups[2].Value) ? "latest" : ecrMatch.Groups[2].Value;

            using var ecrClient = new AmazonECRClient(BuildCredentials(credentials), endpoint);

            var described = await ecrClient.DescribeImagesAsync(new Amazon.ECR.Model.DescribeImagesRequest
            {
                RepositoryName = result.Repository,
                ImageIds = new List<Amazon.ECR.Model.ImageIdentifier> { new() { ImageTag = result.Tag } }
            });

            var found = described.ImageDetails?.FirstOrDefault();

            if (found != null)
            {
                result.Digest = found.ImageDigest;
                result.PushedAt = found.ImagePushedAt;
                result.SizeBytes = found.ImageSizeInBytes;
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "ECS running image");
        }

        return result;
    }
}

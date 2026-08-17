using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
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

    private static async Task<string?> GetGcpAccessTokenAsync(string serviceAccountKeyJson, string scope = "https://www.googleapis.com/auth/cloud-platform")
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
}

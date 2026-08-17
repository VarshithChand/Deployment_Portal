using System.Net.Http.Headers;
using System.Text;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// The two "standalone" Container Registry providers built in this pass -
// Docker Hub and GHCR - browsing against the single shared, portal-wide
// credential each one has (see SettingsService.
// GetPortalContainerRegistryCredentialsAsync). Deliberately its own service,
// not folded into CloudServiceManagementService: that service's whole shape
// is built around AWS/Azure/GCP credential records passed in, one per
// session: these two take the generic UserPaasCredentials(Token, AccountId)
// pair instead, and there is no "cloud provider" underneath either of them.
//
// Same never-throws-to-the-caller, Configured/Error contract as every other
// Cloud Services/Container Registry method in this app - a bad or missing
// credential, or the provider simply hiccuping, comes back as a friendly
// message rather than a 500.
public class ContainerRegistryService
{
    private static readonly HttpClient DockerHubHttpClient = new();
    private static readonly HttpClient GhcrHttpClient = new();

    // ================= Docker Hub =================
    //
    // Docker Hub exposes its own REST "Hub API" (hub.docker.com/v2/...) -
    // separate from, and much simpler than, the Docker Registry HTTP API V2
    // protocol ACR/GHCR speak - so no two-step OAuth exchange is needed
    // here, just a login call that trades a username + Personal Access
    // Token for a short-lived JWT. Documented, but the exact response shape
    // (particularly whether "digest" is present at the tag level vs. only
    // per-architecture under "images") is unverified against a real account
    // in this sandboxed environment - written defensively so a missing
    // field degrades to null rather than throwing.

    private static async Task<string?> GetDockerHubJwtAsync(string username, string accessToken)
    {
        var body = new StringContent(
            JsonConvert.SerializeObject(new { username, password = accessToken }),
            Encoding.UTF8,
            "application/json");

        var response = await DockerHubHttpClient.PostAsync("https://hub.docker.com/v2/users/login/", body);

        if (!response.IsSuccessStatusCode)
            return null;

        return JObject.Parse(await response.Content.ReadAsStringAsync())["token"]?.ToString();
    }

    public async Task<DockerHubRepositoryListDto> GetDockerHubRepositoriesAsync(UserPaasCredentials credentials)
    {
        var result = new DockerHubRepositoryListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured || string.IsNullOrWhiteSpace(credentials.AccountId))
            return result;

        try
        {
            var token = await GetDockerHubJwtAsync(credentials.AccountId, credentials.Token!);

            if (token == null)
            {
                result.Error = "Unable to authenticate with Docker Hub — check the username and access token.";
                return result;
            }

            var url = $"https://hub.docker.com/v2/repositories/{Uri.EscapeDataString(credentials.AccountId)}/?page_size=100";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await DockerHubHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = $"Unable to reach Docker Hub for the repository list ({(int)response.StatusCode}).";
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var repos = json["results"] as JArray ?? new JArray();

            result.Repositories = repos.Select(r => new DockerHubRepositoryDto
            {
                Name = r["name"]?.ToString() ?? string.Empty,
                Namespace = r["namespace"]?.ToString() ?? credentials.AccountId,
                Description = r["description"]?.ToString() ?? string.Empty,
                IsPrivate = r["is_private"]?.ToObject<bool>() ?? false,
                PullCount = r["pull_count"]?.ToObject<int>() ?? 0,
                StarCount = r["star_count"]?.ToObject<int>() ?? 0,
                LastUpdated = DateTime.TryParse(r["last_updated"]?.ToString(), out var updated) ? updated : null
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Docker Hub", "repository list");
        }

        return result;
    }

    public async Task<DockerHubTagListDto> GetDockerHubTagsAsync(UserPaasCredentials credentials, string repositoryName)
    {
        var result = new DockerHubTagListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured || string.IsNullOrWhiteSpace(credentials.AccountId))
            return result;

        try
        {
            var token = await GetDockerHubJwtAsync(credentials.AccountId, credentials.Token!);

            if (token == null)
            {
                result.Error = "Unable to authenticate with Docker Hub — check the username and access token.";
                return result;
            }

            var url = $"https://hub.docker.com/v2/repositories/{Uri.EscapeDataString(credentials.AccountId)}" +
                      $"/{Uri.EscapeDataString(repositoryName)}/tags?page_size=100";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await DockerHubHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = $"Unable to reach Docker Hub for the tag list ({(int)response.StatusCode}).";
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var tags = json["results"] as JArray ?? new JArray();

            result.Images = tags.Select(t => new DockerHubTagDto
            {
                Tag = t["name"]?.ToString() ?? string.Empty,
                // Top-level "digest" is the multi-arch manifest list digest
                // when present; falls back to the first platform image's own
                // digest for older/single-arch repositories.
                Digest = t["digest"]?.ToString() ?? (t["images"] as JArray)?.FirstOrDefault()?["digest"]?.ToString(),
                SizeBytes = t["full_size"]?.ToObject<long?>(),
                PushedAt = DateTime.TryParse(t["tag_last_pushed"]?.ToString(), out var pushed) ? pushed : null
            })
            .OrderByDescending(i => i.PushedAt)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Docker Hub", "tag list");
        }

        return result;
    }

    // ================= GHCR (GitHub Container Registry) =================
    //
    // Unlike Docker Hub/ACR/base-spec registries, GHCR packages are exposed
    // through the normal GitHub REST API (not the Docker Registry V2
    // protocol) - the same api.github.com host, auth header shape, and
    // error-message conventions GitHubApiService already uses everywhere
    // else in this portal, just a different endpoint family. Scoped to the
    // token's own user account (/user/packages) - an org's own GHCR
    // packages (/orgs/{org}/packages) aren't covered in this pass, a known
    // limitation, not an oversight.

    // Per-request headers via HttpRequestMessage, never the shared static
    // client's DefaultRequestHeaders - ContainerRegistryService is
    // registered as a singleton (see Program.cs), so mutating a shared
    // client's default headers per-call would race across concurrent
    // requests carrying different callers' tokens. Same reasoning ACR's
    // per-request AuthenticationHeaderValue already follows in
    // CloudServiceManagementService.
    private static async Task<string> GetGhcrAsync(string token, string url)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Add("User-Agent", "DeploymentPortal");
        request.Headers.Add("Accept", "application/vnd.github+json");

        var response = await GhcrHttpClient.SendAsync(request);
        await HttpClientHelper.EnsureSuccessAsync(response);

        return await response.Content.ReadAsStringAsync();
    }

    public async Task<GhcrPackageListDto> GetGhcrPackagesAsync(UserPaasCredentials credentials)
    {
        var result = new GhcrPackageListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var json = await GetGhcrAsync(credentials.Token!, "https://api.github.com/user/packages?package_type=container&per_page=100");

            var packages = JArray.Parse(json);

            result.Packages = packages.Select(p => new GhcrPackageDto
            {
                Name = p["name"]?.ToString() ?? string.Empty,
                Visibility = p["visibility"]?.ToString() ?? string.Empty,
                VersionCount = p["version_count"]?.ToObject<int>() ?? 0,
                UpdatedAt = DateTime.TryParse(p["updated_at"]?.ToString(), out var updated) ? updated : null
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GHCR", "package list");
        }

        return result;
    }

    public async Task<GhcrVersionListDto> GetGhcrVersionsAsync(UserPaasCredentials credentials, string packageName)
    {
        var result = new GhcrVersionListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var url = $"https://api.github.com/user/packages/container/{Uri.EscapeDataString(packageName)}/versions?per_page=100";
            var json = await GetGhcrAsync(credentials.Token!, url);

            var versions = JArray.Parse(json);

            result.Images = versions.Select(v =>
            {
                var tags = (v["metadata"]?["container"]?["tags"] as JArray)?
                    .Select(t => t.ToString())
                    .Where(t => !string.IsNullOrWhiteSpace(t))
                    .ToList() ?? new List<string>();

                return new GhcrVersionDto
                {
                    Tag = tags.Count > 0 ? string.Join(", ", tags) : "(untagged)",
                    Digest = v["name"]?.ToString(),
                    PushedAt = DateTime.TryParse(v["created_at"]?.ToString(), out var created) ? created : null
                };
            })
            .OrderByDescending(i => i.PushedAt)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GHCR", "version list");
        }

        return result;
    }
}

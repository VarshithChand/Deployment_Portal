using System.Net.Http.Headers;
using System.Text;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// The six "standalone" Container Registry providers - Docker Hub, GHCR,
// GitLab Registry, JFrog, Harbor, Nexus - browsing against this session's
// own, isolated credential for each (see SettingsService.
// GetUserPaasCredentialsAsync/GetUserGitLabRegistryCredentialsAsync/
// GetUserJfrogCredentialsAsync/GetUserHostCredentialsAsync). Deliberately
// its own service, not folded into CloudServiceManagementService: that
// service's whole shape is built around AWS/Azure/GCP credential records
// passed in, one per session; Docker Hub/GHCR take the generic
// UserPaasCredentials(Token, AccountId) pair instead, and there is no
// "cloud provider" underneath any of these six.
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

    // ================= GitLab Container Registry =================
    //
    // GitLab's own documented REST API v4 - PRIVATE-TOKEN header (GitLab's
    // own convention, not Bearer), scoped to one project's registry (a
    // GitLab instance has no single "list every registry I can see" call
    // the way Docker Hub/GHCR do - see PortalGitLabRegistryCredentials'
    // ProjectId field). Self-hosted-friendly: HostUrl defaults to
    // gitlab.com but is fully configurable. The list-tags endpoint only
    // returns bare names; a per-tag detail call is needed for digest/size/
    // date, mirrored on ACR's own per-repo tag-count best-effort pattern
    // below - one tag's detail failing doesn't blank the whole table, but
    // for a repository with many tags this is N+1 requests, a real
    // performance tradeoff against a self-hosted or heavily-tagged project,
    // not fixed in this pass.

    private static readonly HttpClient GitLabHttpClient = new();

    private static async Task<string> GetGitLabAsync(string hostUrl, string token, string path)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{hostUrl}/api/v4{path}");
        request.Headers.Add("PRIVATE-TOKEN", token);

        var response = await GitLabHttpClient.SendAsync(request);
        await HttpClientHelper.EnsureSuccessAsync(response);

        return await response.Content.ReadAsStringAsync();
    }

    public async Task<GitLabRegistryRepositoryListDto> GetGitLabRepositoriesAsync(PortalGitLabRegistryCredentials credentials)
    {
        var result = new GitLabRegistryRepositoryListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var path = $"/projects/{Uri.EscapeDataString(credentials.ProjectId!)}/registry/repositories?tags_count=true&per_page=100";
            var json = await GetGitLabAsync(credentials.HostUrl!, credentials.Token!, path);

            var repos = JArray.Parse(json);

            result.Repositories = repos.Select(r => new GitLabRegistryRepositoryDto
            {
                Id = r["id"]?.ToString() ?? string.Empty,
                Name = string.IsNullOrWhiteSpace(r["name"]?.ToString()) ? "(default)" : r["name"]!.ToString(),
                Path = r["path"]?.ToString() ?? string.Empty,
                TagsCount = r["tags_count"]?.ToObject<int>() ?? 0,
                CreatedAt = DateTime.TryParse(r["created_at"]?.ToString(), out var created) ? created : null
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GitLab", "registry repository list");
        }

        return result;
    }

    public async Task<GitLabRegistryTagListDto> GetGitLabTagsAsync(PortalGitLabRegistryCredentials credentials, string repositoryId)
    {
        var result = new GitLabRegistryTagListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var listPath = $"/projects/{Uri.EscapeDataString(credentials.ProjectId!)}/registry/repositories/{Uri.EscapeDataString(repositoryId)}/tags?per_page=100";
            var json = await GetGitLabAsync(credentials.HostUrl!, credentials.Token!, listPath);

            var tagNames = JArray.Parse(json).Select(t => t["name"]?.ToString()).Where(n => !string.IsNullOrWhiteSpace(n)).ToList();

            foreach (var name in tagNames)
            {
                var entry = new GitLabRegistryTagDto { Tag = name! };

                try
                {
                    var detailPath = $"/projects/{Uri.EscapeDataString(credentials.ProjectId!)}/registry/repositories/{Uri.EscapeDataString(repositoryId)}/tags/{Uri.EscapeDataString(name!)}";
                    var detailJson = JObject.Parse(await GetGitLabAsync(credentials.HostUrl!, credentials.Token!, detailPath));

                    entry.Digest = detailJson["digest"]?.ToString();
                    entry.SizeBytes = detailJson["total_size"]?.ToObject<long?>();
                    entry.PushedAt = DateTime.TryParse(detailJson["created_at"]?.ToString(), out var created) ? created : null;
                }
                catch
                {
                    // leave Digest/SizeBytes/PushedAt blank - see the section
                    // comment on why this is a per-tag call, not part of the list.
                }

                result.Images.Add(entry);
            }

            result.Images = result.Images.OrderByDescending(i => i.PushedAt).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GitLab", "registry tag list");
        }

        return result;
    }

    // ================= JFrog Artifactory =================
    //
    // No fixed host (every Artifactory instance is its own domain - see
    // PortalJfrogCredentials' HostUrl field), Bearer access token auth
    // (JFrog's modern recommended scheme). Repositories come from
    // Artifactory's own REST API; images/tags within a docker-type
    // repository come from the Docker Registry HTTP API V2 endpoints
    // Artifactory proxies at /api/docker/{repoKey}/v2/... - the same base
    // spec ACR's /v2/_catalog and /v2/{repo}/tags/list calls use, which
    // means (like ACR's own base-spec fallback) tag names come back with no
    // digest. A per-tag HEAD on the v2 manifest endpoint recovers the
    // digest from the Docker-Content-Digest response header - a real,
    // documented technique, not guessed - wrapped the same best-effort way
    // GitLab's per-tag detail call above is, so one tag's HEAD failing
    // doesn't blank the whole table.

    private static readonly HttpClient JfrogHttpClient = new();

    private static async Task<string> GetJfrogAsync(string hostUrl, string token, string path)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{hostUrl}{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await JfrogHttpClient.SendAsync(request);
        await HttpClientHelper.EnsureSuccessAsync(response);

        return await response.Content.ReadAsStringAsync();
    }

    public async Task<JfrogRepositoryListDto> GetJfrogRepositoriesAsync(PortalJfrogCredentials credentials)
    {
        var result = new JfrogRepositoryListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var json = await GetJfrogAsync(credentials.HostUrl!, credentials.Token!, "/api/repositories?type=local&packageType=docker");
            var repos = JArray.Parse(json);

            result.Repositories = repos.Select(r => new JfrogRepositoryDto
            {
                Key = r["key"]?.ToString() ?? string.Empty,
                PackageType = r["packageType"]?.ToString() ?? string.Empty,
                Description = r["description"]?.ToString() ?? string.Empty
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "JFrog", "repository list");
        }

        return result;
    }

    public async Task<JfrogImageListDto> GetJfrogImagesAsync(PortalJfrogCredentials credentials, string repositoryKey)
    {
        var result = new JfrogImageListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var json = await GetJfrogAsync(credentials.HostUrl!, credentials.Token!, $"/api/docker/{Uri.EscapeDataString(repositoryKey)}/v2/_catalog");
            var names = JObject.Parse(json)["repositories"] as JArray ?? new JArray();

            result.Images = names.Select(n => new JfrogImageDto { Name = n.ToString() }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "JFrog", "image list");
        }

        return result;
    }

    public async Task<JfrogTagListDto> GetJfrogTagsAsync(PortalJfrogCredentials credentials, string repositoryKey, string imageName)
    {
        var result = new JfrogTagListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var listJson = await GetJfrogAsync(credentials.HostUrl!, credentials.Token!,
                $"/api/docker/{Uri.EscapeDataString(repositoryKey)}/v2/{Uri.EscapeDataString(imageName)}/tags/list");

            var tagNames = (JObject.Parse(listJson)["tags"] as JArray)?
                .Select(t => t.ToString())
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .ToList() ?? new List<string>();

            foreach (var tag in tagNames)
            {
                var entry = new JfrogTagDto { Tag = tag };

                try
                {
                    using var request = new HttpRequestMessage(
                        HttpMethod.Head,
                        $"{credentials.HostUrl}/api/docker/{Uri.EscapeDataString(repositoryKey)}/v2/{Uri.EscapeDataString(imageName)}/manifests/{Uri.EscapeDataString(tag)}");

                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);
                    request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.docker.distribution.manifest.v2+json"));

                    var response = await JfrogHttpClient.SendAsync(request);

                    if (response.IsSuccessStatusCode && response.Headers.TryGetValues("Docker-Content-Digest", out var digestValues))
                        entry.Digest = digestValues.FirstOrDefault();
                }
                catch
                {
                    // leave Digest blank - see the section comment on why
                    // this is a best-effort per-tag HEAD, not part of the list.
                }

                result.Images.Add(entry);
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "JFrog", "tag list");
        }

        return result;
    }

    // ================= Harbor =================
    //
    // Harbor's own documented REST API v2.0, Basic auth (a Harbor user or a
    // robot account's username + CLI secret both work as a plain username/
    // password pair) - almost always self-hosted, same HostUrl-required
    // posture as JFrog. Three levels, same shape as ACR/JFrog: projects ->
    // repositories -> artifacts (Harbor's name for a pushed image digest,
    // each carrying its own tags).
    //
    // One real Harbor-specific quirk, not a guess: a repository's "name" as
    // returned by the repositories list is "{project}/{repo}", and the
    // artifacts endpoint wants just "{repo}" with every "/" it might still
    // contain double-URL-encoded (literal "%2F" becomes "%252F") - Harbor's
    // own documented workaround for repository names that are themselves
    // nested paths (e.g. "library/nginx/sub"). Handled below by replacing
    // "/" with the literal text "%2F" before the one UrlEscape pass, so
    // that "%" itself gets escaped to "%25" and produces "%252F".

    private static readonly HttpClient HarborHttpClient = new();

    private static async Task<string> GetHarborAsync(string hostUrl, string username, string password, string path)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{hostUrl}/api/v2.0{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{username}:{password}")));

        var response = await HarborHttpClient.SendAsync(request);
        await HttpClientHelper.EnsureSuccessAsync(response);

        return await response.Content.ReadAsStringAsync();
    }

    public async Task<HarborProjectListDto> GetHarborProjectsAsync(PortalHostCredentials credentials)
    {
        var result = new HarborProjectListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var json = await GetHarborAsync(credentials.HostUrl!, credentials.Username!, credentials.Password!, "/projects?page_size=100");
            var projects = JArray.Parse(json);

            result.Projects = projects.Select(p => new HarborProjectDto
            {
                Name = p["name"]?.ToString() ?? string.Empty,
                RepoCount = p["repo_count"]?.ToObject<int>() ?? 0,
                CreatedAt = DateTime.TryParse(p["creation_time"]?.ToString(), out var created) ? created : null
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Harbor", "project list");
        }

        return result;
    }

    public async Task<HarborRepositoryListDto> GetHarborRepositoriesAsync(PortalHostCredentials credentials, string projectName)
    {
        var result = new HarborRepositoryListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var path = $"/projects/{Uri.EscapeDataString(projectName)}/repositories?page_size=100";
            var json = await GetHarborAsync(credentials.HostUrl!, credentials.Username!, credentials.Password!, path);
            var repos = JArray.Parse(json);

            result.Repositories = repos.Select(r => new HarborRepositoryDto
            {
                Name = r["name"]?.ToString() ?? string.Empty,
                ArtifactCount = r["artifact_count"]?.ToObject<int>() ?? 0,
                PullCount = r["pull_count"]?.ToObject<int>() ?? 0,
                UpdatedAt = DateTime.TryParse(r["update_time"]?.ToString(), out var updated) ? updated : null
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Harbor", "repository list");
        }

        return result;
    }

    public async Task<HarborArtifactListDto> GetHarborArtifactsAsync(PortalHostCredentials credentials, string projectName, string repositoryName)
    {
        var result = new HarborArtifactListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            // repositoryName arrives as the bare repo name (already stripped
            // of the "{project}/" prefix by the caller) - see the section
            // comment above for the double-encoding this endpoint needs.
            var encodedRepo = Uri.EscapeDataString(repositoryName.Replace("/", "%2F"));
            var path = $"/projects/{Uri.EscapeDataString(projectName)}/repositories/{encodedRepo}/artifacts?page_size=100";
            var json = await GetHarborAsync(credentials.HostUrl!, credentials.Username!, credentials.Password!, path);
            var artifacts = JArray.Parse(json);

            result.Images = artifacts.SelectMany(a =>
            {
                var tags = a["tags"] as JArray;
                var digest = a["digest"]?.ToString();
                var size = a["size"]?.ToObject<long?>();
                var pushTime = DateTime.TryParse(a["push_time"]?.ToString(), out var pushed) ? pushed : (DateTime?)null;

                if (tags == null || tags.Count == 0)
                {
                    return new[] { new HarborArtifactDto { Tag = "(untagged)", Digest = digest, SizeBytes = size, PushedAt = pushTime } };
                }

                return tags.Select(t => new HarborArtifactDto
                {
                    Tag = t["name"]?.ToString() ?? string.Empty,
                    Digest = digest,
                    SizeBytes = size,
                    PushedAt = DateTime.TryParse(t["push_time"]?.ToString(), out var tagPushed) ? tagPushed : pushTime
                });
            })
            .OrderByDescending(i => i.PushedAt)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Harbor", "artifact list");
        }

        return result;
    }

    // ================= Nexus (Sonatype Nexus Repository) =================
    //
    // Nexus 3's own generic REST API v1 (service/rest/v1/...) - Basic auth,
    // almost always self-hosted. No registry-specific listing endpoint at
    // all: a docker image pushed to Nexus is just a "component" under
    // whichever docker-format repository holds it, indistinguishable at
    // the API level from any other package format Nexus stores - so
    // "images" here means the distinct component names within a
    // docker-format repository, and "tags" means each of that name's
    // component versions. Only the first page of components is fetched
    // (no continuationToken paging loop) - a real limitation for a
    // heavily-populated repository, not fixed in this pass, same posture
    // as this session's other single-page-only integrations.

    private static readonly HttpClient NexusHttpClient = new();

    private static async Task<string> GetNexusAsync(string hostUrl, string username, string password, string path)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{hostUrl}/service/rest/v1{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{username}:{password}")));

        var response = await NexusHttpClient.SendAsync(request);
        await HttpClientHelper.EnsureSuccessAsync(response);

        return await response.Content.ReadAsStringAsync();
    }

    public async Task<NexusRepositoryListDto> GetNexusRepositoriesAsync(PortalHostCredentials credentials)
    {
        var result = new NexusRepositoryListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var json = await GetNexusAsync(credentials.HostUrl!, credentials.Username!, credentials.Password!, "/repositories");
            var repos = JArray.Parse(json);

            result.Repositories = repos
                .Where(r => string.Equals(r["format"]?.ToString(), "docker", StringComparison.OrdinalIgnoreCase))
                .Select(r => new NexusRepositoryDto
                {
                    Name = r["name"]?.ToString() ?? string.Empty,
                    Type = r["type"]?.ToString() ?? string.Empty
                })
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Nexus", "repository list");
        }

        return result;
    }

    public async Task<NexusImageListDto> GetNexusImagesAsync(PortalHostCredentials credentials, string repositoryName)
    {
        var result = new NexusImageListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var json = await GetNexusAsync(credentials.HostUrl!, credentials.Username!, credentials.Password!,
                $"/components?repository={Uri.EscapeDataString(repositoryName)}");

            var items = JObject.Parse(json)["items"] as JArray ?? new JArray();

            result.Images = items
                .Select(c => c["name"]?.ToString())
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Distinct()
                .Select(n => new NexusImageDto { Name = n! })
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Nexus", "component list");
        }

        return result;
    }

    public async Task<NexusTagListDto> GetNexusTagsAsync(PortalHostCredentials credentials, string repositoryName, string imageName)
    {
        var result = new NexusTagListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var json = await GetNexusAsync(credentials.HostUrl!, credentials.Username!, credentials.Password!,
                $"/components?repository={Uri.EscapeDataString(repositoryName)}");

            var items = JObject.Parse(json)["items"] as JArray ?? new JArray();

            result.Images = items
                .Where(c => string.Equals(c["name"]?.ToString(), imageName, StringComparison.Ordinal))
                .Select(c =>
                {
                    var firstAsset = (c["assets"] as JArray)?.FirstOrDefault();

                    return new NexusTagDto
                    {
                        Tag = c["version"]?.ToString() ?? string.Empty,
                        Digest = firstAsset?["checksum"]?["sha256"]?.ToString(),
                        PushedAt = DateTime.TryParse(firstAsset?["lastModified"]?.ToString(), out var modified) ? modified : null
                    };
                })
                .OrderByDescending(i => i.PushedAt)
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Nexus", "component version list");
        }

        return result;
    }
}

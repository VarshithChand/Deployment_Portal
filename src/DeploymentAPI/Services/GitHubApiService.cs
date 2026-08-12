using System.Net;
using System.Text;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Microsoft.Extensions.Caching.Memory;
using Newtonsoft.Json.Linq;
using YamlDotNet.Serialization;

namespace DeploymentAPI.Services;

public class GitHubApiService
{
    private readonly GitHubAuthService _auth;
    private readonly IMemoryCache _cache;

    // Long enough that the frontend's polling (every 20-30s on the Dashboard,
    // History, Analytics and Timeline pages) is served from cache on every
    // tick except the first — without this, those polls alone exhaust
    // GitHub's 60/hour anonymous limit within minutes of a single page being
    // left open, making "view without a token" effectively not work.
    private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(20);

    public GitHubApiService(GitHubAuthService auth, IMemoryCache cache)
    {
        _auth = auth;
        _cache = cache;
    }

    // forceRefresh drops the cached entry first — used by a user-initiated
    // "Refresh" click, which is infrequent and intentional, unlike the
    // automatic polling this cache exists to protect against. Without this,
    // clicking Refresh shortly after a page loads (well within the 20s
    // window) silently returns the same stale response, since nothing ever
    // told the cache the data was actually asked for on purpose.
    private Task<T> GetCachedAsync<T>(string key, Func<Task<T>> factory, bool forceRefresh = false)
    {
        if (forceRefresh) _cache.Remove(key);

        return _cache.GetOrCreateAsync(key, entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheDuration;
            return factory();
        })!;
    }

    //===========================================================
    // Repository Preview (Settings page — check a repo before saving it)
    //===========================================================

    public async Task<RepositoryPreviewDto> PreviewRepositoryAsync(string owner, string repository)
    {
        var client = _auth.CreateClient();

        // owner/repository here are whatever the caller typed into the
        // Settings page's repo URL field — escaped before going into the
        // URL path so a crafted value (e.g. containing "/" or "..") can't
        // make this request land on a different GitHub API path than the
        // repo lookup it's meant to be.
        var encodedOwner = Uri.EscapeDataString(owner);
        var encodedRepository = Uri.EscapeDataString(repository);

        try
        {
            var repoJson = await HttpClientHelper.GetAsync(
                client, $"https://api.github.com/repos/{encodedOwner}/{encodedRepository}");

            var repo = JObject.Parse(repoJson);

            var branchesResponse = await client.GetAsync(
                $"https://api.github.com/repos/{encodedOwner}/{encodedRepository}/branches?per_page=100");

            await HttpClientHelper.EnsureSuccessAsync(branchesResponse);

            var branches = JArray.Parse(await branchesResponse.Content.ReadAsStringAsync());

            var branchCountApproximate =
                branchesResponse.Headers.TryGetValues("Link", out var linkValues)
                && linkValues.Any(v => v.Contains("rel=\"next\""));

            var workflowsJson = await HttpClientHelper.GetAsync(
                client, $"https://api.github.com/repos/{encodedOwner}/{encodedRepository}/actions/workflows");

            var workflowCount = (int?)JObject.Parse(workflowsJson)["total_count"] ?? 0;

            return new RepositoryPreviewDto
            {
                Found = true,
                Owner = repo["owner"]?["login"]?.ToString() ?? owner,
                Name = repo["name"]?.ToString() ?? repository,
                Description = repo["description"]?.ToString() ?? string.Empty,
                DefaultBranch = repo["default_branch"]?.ToString() ?? string.Empty,
                Private = (bool?)repo["private"] ?? false,
                Stars = (int?)repo["stargazers_count"] ?? 0,
                BranchCount = branches.Count,
                BranchCountApproximate = branchCountApproximate,
                WorkflowCount = workflowCount,
                HtmlUrl = repo["html_url"]?.ToString() ?? string.Empty
            };
        }
        catch (HttpRequestException ex)
        {
            return new RepositoryPreviewDto
            {
                Found = false,
                Error = ex.StatusCode == HttpStatusCode.NotFound
                    ? "Repository not found — check the URL, or it may be private."
                    : ex.Message
            };
        }
    }

    //===========================================================
    // User Repositories (Dashboard's "Public Repository Lookup" —
    // typing a bare username instead of a full repo URL)
    //===========================================================

    public async Task<UserRepositoriesPreviewDto> PreviewUserRepositoriesAsync(string username)
    {
        var client = _auth.CreateClient();

        var encodedUsername = Uri.EscapeDataString(username);

        try
        {
            var reposJson = await HttpClientHelper.GetAsync(
                client,
                $"https://api.github.com/users/{encodedUsername}/repos?per_page=100&sort=updated");

            var repos = JArray.Parse(reposJson);

            return new UserRepositoriesPreviewDto
            {
                Found = true,
                Username = username,
                Repositories = repos.Select(repo => new UserRepoSummaryDto
                {
                    Owner = repo["owner"]?["login"]?.ToString() ?? username,
                    Name = repo["name"]?.ToString() ?? string.Empty,
                    Description = repo["description"]?.ToString() ?? string.Empty,
                    Private = (bool?)repo["private"] ?? false,
                    Stars = (int?)repo["stargazers_count"] ?? 0,
                    DefaultBranch = repo["default_branch"]?.ToString() ?? string.Empty,
                    HtmlUrl = repo["html_url"]?.ToString() ?? string.Empty,
                    UpdatedAt = ParseGitHubDate(repo["updated_at"])
                }).ToList()
            };
        }
        catch (HttpRequestException ex)
        {
            return new UserRepositoriesPreviewDto
            {
                Found = false,
                Username = username,
                Error = ex.StatusCode == HttpStatusCode.NotFound
                    ? "No GitHub user found with that username."
                    : ex.Message
            };
        }
    }

    //===========================================================
    // Rate Limit (shown next to "Public view" in the top bar)
    //===========================================================

    // Checking /rate_limit does not itself consume any of the quota it
    // reports, so this is always fetched fresh rather than cached.
    public async Task<RateLimitDto> GetRateLimitAsync()
    {
        var client = _auth.CreateClient();

        var json = await HttpClientHelper.GetAsync(client, "https://api.github.com/rate_limit");

        var core = JObject.Parse(json)["resources"]?["core"];

        return new RateLimitDto
        {
            Limit = (int?)core?["limit"] ?? 0,

            Remaining = (int?)core?["remaining"] ?? 0,

            ResetAt = DateTimeOffset
                .FromUnixTimeSeconds((long?)core?["reset"] ?? 0)
                .UtcDateTime
        };
    }

    //===========================================================
    // Token Owner (top bar — shown instead of "Set up GitHub Login" once a
    // Personal Access Token is configured)
    //===========================================================

    public Task<TokenOwnerDto> GetTokenOwnerAsync()
    {
        if (!_auth.HasToken)
            return Task.FromResult(new TokenOwnerDto { Configured = false });

        return GetCachedAsync($"token-owner:{_auth.Owner}/{_auth.Repository}", async () =>
        {
            var client = _auth.CreateClient();

            var userJson = await HttpClientHelper.GetAsync(client, "https://api.github.com/user");
            var user = JObject.Parse(userJson);

            // The repo endpoint includes a "permissions" block scoped to the
            // authenticated token when the token can see the repo at all.
            // "admin" is the same bit GitHub itself checks to let someone
            // approve a protected-environment deployment they weren't
            // explicitly named a reviewer on.
            var repoJson = await HttpClientHelper.GetAsync(
                client, $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}");

            var repo = JObject.Parse(repoJson);
            var canApprove = (bool?)repo["permissions"]?["admin"] ?? false;

            return new TokenOwnerDto
            {
                Configured = true,
                Login = user["login"]?.ToString() ?? string.Empty,
                AvatarUrl = user["avatar_url"]?.ToString() ?? string.Empty,
                CanApprove = canApprove
            };
        });
    }

    //===========================================================
    // Account Repositories (Settings — "switch repository" picker, lets
    // someone pick from what the configured token's account can see
    // instead of only typing a URL by hand)
    //===========================================================

    public Task<List<AccountRepositoryDto>> GetAccountRepositoriesAsync()
    {
        if (!_auth.HasToken)
            return Task.FromResult(new List<AccountRepositoryDto>());

        return GetCachedAsync("account-repos", async () =>
        {
            var client = _auth.CreateClient();

            // affiliation covers repos the token's account owns, collaborates
            // on, or can see via an org — not just ones it owns outright.
            var url = "https://api.github.com/user/repos?per_page=100&sort=updated" +
                "&affiliation=owner,collaborator,organization_member";

            var json = await HttpClientHelper.GetAsync(client, url);
            var array = JArray.Parse(json);

            return array.Select(x => new AccountRepositoryDto
            {
                FullName = x["full_name"]?.ToString() ?? string.Empty,
                Owner = x["owner"]?["login"]?.ToString() ?? string.Empty,
                Name = x["name"]?.ToString() ?? string.Empty,
                Private = (bool?)x["private"] ?? false,
                HtmlUrl = x["html_url"]?.ToString() ?? string.Empty
            }).ToList();
        });
    }

    //===========================================================
    // Token Preview (RequireGitHubSetup's two-step "Connect your
    // repository" flow — paste a token, see whose it is and every repo it
    // can see, then pick one, instead of already knowing an exact repo URL)
    //===========================================================

    // Deliberately independent of GitHubAuthService/_auth: this previews a
    // token that hasn't been saved anywhere yet, using it directly and
    // discarding the client afterward. Nothing here touches stored settings.
    public async Task<TokenPreviewResponseDto> PreviewTokenAsync(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return new TokenPreviewResponseDto { Success = false, Error = "A Personal Access Token is required." };

        using var client = new HttpClient();
        client.DefaultRequestHeaders.Add("Authorization", $"Bearer {token.Trim()}");
        client.DefaultRequestHeaders.Add("User-Agent", "DeploymentPortal");
        client.DefaultRequestHeaders.Add("Accept", "application/vnd.github+json");

        try
        {
            var userJson = await HttpClientHelper.GetAsync(client, "https://api.github.com/user");
            var user = JObject.Parse(userJson);

            var reposJson = await HttpClientHelper.GetAsync(
                client,
                "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member");

            var repos = JArray.Parse(reposJson);

            return new TokenPreviewResponseDto
            {
                Success = true,
                Username = user["login"]?.ToString(),
                AvatarUrl = user["avatar_url"]?.ToString(),
                Repositories = repos.Select(x => new AccountRepositoryDto
                {
                    FullName = x["full_name"]?.ToString() ?? string.Empty,
                    Owner = x["owner"]?["login"]?.ToString() ?? string.Empty,
                    Name = x["name"]?.ToString() ?? string.Empty,
                    Private = (bool?)x["private"] ?? false,
                    HtmlUrl = x["html_url"]?.ToString() ?? string.Empty
                }).ToList()
            };
        }
        catch (HttpRequestException ex)
        {
            return new TokenPreviewResponseDto
            {
                Success = false,
                Error = ex.StatusCode == HttpStatusCode.Unauthorized
                    ? "That token was rejected by GitHub — check it's correct and hasn't expired."
                    : ex.Message
            };
        }
    }

    //===========================================================
    // Repository
    //===========================================================

    public Task<string> GetRepository(bool forceRefresh = false) =>
        GetCachedAsync($"repo:{_auth.Owner}/{_auth.Repository}", async () =>
        {
            var client = _auth.CreateClient();

            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}";

            return await HttpClientHelper.GetAsync(client, url);
        }, forceRefresh);

    // Triage and Maintain are organization-only collaborator permission
    // levels — GitHub rejects them outright (422, "invalid value for
    // 'permissions'") when the repo's owner is a personal account rather
    // than an organization. Checked so the Access Levels page can hide
    // those two options instead of letting someone hit that error.
    public async Task<bool> IsOrganizationOwnedAsync()
    {
        var json = await GetRepository();
        var ownerType = JObject.Parse(json)["owner"]?["type"]?.ToString();

        return string.Equals(ownerType, "Organization", StringComparison.OrdinalIgnoreCase);
    }

    //===========================================================
    // Branches
    //===========================================================

    public Task<List<BranchDto>> GetBranches(bool forceRefresh = false) =>
        GetCachedAsync($"branches:{_auth.Owner}/{_auth.Repository}", async () =>
        {
            var client = _auth.CreateClient();

            // GitHub defaults list endpoints to 30 results per page — without
            // per_page=100, repos with more branches than that would silently
            // drop the rest from the Deploy page's branch picker.
            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/branches?per_page=100";

            var json = await HttpClientHelper.GetAsync(client, url);

            var array = JArray.Parse(json);

            return array.Select(x => new BranchDto
            {
                Name = x["name"]?.ToString() ?? ""
            }).ToList();
        }, forceRefresh);

    // Creating a branch is really "create a ref pointing at an existing
    // commit" in GitHub's Git Data API — there's no dedicated "create
    // branch" endpoint. Needs the source branch's current commit SHA first.
    public async Task CreateBranchAsync(string newBranchName, string sourceBranch)
    {
        var client = _auth.CreateClient();

        var refUrl =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/git/ref/heads/{Uri.EscapeDataString(sourceBranch)}";

        var refJson = await HttpClientHelper.GetAsync(client, refUrl);
        var sha = JObject.Parse(refJson)["object"]?["sha"]?.ToString();

        if (string.IsNullOrWhiteSpace(sha))
            throw new HttpRequestException($"Couldn't resolve a commit to branch from on '{sourceBranch}'.");

        var createUrl =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/git/refs";

        var body = new { @ref = $"refs/heads/{newBranchName}", sha };
        var json = System.Text.Json.JsonSerializer.Serialize(body);

        var response = await client.PostAsync(createUrl, new StringContent(json, Encoding.UTF8, "application/json"));

        await HttpClientHelper.EnsureSuccessAsync(response);

        _cache.Remove($"branches:{_auth.Owner}/{_auth.Repository}");
    }

    public async Task DeleteBranchAsync(string branch)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/git/refs/heads/{Uri.EscapeDataString(branch)}";

        var response = await client.DeleteAsync(url);

        await HttpClientHelper.EnsureSuccessAsync(response);

        _cache.Remove($"branches:{_auth.Owner}/{_auth.Repository}");
        _cache.Remove($"branch-restriction:{_auth.Owner}/{_auth.Repository}/{branch}");
    }

    //===========================================================
    // Collaborators & Access Levels (Settings — Access Control sub-page)
    //===========================================================

    public Task<List<CollaboratorDto>> GetCollaboratorsAsync(bool forceRefresh = false) =>
        GetCachedAsync($"collaborators:{_auth.Owner}/{_auth.Repository}", async () =>
        {
            var client = _auth.CreateClient();

            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/collaborators?per_page=100&affiliation=direct";

            var json = await HttpClientHelper.GetAsync(client, url);
            var array = JArray.Parse(json);

            return array.Select(x => new CollaboratorDto
            {
                Login = x["login"]?.ToString() ?? string.Empty,

                AvatarUrl = x["avatar_url"]?.ToString() ?? string.Empty,

                // role_name is GitHub's own five-level label, but it uses
                // "read"/"write" while the endpoint that *sets* a level
                // (PUT collaborators/{username}) expects "pull"/"push" for
                // those same two levels — an inconsistency in GitHub's own
                // API. Normalized here so the DTO always speaks the
                // pull/triage/push/maintain/admin scale end-to-end, and a
                // dropdown pre-selecting someone's current level actually
                // matches one of its own options.
                Permission = NormalizePermission(x["role_name"]?.ToString())
            }).ToList();
        }, forceRefresh);

    private static string NormalizePermission(string? roleName) => roleName switch
    {
        "read" => "pull",
        "write" => "push",
        _ => roleName ?? string.Empty
    };

    // GitHub's docs describe PUT .../collaborators/{username} as both
    // inviting a new user AND updating an existing collaborator's
    // permission — that second half turned out not to be true. Verified
    // directly against a real repo: calling this again for someone already
    // an accepted collaborator returns success but silently leaves their
    // permission unchanged, no matter what value is sent (tried a
    // downgrade, a sideways change, and an upgrade — none took effect, and
    // no new pending invitation appeared either). The only way that
    // actually changes an existing collaborator's level is to remove them
    // and re-invite at the new level, which is what this does whenever the
    // target is already a direct collaborator — otherwise it just invites
    // directly, so a first-time invite isn't paying for a pointless
    // remove call.
    public async Task SetCollaboratorPermissionAsync(string username, string permission) =>
        await SetCollaboratorPermissionAsync(_auth.Owner, _auth.Repository, username, permission, ownRepo: true);

    // Same operation but against an arbitrary owner/repo instead of the
    // configured one — "assign this collaborator to another repository"
    // from the Access Levels page. Only works for repos the configured
    // token's account can actually administer.
    public async Task InviteCollaboratorToRepoAsync(string owner, string repository, string username, string permission) =>
        await SetCollaboratorPermissionAsync(owner, repository, username, permission, ownRepo: false);

    private async Task SetCollaboratorPermissionAsync(string owner, string repository, string username, string permission, bool ownRepo)
    {
        var client = _auth.CreateClient();

        // owner/repository can be arbitrary text here (InviteCollaboratorToRepoAsync
        // passes through whatever the Access Levels page's "assign to another
        // repository" field was given) - escaped so a crafted value can't
        // redirect this request onto a different GitHub API path than intended.
        var collaboratorUrl =
            $"https://api.github.com/repos/{Uri.EscapeDataString(owner)}/{Uri.EscapeDataString(repository)}" +
            $"/collaborators/{Uri.EscapeDataString(username)}";

        // "Check if a user is a repository collaborator" — 204 if yes, 404
        // if no. Checked first rather than blindly deleting, so a
        // brand-new invite doesn't pay for (or risk erroring on) a remove
        // call against someone who was never a collaborator to begin with.
        var checkResponse = await client.GetAsync(collaboratorUrl);

        if (checkResponse.StatusCode != System.Net.HttpStatusCode.NotFound)
        {
            await HttpClientHelper.EnsureSuccessAsync(checkResponse);

            var removeResponse = await client.DeleteAsync(collaboratorUrl);
            await HttpClientHelper.EnsureSuccessAsync(removeResponse);
        }

        var body = new { permission };
        var json = System.Text.Json.JsonSerializer.Serialize(body);

        var inviteResponse = await client.PutAsync(collaboratorUrl, new StringContent(json, Encoding.UTF8, "application/json"));

        await HttpClientHelper.EnsureSuccessAsync(inviteResponse);

        if (ownRepo)
            _cache.Remove($"collaborators:{_auth.Owner}/{_auth.Repository}");
    }

    public async Task RemoveCollaboratorAsync(string username)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/collaborators/{Uri.EscapeDataString(username)}";

        var response = await client.DeleteAsync(url);

        await HttpClientHelper.EnsureSuccessAsync(response);

        _cache.Remove($"collaborators:{_auth.Owner}/{_auth.Repository}");
    }

    //===========================================================
    // Pending Invitations — someone invited via InviteCollaboratorAsync
    // isn't a real collaborator until they accept; GitHub tracks that as a
    // separate "invitation" object on a separate endpoint, not part of the
    // collaborators list at all, until it's accepted.
    //===========================================================

    public Task<List<AccessEntryDto>> GetPendingInvitationsAsync(bool forceRefresh = false) =>
        GetCachedAsync($"invitations:{_auth.Owner}/{_auth.Repository}", async () =>
        {
            var client = _auth.CreateClient();

            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/invitations?per_page=100";

            var json = await HttpClientHelper.GetAsync(client, url);
            var array = JArray.Parse(json);

            return array.Select(x => new AccessEntryDto
            {
                Login = x["invitee"]?["login"]?.ToString() ?? string.Empty,

                AvatarUrl = x["invitee"]?["avatar_url"]?.ToString() ?? string.Empty,

                // The invitations endpoint uses the same read/write naming
                // as role_name above, not the pull/push naming the update
                // endpoints expect — same normalization applies.
                Permission = NormalizePermission(x["permissions"]?.ToString()),

                Status = "pending",

                InvitationId = (long?)x["id"]
            }).ToList();
        }, forceRefresh);

    // Pending invitations are updated/removed through a completely
    // different pair of endpoints than actual collaborators (id-keyed, not
    // username-keyed) — GitHub treats "invited but not yet accepted" as a
    // different kind of object entirely.
    public async Task UpdateInvitationAsync(long invitationId, string permission)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/invitations/{invitationId}";

        // This endpoint wants "permissions" (plural) with the read/write
        // naming — the inverse of the normalization GetCollaboratorsAsync
        // does on the way out, applied here on the way in.
        var body = new { permissions = DenormalizePermission(permission) };
        var json = System.Text.Json.JsonSerializer.Serialize(body);

        var request = new HttpRequestMessage(HttpMethod.Patch, url)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };

        var response = await client.SendAsync(request);

        await HttpClientHelper.EnsureSuccessAsync(response);

        _cache.Remove($"invitations:{_auth.Owner}/{_auth.Repository}");
    }

    public async Task RemoveInvitationAsync(long invitationId)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/invitations/{invitationId}";

        var response = await client.DeleteAsync(url);

        await HttpClientHelper.EnsureSuccessAsync(response);

        _cache.Remove($"invitations:{_auth.Owner}/{_auth.Repository}");
    }

    private static string DenormalizePermission(string permission) => permission switch
    {
        "pull" => "read",
        "push" => "write",
        _ => permission
    };

    // The merged view the Access Levels page actually renders — pending
    // invitations first, since those are usually what an admin needs to
    // act on, then everyone who has already accepted.
    public async Task<List<AccessEntryDto>> GetAccessEntriesAsync(bool forceRefresh = false)
    {
        var pending = await GetPendingInvitationsAsync(forceRefresh);
        var active = await GetCollaboratorsAsync(forceRefresh);

        var entries = new List<AccessEntryDto>(pending);

        entries.AddRange(active.Select(c => new AccessEntryDto
        {
            Login = c.Login,
            AvatarUrl = c.AvatarUrl,
            Permission = c.Permission,
            Status = "active",
            InvitationId = null
        }));

        return entries;
    }

    //===========================================================
    // Branch Push Restrictions ("give the branch access" — who is allowed
    // to push to a given branch). GitHub only honors push restrictions on
    // organization-owned repositories with branch protection enabled; on a
    // personal-account repo it rejects the request, and HttpClientHelper's
    // 422/403 handling already turns that into a readable message instead
    // of a raw status code, so it's surfaced honestly rather than faked.
    //===========================================================

    public Task<(bool Restricted, List<string> AllowedUsers)> GetBranchRestrictionAsync(string branch, bool forceRefresh = false) =>
        GetCachedAsync($"branch-restriction:{_auth.Owner}/{_auth.Repository}/{branch}", async () =>
        {
            var client = _auth.CreateClient();

            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/branches/{Uri.EscapeDataString(branch)}/protection";

            var response = await client.GetAsync(url);

            // Unprotected branches 404 here — that's a normal, common state,
            // not a failure, so it's mapped to "not restricted" rather than
            // thrown as an error.
            if (response.StatusCode == HttpStatusCode.NotFound)
                return (Restricted: false, AllowedUsers: new List<string>());

            await HttpClientHelper.EnsureSuccessAsync(response);

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());

            var users = (json["restrictions"]?["users"] as JArray)?
                .Select(u => u["login"]?.ToString() ?? "")
                .Where(login => !string.IsNullOrWhiteSpace(login))
                .ToList() ?? new List<string>();

            return (Restricted: users.Count > 0, AllowedUsers: users);
        }, forceRefresh);

    public async Task SetBranchRestrictionAsync(string branch, List<string> usernames)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/branches/{Uri.EscapeDataString(branch)}/protection";

        // GitHub's "Update branch protection" endpoint requires all four
        // top-level fields in one request even when only restrictions is
        // being set — the other three are explicitly turned off (null)
        // rather than left configuring status checks/reviews this page
        // was never asked to manage.
        var body = new
        {
            required_status_checks = (object?)null,
            enforce_admins = false,
            required_pull_request_reviews = (object?)null,
            restrictions = new { users = usernames, teams = Array.Empty<string>(), apps = Array.Empty<string>() }
        };

        var json = System.Text.Json.JsonSerializer.Serialize(body);

        var response = await client.PutAsync(url, new StringContent(json, Encoding.UTF8, "application/json"));

        await HttpClientHelper.EnsureSuccessAsync(response);

        _cache.Remove($"branch-restriction:{_auth.Owner}/{_auth.Repository}/{branch}");
    }

    public async Task RemoveBranchRestrictionAsync(string branch)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/branches/{Uri.EscapeDataString(branch)}/protection/restrictions";

        var response = await client.DeleteAsync(url);

        // Already unprotected/unrestricted — nothing to remove, not a failure.
        if (response.StatusCode != HttpStatusCode.NotFound)
            await HttpClientHelper.EnsureSuccessAsync(response);

        _cache.Remove($"branch-restriction:{_auth.Owner}/{_auth.Repository}/{branch}");
    }

    //===========================================================
    // Artifacts
    //===========================================================

    public Task<List<ArtifactDto>> GetArtifacts(bool forceRefresh = false) =>
        GetCachedAsync($"artifacts:{_auth.Owner}/{_auth.Repository}", async () =>
        {
            var client = _auth.CreateClient();

            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/artifacts?per_page=100";

            var json = await HttpClientHelper.GetAsync(client, url);

            var root = JObject.Parse(json);

            var artifacts = root["artifacts"] as JArray;

            if (artifacts == null)
                return new List<ArtifactDto>();

            // publish-files-* is an internal hand-off artifact used only within
            // a single workflow run (the build job uploads it, the rotate/store
            // job downloads it a few steps later) — it was never meant to be a
            // user-facing deliverable, so it's excluded here rather than
            // cluttering the list/count alongside the real *-Latest/ReleaseZip/
            // StagedPackage artifacts people actually care about.
            var runsById = (await GetWorkflowRuns())
                .ToDictionary(r => r.Id, r => r);

            return artifacts
                .Where(x => !(x["name"]?.ToString() ?? "").StartsWith("publish-files", StringComparison.OrdinalIgnoreCase))
                .Select(x =>
                {
                    var runId = (long?)x["workflow_run"]?["id"] ?? 0;
                    runsById.TryGetValue(runId, out var run);

                    return new ArtifactDto
                    {
                        Id = (long?)x["id"] ?? 0,

                        Name = x["name"]?.ToString() ?? string.Empty,

                        Size = (long?)x["size_in_bytes"] ?? 0,

                        Expired = (bool?)x["expired"] ?? false,

                        CreatedAt = DateTime.TryParse(
                            x["created_at"]?.ToString(),
                            out var createdAt)
                                 ? createdAt
                                 : DateTime.MinValue,

                        DownloadUrl = x["archive_download_url"]?.ToString() ?? string.Empty,

                        Branch = x["workflow_run"]?["head_branch"]?.ToString() ?? string.Empty,

                        CommitSha = x["workflow_run"]?["head_sha"]?.ToString() ?? string.Empty,

                        CommitMessage = run?.CommitMessage ?? string.Empty,

                        WorkflowRunUrl = runId > 0
                            ? $"https://github.com/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/runs/{runId}"
                            : string.Empty
                    };
                })
                .ToList();
        }, forceRefresh);

    //===========================================================
    // Latest Run For A Workflow (Deploy page — "what did this do last time?")
    //===========================================================

    public Task<LatestRunSummaryDto> GetLatestRunSummaryAsync(string workflow, string? branch) =>
        GetCachedAsync($"last-run:{_auth.Owner}/{_auth.Repository}/{workflow}/{branch}", async () =>
        {
            var client = _auth.CreateClient();

            var workflowId = NormalizeWorkflowId(workflow);

            var branchQuery = string.IsNullOrWhiteSpace(branch)
                ? string.Empty
                : $"&branch={Uri.EscapeDataString(branch)}";

            var runsUrl =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/workflows/{workflowId}/runs" +
                $"?per_page=1{branchQuery}";

            var runsJson = await HttpClientHelper.GetAsync(client, runsUrl);
            var latestRun = (JObject.Parse(runsJson)["workflow_runs"] as JArray)?.FirstOrDefault();

            if (latestRun == null)
                return new LatestRunSummaryDto();

            var run = MapRun(latestRun);

            // The dedicated per-run artifacts endpoint, not the repo-wide list —
            // this only returns what that specific run produced.
            var artifactsUrl =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/runs/{run.Id}/artifacts";

            var artifactsJson = await HttpClientHelper.GetAsync(client, artifactsUrl);

            var artifact = (JObject.Parse(artifactsJson)["artifacts"] as JArray)?
                .Where(a => !(a["name"]?.ToString() ?? "").StartsWith("publish-files", StringComparison.OrdinalIgnoreCase))
                .Select(a => new ArtifactDto
                {
                    Id = (long?)a["id"] ?? 0,

                    Name = a["name"]?.ToString() ?? string.Empty,

                    Size = (long?)a["size_in_bytes"] ?? 0,

                    Expired = (bool?)a["expired"] ?? false,

                    CreatedAt = DateTime.TryParse(a["created_at"]?.ToString(), out var createdAt)
                        ? createdAt
                        : DateTime.MinValue,

                    DownloadUrl = a["archive_download_url"]?.ToString() ?? string.Empty
                })
                .FirstOrDefault();

            return new LatestRunSummaryDto { Run = run, Artifact = artifact };
        });

    // Accepts either the bare file name ("admin.yml"), the full repo-relative
    // path (".github/workflows/admin.yml"), or a numeric workflow ID — GitHub's
    // API only understands the first and third forms.
    private static string NormalizeWorkflowId(string workflow)
    {
        var lastSlash = workflow.LastIndexOf('/');
        return lastSlash >= 0 ? workflow[(lastSlash + 1)..] : workflow;
    }

    // GitHub always requires an authenticated request to download an artifact's
    // zip, even for public repos — a plain browser link can't attach our PAT,
    // so the API proxies the download through the server-side token instead.
    public async Task<(byte[] Content, string FileName)> DownloadArtifactAsync(long artifactId)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/artifacts/{artifactId}/zip";

        var response = await client.GetAsync(url);

        await HttpClientHelper.EnsureSuccessAsync(response);

        var bytes = await response.Content.ReadAsByteArrayAsync();

        return (bytes, $"artifact-{artifactId}.zip");
    }

    public async Task DeleteArtifactAsync(long artifactId)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/artifacts/{artifactId}";

        var response = await client.DeleteAsync(url);

        await HttpClientHelper.EnsureSuccessAsync(response);

        // Otherwise the deleted artifact would still show up in the list for
        // up to CacheDuration, since GetArtifacts() caches its response.
        _cache.Remove($"artifacts:{_auth.Owner}/{_auth.Repository}");
    }

    //===========================================================
    // Docker / Container Images (GitHub Container Registry)
    //===========================================================

    public Task<List<DockerImageDto>> GetDockerImages() =>
        GetCachedAsync($"packages:{_auth.Owner}", async () =>
        {
            var client = _auth.CreateClient();

            // Container packages are scoped to the same GitHub owner as the
            // configured PAT — an org and a user use different list endpoints,
            // and the PAT only ever has read:packages access to its own owner.
            JArray packages;

            try
            {
                var json = await HttpClientHelper.GetAsync(
                    client,
                    $"https://api.github.com/orgs/{Uri.EscapeDataString(_auth.Owner)}/packages?package_type=container&per_page=100");

                packages = JArray.Parse(json);
            }
            catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
            {
                var json = await HttpClientHelper.GetAsync(
                    client,
                    $"https://api.github.com/users/{Uri.EscapeDataString(_auth.Owner)}/packages?package_type=container&per_page=100");

                packages = JArray.Parse(json);
            }

            return packages.Select(x => new DockerImageDto
            {
                Name = x["name"]?.ToString() ?? string.Empty,

                Visibility = x["visibility"]?.ToString() ?? string.Empty,

                VersionCount = (int?)x["version_count"] ?? 0,

                Repository = x["repository"]?["full_name"]?.ToString() ?? string.Empty,

                HtmlUrl = x["html_url"]?.ToString() ?? string.Empty,

                UpdatedAt = DateTime.TryParse(x["updated_at"]?.ToString(), out var updatedAt)
                    ? updatedAt
                    : DateTime.MinValue

            }).ToList();
        });

    //===========================================================
    // Workflows
    //===========================================================

    public Task<string> GetWorkflows(bool forceRefresh = false) =>
        GetCachedAsync($"workflows:{_auth.Owner}/{_auth.Repository}", async () =>
        {
            var client = _auth.CreateClient();

            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/workflows?per_page=100";

            return await HttpClientHelper.GetAsync(client, url);
        }, forceRefresh);

    //===========================================================
    // Workflow Inputs (parsed from the workflow's own YAML, so the Deploy
    // page can render only the fields a given workflow actually declares)
    //===========================================================

    // Shared by GetWorkflowInputsAsync (parses it) and GetWorkflowYamlAsync
    // (returns it as-is for the "View YAML" viewer) — both need the same
    // repo-contents fetch + base64 decode of a workflow file.
    private async Task<string> FetchFileTextAsync(string path, string? branch)
    {
        var client = _auth.CreateClient();

        var refQuery = string.IsNullOrWhiteSpace(branch) ? "" : $"?ref={Uri.EscapeDataString(branch)}";

        // path is a repo-relative file path (e.g. ".github/workflows/deploy.yml")
        // and its "/" separators have to stay literal for GitHub's contents API -
        // escaping the whole string would turn them into "%2F" and break every
        // nested-directory workflow. Escaping segment-by-segment closes the
        // injection risk (no "..", "?", "#", etc. can smuggle through a
        // segment) without touching the slashes that give the path its shape.
        var escapedPath = string.Join('/', path.Split('/').Select(Uri.EscapeDataString));

        var contentJson = await HttpClientHelper.GetAsync(
            client,
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/contents/{escapedPath}{refQuery}");

        var base64 = JObject.Parse(contentJson)["content"]?.ToString() ?? "";
        return Encoding.UTF8.GetString(Convert.FromBase64String(base64.Replace("\n", "").Replace("\r", "")));
    }

    // Raw YAML text for the "View YAML" viewer — same file GetWorkflowInputsAsync
    // parses, just handed back verbatim instead of reduced to its inputs.
    public Task<string> GetWorkflowYamlAsync(string workflowPath, string? branch) =>
        FetchFileTextAsync(workflowPath, branch);

    public async Task<List<WorkflowInputDto>> GetWorkflowInputsAsync(string workflowPath, string? branch)
    {
        var yamlText = await FetchFileTextAsync(workflowPath, branch);

        var deserializer = new DeserializerBuilder().Build();
        var root = deserializer.Deserialize<Dictionary<object, object>>(yamlText);

        if (!TryGetDispatchInputsMap(root, out var inputsMap))
            return new List<WorkflowInputDto>();

        return inputsMap.Select(ParseWorkflowInput).ToList();
    }

    // YAML 1.1 (which YamlDotNet follows by default) treats a bare "on" as
    // the boolean `true` — GitHub Actions always uses it as the trigger
    // key regardless, so check for both forms the parser might produce.
    // False whenever any step of on -> workflow_dispatch -> inputs isn't
    // shaped the way GitHub Actions requires (workflow simply declares no
    // dispatch inputs at all, which is the common case).
    private static bool TryGetDispatchInputsMap(Dictionary<object, object> root, out IDictionary<object, object> inputsMap)
    {
        inputsMap = new Dictionary<object, object>();

        object? onValue = root.TryGetValue("on", out var onByString)
            ? onByString
            : root.TryGetValue(true, out var onByBool) ? onByBool : null;

        if (onValue is not IDictionary<object, object> onMap)
            return false;

        if (!onMap.TryGetValue("workflow_dispatch", out var dispatchValue)
            || dispatchValue is not IDictionary<object, object> dispatchMap)
            return false;

        if (!dispatchMap.TryGetValue("inputs", out var inputsValue)
            || inputsValue is not IDictionary<object, object> resolvedInputsMap)
            return false;

        inputsMap = resolvedInputsMap;
        return true;
    }

    private static WorkflowInputDto ParseWorkflowInput(KeyValuePair<object, object> entry)
    {
        var spec = entry.Value as IDictionary<object, object>;

        var required =
            spec != null
            && spec.TryGetValue("required", out var requiredRaw)
            && bool.TryParse(requiredRaw?.ToString(), out var requiredBool)
            && requiredBool;

        List<string>? options = null;

        if (spec != null
            && spec.TryGetValue("options", out var optionsRaw)
            && optionsRaw is IEnumerable<object> optionsList)
        {
            options = optionsList.Select(o => o?.ToString() ?? "").ToList();
        }

        return new WorkflowInputDto
        {
            Name = entry.Key?.ToString() ?? "",
            Type = spec != null && spec.TryGetValue("type", out var type) ? type?.ToString() ?? "string" : "string",
            Required = required,
            Default = spec != null && spec.TryGetValue("default", out var def) ? def?.ToString() : null,
            Description = spec != null && spec.TryGetValue("description", out var desc) ? desc?.ToString() : null,
            Options = options
        };
    }

    //===========================================================
    // Workflow Runs (History)
    //===========================================================

    public Task<List<WorkflowDto>> GetWorkflowRuns() =>
        GetCachedAsync($"runs:{_auth.Owner}/{_auth.Repository}", async () =>
        {
            var client = _auth.CreateClient();

            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/runs?per_page=100";

            var json = await HttpClientHelper.GetAsync(client, url);

            var root = JObject.Parse(json);

            var runs = root["workflow_runs"] as JArray;

            if (runs == null)
                return new List<WorkflowDto>();

            return runs.Select(MapRun).ToList();
        });

    // For the Dashboard's "all your repos" container — unlike every other
    // method here, owner/repository is an explicit argument rather than
    // _auth.Owner/_auth.Repository, since this checks OTHER repos the same
    // token can see (from GetAccountRepositoriesAsync), not the one repo
    // this session is actually pointed at. Same 20s cache as everything
    // else, keyed per-repo, so switching between the repo grid's pages
    // doesn't re-hit GitHub for repos already checked recently.
    // per_page=10, not 1 - a single push commonly triggers several workflow
    // files at once (build, smoke tests, notify-on-failure, ...), and more
    // than one of those can legitimately be running concurrently in the
    // same repo. Only fetching the single latest run meant a second,
    // slightly-older-but-still-running workflow in that same repo was
    // invisible to the Dashboard's "workflows running" count - this is
    // what lets the caller see (and count) every currently active run per
    // repo, not just the most recent one.
    public Task<List<WorkflowDto>> GetRecentRunsForRepoAsync(string owner, string repository) =>
        GetCachedAsync($"recent-runs:{owner}/{repository}", async () =>
        {
            try
            {
                var client = _auth.CreateClient();

                var url =
                    $"https://api.github.com/repos/{Uri.EscapeDataString(owner)}/{Uri.EscapeDataString(repository)}/actions/runs?per_page=10";

                var json = await HttpClientHelper.GetAsync(client, url);
                var runs = JObject.Parse(json)["workflow_runs"] as JArray;

                return runs?.Select(r => MapRun(r!)).ToList() ?? new List<WorkflowDto>();
            }
            catch
            {
                // One repo's Actions being disabled, private-and-inaccessible,
                // or GitHub hiccuping shouldn't break the whole grid - "no
                // recent runs to show" and "couldn't check" render identically
                // on a per-repo card either way.
                return new List<WorkflowDto>();
            }
        });

    //===========================================================
    // Single Workflow Run (Live Progress)
    //===========================================================

    public Task<WorkflowDto?> GetWorkflowRun(long runId) =>
        GetCachedAsync($"run:{_auth.Owner}/{_auth.Repository}/{runId}", async () =>
        {
            var client = _auth.CreateClient();

            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/runs/{runId}";

            var json = await HttpClientHelper.GetAsync(client, url);

            return (WorkflowDto?)MapRun(JObject.Parse(json));
        });

    // Per-job status/conclusion within a run - e.g. the Smoke Tests
    // workflow's separate Backend/Frontend/Database jobs, which the
    // run-level Status/Conclusion above can't distinguish between.
    // Deliberately uncached: this only ever backs an admin manually
    // watching one just-triggered run, at a few-second poll interval, so a
    // 20s-stale cache would make the results feel stuck rather than live.
    public async Task<List<WorkflowJobDto>> GetWorkflowRunJobsAsync(long runId)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/runs/{runId}/jobs";

        var json = await HttpClientHelper.GetAsync(client, url);
        var jobs = JObject.Parse(json)["jobs"] as JArray;

        if (jobs == null)
            return new List<WorkflowJobDto>();

        return jobs.Select(j => new WorkflowJobDto
        {
            Name = j["name"]?.ToString() ?? string.Empty,
            Status = j["status"]?.ToString() ?? string.Empty,
            Conclusion = j["conclusion"]?.ToString(),
            HtmlUrl = j["html_url"]?.ToString() ?? string.Empty,
            StartedAt = ParseGitHubDate(j["started_at"]),
            CompletedAt = ParseGitHubDate(j["completed_at"])
        }).ToList();
    }

    // A job that hasn't started/finished yet reports these as null (queued)
    // or, for completed_at specifically, GitHub's own zero-value
    // "0001-01-01T00:00:00Z" placeholder rather than an absent field.
    private static DateTime? ParseGitHubDate(JToken? value) =>
        DateTime.TryParse(value?.ToString(), out var parsed) && parsed.Year > 1
            ? parsed
            : null;

    // What History's row expansion shows for a failed/cancelled run - one
    // entry per non-successful job, naming the specific step that failed
    // and pulling the actual error text from GitHub's Check Run
    // Annotations API (the same "::error::"-style messages GitHub's own
    // UI highlights in red) rather than scraping raw log output, which
    // both needs elevated permissions this app's PAT may not have and is
    // far messier to parse reliably.
    public async Task<List<WorkflowRunErrorDto>> GetWorkflowRunErrorsAsync(long runId)
    {
        var client = _auth.CreateClient();

        var jobsUrl =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/runs/{runId}/jobs";

        var jobsJson = await HttpClientHelper.GetAsync(client, jobsUrl);
        var jobs = JObject.Parse(jobsJson)["jobs"] as JArray;

        if (jobs == null)
            return new List<WorkflowRunErrorDto>();

        var result = new List<WorkflowRunErrorDto>();

        foreach (var job in jobs)
        {
            var conclusion = job["conclusion"]?.ToString();

            if (string.IsNullOrEmpty(conclusion) || conclusion is "success" or "skipped")
                continue;

            var steps = job["steps"] as JArray;

            var failedStepName = steps?
                .FirstOrDefault(s => s["conclusion"]?.ToString() == "failure")?["name"]?
                .ToString();

            result.Add(new WorkflowRunErrorDto
            {
                JobName = job["name"]?.ToString() ?? string.Empty,
                Conclusion = conclusion,
                FailedStep = failedStepName,
                HtmlUrl = job["html_url"]?.ToString() ?? string.Empty,
                Messages = await GetCheckRunFailureMessagesAsync(client, job["check_run_url"]?.ToString())
            });
        }

        return result;
    }

    // Annotations aren't always retrievable (a token without the checks
    // read permission, or a run old enough that GitHub no longer keeps
    // them) - falling back to an empty list rather than failing the whole
    // request just means the job/step name alone is shown instead of the
    // detailed message.
    private static async Task<List<string>> GetCheckRunFailureMessagesAsync(HttpClient client, string? checkRunUrl)
    {
        if (string.IsNullOrEmpty(checkRunUrl))
            return new List<string>();

        try
        {
            var json = await HttpClientHelper.GetAsync(client, $"{checkRunUrl}/annotations");
            var annotations = JArray.Parse(json);

            return annotations
                .Where(a => a["annotation_level"]?.ToString() == "failure")
                .Select(a => a["message"]?.ToString() ?? string.Empty)
                .Where(m => !string.IsNullOrWhiteSpace(m))
                .Distinct()
                .ToList();
        }
        catch
        {
            return new List<string>();
        }
    }

    //===========================================================
    // Pending Approvals (protected-environment review gate)
    //===========================================================

    // GitHub reports a run paused at a required-reviewer environment gate
    // (RC, Cluster01/02/03, ...) with its own status of "waiting" — checking
    // only those (rarely more than one or two at a time out of everything
    // in the recent-runs list) avoids a pending_deployments call per run.
    public async Task<List<PendingApprovalDto>> GetPendingApprovalsAsync()
    {
        var runs = await GetWorkflowRuns();

        var waitingRuns = runs.Where(r => r.Status == "waiting").ToList();

        if (waitingRuns.Count == 0)
            return new List<PendingApprovalDto>();

        var client = _auth.CreateClient();

        var result = new List<PendingApprovalDto>();

        foreach (var run in waitingRuns)
        {
            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/runs/{run.Id}/pending_deployments";

            var json = await HttpClientHelper.GetAsync(client, url);
            var array = JArray.Parse(json);

            if (array.Count == 0)
                continue;

            result.Add(new PendingApprovalDto
            {
                RunId = run.Id,
                WorkflowName = run.Name,
                Branch = run.Branch,
                TriggeredBy = run.TriggeredBy,
                CreatedAt = run.CreatedAt,
                CommitMessage = run.CommitMessage,
                Environments = array.Select(e => new PendingEnvironmentDto
                {
                    Id = (long?)e["environment"]?["id"] ?? 0,

                    Name = e["environment"]?["name"]?.ToString() ?? string.Empty,

                    Reviewers = (e["reviewers"] as JArray)?
                        .Select(r => r["reviewer"]?["login"]?.ToString() ?? r["reviewer"]?["name"]?.ToString() ?? string.Empty)
                        .Where(name => !string.IsNullOrWhiteSpace(name))
                        .ToList() ?? new List<string>()
                }).ToList()
            });
        }

        return result;
    }

    public async Task SubmitApprovalAsync(ApprovalDecisionDto decision)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/runs/{decision.RunId}/pending_deployments";

        var body = new
        {
            environment_ids = decision.EnvironmentIds,
            state = decision.Approve ? "approved" : "rejected",
            comment = string.IsNullOrWhiteSpace(decision.Comment)
                ? (decision.Approve ? "Approved via Deployment Portal" : "Rejected via Deployment Portal")
                : decision.Comment
        };

        var json = System.Text.Json.JsonSerializer.Serialize(body);

        var response = await client.PostAsync(url, new StringContent(json, Encoding.UTF8, "application/json"));

        await HttpClientHelper.EnsureSuccessAsync(response);

        // The decided run is no longer "waiting" — drop the cached runs
        // list so this page (and Dashboard/History) reflect that
        // immediately instead of for up to CacheDuration.
        _cache.Remove($"runs:{_auth.Owner}/{_auth.Repository}");
    }

    //===========================================================
    // Approval History (recent outcomes of release/deploy runs)
    //===========================================================

    // GitHub doesn't expose a dedicated "who approved/rejected and when"
    // log for non-Enterprise repos — this is the closest honest
    // approximation available: the most recent completed runs of
    // release/deploy-shaped workflows, so a decision's eventual outcome
    // (success, failure, or cancelled — which is what a rejection and a
    // manual cancel both surface as) is visible without a trip to GitHub.
    public async Task<List<WorkflowDto>> GetApprovalHistoryAsync()
    {
        var runs = await GetWorkflowRuns();

        return runs
            .Where(r => r.Status == "completed"
                && System.Text.RegularExpressions.Regex.IsMatch(
                    r.Name, "release|deploy",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase,
                    TimeSpan.FromSeconds(1)))
            .OrderByDescending(r => r.CreatedAt)
            .Take(20)
            .ToList();
    }

    private static WorkflowDto MapRun(JToken x) => new()
    {
        Id = (long?)x["id"] ?? 0,

        Name = x["name"]?.ToString() ?? string.Empty,

        Branch = x["head_branch"]?.ToString() ?? string.Empty,

        Status = x["status"]?.ToString() ?? string.Empty,

        Conclusion = x["conclusion"]?.ToString() ?? string.Empty,

        TriggeredBy = x["actor"]?["login"]?.ToString() ?? string.Empty,

        CreatedAt = DateTime.TryParse(
            x["created_at"]?.ToString(),
            out var createdAt)
                 ? createdAt
                 : DateTime.MinValue,

        CommitMessage = x["head_commit"]?["message"]?.ToString() ?? string.Empty,

        CommitSha = x["head_sha"]?.ToString() ?? string.Empty,

        HtmlUrl = x["html_url"]?.ToString() ?? string.Empty
    };

    //===========================================================
    // Pull Requests (new page — open PRs to review/merge, plus a
    // closed/merged history and recent commit log)
    //===========================================================

    public Task<List<PullRequestDto>> GetOpenPullRequestsAsync(bool forceRefresh = false) =>
        GetCachedAsync($"prs-open:{_auth.Owner}/{_auth.Repository}", async () =>
        {
            var client = _auth.CreateClient();

            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/pulls?state=open&per_page=100&sort=created&direction=desc";

            var json = await HttpClientHelper.GetAsync(client, url);
            var array = JArray.Parse(json);

            return array.Select(MapPullRequest).ToList();
        }, forceRefresh);

    // Lightweight — the TopBar notification badge polls this instead of the
    // full open-PR list (with titles/branches/etc.) every 30s.
    public async Task<int> GetOpenPullRequestCountAsync()
    {
        var prs = await GetOpenPullRequestsAsync();
        return prs.Count;
    }

    // "state=closed" includes both merged and simply-closed-without-merging
    // PRs — GitHub distinguishes those via merged_at (null = closed, not
    // merged), which MapPullRequest already surfaces.
    public Task<List<PullRequestDto>> GetPullRequestHistoryAsync(bool forceRefresh = false) =>
        GetCachedAsync($"prs-closed:{_auth.Owner}/{_auth.Repository}", async () =>
        {
            var client = _auth.CreateClient();

            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/pulls?state=closed&per_page=50&sort=updated&direction=desc";

            var json = await HttpClientHelper.GetAsync(client, url);
            var array = JArray.Parse(json);

            return array.Select(MapPullRequest).ToList();
        }, forceRefresh);

    public Task<List<CommitDto>> GetRecentCommitsAsync(bool forceRefresh = false) =>
        GetCachedAsync($"commits:{_auth.Owner}/{_auth.Repository}", async () =>
        {
            var client = _auth.CreateClient();

            var url =
                $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/commits?per_page=30";

            var json = await HttpClientHelper.GetAsync(client, url);
            var array = JArray.Parse(json);

            return array.Select(x =>
            {
                // "author" is the linked GitHub account and is JSON null
                // (not simply absent) when a commit's email isn't linked to
                // one — as a JToken that's a JValue wrapping null, not a C#
                // null, so `x["author"]?["login"]` would still invoke the
                // indexer on it and throw rather than short-circuit. Cast
                // through JObject first so the null-conditional actually
                // short-circuits.
                var author = x["author"] as JObject;

                return new CommitDto
                {
                    Sha = x["sha"]?.ToString() ?? string.Empty,

                    Message = (x["commit"]?["message"]?.ToString() ?? string.Empty).Split('\n')[0],

                    Author = author?["login"]?.ToString()
                        ?? x["commit"]?["author"]?["name"]?.ToString()
                        ?? string.Empty,

                    AuthorAvatarUrl = author?["avatar_url"]?.ToString() ?? string.Empty,

                    Date = DateTime.TryParse(x["commit"]?["author"]?["date"]?.ToString(), out var date)
                        ? date
                        : DateTime.MinValue,

                    HtmlUrl = x["html_url"]?.ToString() ?? string.Empty
                };
            }).ToList();
        }, forceRefresh);

    //===========================================================
    // Recent Activity (TopBar notification bell) — recent commits and
    // recent workflow runs merged into one time-sorted feed. Both lists
    // are already independently cached/polled elsewhere (History,
    // Dashboard, the PR page), so this doesn't add new GitHub load beyond
    // what the app already fetches.
    //===========================================================

    public async Task<List<ActivityEventDto>> GetRecentActivityAsync()
    {
        var commits = await GetRecentCommitsAsync();
        var runs = await GetWorkflowRuns();

        var events = new List<ActivityEventDto>();

        events.AddRange(commits.Take(15).Select(c => new ActivityEventDto
        {
            Type = "commit",
            Title = c.Message,
            Detail = c.Sha.Length >= 7 ? c.Sha[..7] : c.Sha,
            Actor = c.Author,
            ActorAvatarUrl = c.AuthorAvatarUrl,
            Timestamp = c.Date,
            HtmlUrl = c.HtmlUrl
        }));

        events.AddRange(runs.Take(15).Select(r => new ActivityEventDto
        {
            Type = "workflow",
            Title = r.Name,
            Detail = r.Status == "completed" ? r.Conclusion : r.Status,
            Actor = r.TriggeredBy,
            ActorAvatarUrl = string.Empty,
            Timestamp = r.CreatedAt,
            HtmlUrl = $"https://github.com/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/actions/runs/{r.Id}"
        }));

        return events
            .OrderByDescending(e => e.Timestamp)
            .Take(20)
            .ToList();
    }

    public async Task ApprovePullRequestAsync(int number)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/pulls/{number}/reviews";

        var body = new { @event = "APPROVE" };
        var json = System.Text.Json.JsonSerializer.Serialize(body);

        var response = await client.PostAsync(url, new StringContent(json, Encoding.UTF8, "application/json"));

        await HttpClientHelper.EnsureSuccessAsync(response);
    }

    public async Task MergePullRequestAsync(int number)
    {
        var client = _auth.CreateClient();

        var url =
            $"https://api.github.com/repos/{Uri.EscapeDataString(_auth.Owner)}/{Uri.EscapeDataString(_auth.Repository)}/pulls/{number}/merge";

        var response = await client.PutAsync(url, new StringContent("{}", Encoding.UTF8, "application/json"));

        await HttpClientHelper.EnsureSuccessAsync(response);

        _cache.Remove($"prs-open:{_auth.Owner}/{_auth.Repository}");
        _cache.Remove($"prs-closed:{_auth.Owner}/{_auth.Repository}");
    }

    // x["user"] cast through JObject first, same reasoning as
    // GetRecentCommitsAsync's "author" field — a PR's author is JSON null
    // (a JValue, not an absent key or a C# null) for a deleted/ghost
    // GitHub account, and the plain `?[...]` indexer chain would throw
    // instead of short-circuiting on that.
    private static PullRequestDto MapPullRequest(JToken x)
    {
        var user = x["user"] as JObject;

        return new PullRequestDto
        {
            Number = (int?)x["number"] ?? 0,

            Title = x["title"]?.ToString() ?? string.Empty,

            Author = user?["login"]?.ToString() ?? string.Empty,

            AuthorAvatarUrl = user?["avatar_url"]?.ToString() ?? string.Empty,

            HeadBranch = x["head"]?["ref"]?.ToString() ?? string.Empty,

            BaseBranch = x["base"]?["ref"]?.ToString() ?? string.Empty,

            Draft = (bool?)x["draft"] ?? false,

            CreatedAt = DateTime.TryParse(x["created_at"]?.ToString(), out var createdAt) ? createdAt : DateTime.MinValue,

            MergedAt = DateTime.TryParse(x["merged_at"]?.ToString(), out var mergedAt) ? mergedAt : null,

            HtmlUrl = x["html_url"]?.ToString() ?? string.Empty
        };
    }
}

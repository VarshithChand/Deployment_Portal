using System.Security.Cryptography;
using System.Text;
using DeploymentAPI.Helpers;
using Microsoft.Extensions.Caching.Memory;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Resolves the GitHub repo + Personal Access Token to use for the current
// request. Each portal visitor gets their own (see SettingsService's
// per-user credential methods and PortalIdentity) — this used to read one
// shared, app-wide value from config, but the portal now isolates every
// visitor from every other one, whether or not GitHub OAuth login is even
// set up (PortalIdentity falls back to an anonymous per-browser session).
//
// Scoped, not Singleton: it needs to know who's making the current request.
// LoadAsync() is called once per request (see the middleware in Program.cs,
// registered right after UseAuthentication) — that's what keeps
// CreateClient()/Owner/Repository/HasToken below synchronous, so none of
// GitHubApiService's/DeploymentService's many call sites needed to change
// to await them.
public class GitHubAuthService
{
    private readonly SettingsService _settings;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IMemoryCache _cache;

    private string _owner = string.Empty;
    private string _repository = string.Empty;
    private string? _personalAccessToken;
    private bool _loaded;

    // Every admin-gated action (Deploy, Block/Unblock/Delete a PAT user,
    // Sidebar Access, ...) calls GetAuthenticatedLoginAsync below to check
    // "is this token's owner an admin" - uncached, that's a live GitHub
    // call on literally every one of those, which both burns through the
    // token's own rate limit fast under heavy admin use and means a
    // transient rate-limit hit on THIS specific call (even from unrelated
    // traffic sharing the same limit) makes every admin action fail with
    // "Admin login required," despite the token being perfectly valid.
    private static readonly TimeSpan LoginCacheDuration = TimeSpan.FromSeconds(60);

    public GitHubAuthService(SettingsService settings, IHttpContextAccessor httpContextAccessor, IMemoryCache cache)
    {
        _settings = settings;
        _httpContextAccessor = httpContextAccessor;
        _cache = cache;
    }

    public async Task LoadAsync()
    {
        if (_loaded) return;

        var context = _httpContextAccessor.HttpContext;

        // This runs unconditionally for every request (see the middleware
        // in Program.cs), including the genuinely pre-login ones (signup,
        // login, the OAuth callbacks themselves) - a not-yet-authenticated
        // request simply has no account to load a GitHub connection for
        // yet, so this leaves Owner/Repository/PersonalAccessToken at their
        // defaults (HasToken/IsConfigured both false) rather than throwing,
        // the same "nothing configured" outcome an anonymous visitor always
        // saw before login was mandatory.
        if (context?.User.Identity?.IsAuthenticated == true)
        {
            var key = RequireAuth.ResolveUserId(context);
            var creds = await _settings.GetUserGitHubCredentialsAsync(key);

            _owner = creds.Owner;
            _repository = creds.Repository;
            _personalAccessToken = creds.PersonalAccessToken;
        }

        _loaded = true;
    }

    public HttpClient CreateClient()
    {
        var client = new HttpClient();

        // Skip the header entirely when no token is configured — sending
        // "Bearer " with an empty value gets rejected by GitHub instead of
        // being treated as an anonymous request.
        if (!string.IsNullOrWhiteSpace(_personalAccessToken))
        {
            client.DefaultRequestHeaders.Add(
                "Authorization",
                $"Bearer {_personalAccessToken}");
        }

        client.DefaultRequestHeaders.Add(
            "User-Agent",
            "DeploymentPortal");

        client.DefaultRequestHeaders.Add(
            "Accept",
            "application/vnd.github+json");

        return client;
    }

    public string Owner => _owner;

    public string Repository => _repository;

    public bool HasToken => !string.IsNullOrWhiteSpace(_personalAccessToken);

    // Who this request's configured Personal Access Token actually belongs
    // to, per GitHub itself — used by AdminGate to let someone act as admin
    // through their own per-session PAT instead of also requiring a
    // separate GitHub OAuth login. Cached for LoginCacheDuration, keyed by
    // a hash of the token itself rather than owner/repo or session - two
    // sessions with two different accounts' tokens naturally land on two
    // different cache keys, so this can't leak one session's resolved
    // identity into another's the way keying by owner/repo could.
    public async Task<string?> GetAuthenticatedLoginAsync()
    {
        if (!HasToken)
            return null;

        var cacheKey = $"gh-login:{ComputeTokenFingerprint(_personalAccessToken!)}";

        if (_cache.TryGetValue(cacheKey, out string? cachedLogin))
            return cachedLogin;

        using var client = CreateClient();

        try
        {
            var response = await client.GetAsync("https://api.github.com/user");

            if (!response.IsSuccessStatusCode)
                return null;

            var json = await response.Content.ReadAsStringAsync();
            var login = JObject.Parse(json)["login"]?.ToString();

            _cache.Set(cacheKey, login, LoginCacheDuration);

            return login;
        }
        catch
        {
            return null;
        }
    }

    // A cache key derived from the token, never the raw token itself - so
    // a memory dump or the IMemoryCache's own key enumeration never
    // exposes an actual valid credential, just an opaque fingerprint of one.
    private static string ComputeTokenFingerprint(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)))[..16];
}

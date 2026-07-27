using DeploymentAPI.Helpers;

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

    private string _owner = string.Empty;
    private string _repository = string.Empty;
    private string? _personalAccessToken;
    private bool _loaded;

    public GitHubAuthService(SettingsService settings, IHttpContextAccessor httpContextAccessor)
    {
        _settings = settings;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task LoadAsync()
    {
        if (_loaded) return;

        var context = _httpContextAccessor.HttpContext;

        if (context != null)
        {
            var key = PortalIdentity.GetOrCreateKey(context);
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
}

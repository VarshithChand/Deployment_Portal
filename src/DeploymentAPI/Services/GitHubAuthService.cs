namespace DeploymentAPI.Services;

// Resolves the GitHub repo + Personal Access Token to use for the current
// request. Each portal user configures their own (see SettingsService's
// per-user credential methods) — this used to read one shared, app-wide
// value from config, but the portal now supports multiple independent
// users, each pointed at their own repo with their own token.
//
// Scoped, not Singleton: it needs to know who's making the current request.
// LoadAsync() is called once per request (see the middleware in Program.cs,
// registered right after UseAuthentication so HttpContext.User is already
// populated) — that's what keeps CreateClient()/Owner/Repository/HasToken
// below synchronous, so none of GitHubApiService's/DeploymentService's many
// call sites needed to change to await them.
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

        var login = _httpContextAccessor.HttpContext?.User?.Identity?.Name;

        if (!string.IsNullOrWhiteSpace(login))
        {
            var creds = await _settings.GetUserGitHubCredentialsAsync(login);

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

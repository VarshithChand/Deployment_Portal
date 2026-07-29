using DeploymentAPI.DTOs;
using Newtonsoft.Json.Linq;
using Npgsql;

namespace DeploymentAPI.Services;

// Reads/writes settings as one JSON blob — either appsettings.Local.json
// (the gitignored file that overrides appsettings.json, for local dev) or a
// single row in Postgres when a DATABASE_URL is configured. The container's
// own disk (Render's free tier, and any redeploy) is wiped on restart, which
// silently reset the admin allowlist and every PAT user's credentials back
// to nothing — DATABASE_URL is what makes any of that survive.
public class SettingsService
{
    private readonly string _localSettingsPath;
    private readonly string? _connectionString;
    private readonly ActivityLogService _log;

    // CREATE TABLE IF NOT EXISTS is idempotent and cheap, but there's no
    // reason to round-trip it on every single read/write within the same
    // process — a race between two requests both finding this false is
    // harmless (the statement is safe to run concurrently).
    private static bool _tableEnsured;

    public SettingsService(IHostEnvironment env, ActivityLogService log)
    {
        // SETTINGS_FILE_PATH lets a deployment point this at a mounted
        // persistent volume instead of the app's own content root. DATABASE_URL
        // (Render's standard Postgres connection string convention) takes
        // priority when present — see ReadRootAsync/WriteRootAsync below.
        var overridePath = Environment.GetEnvironmentVariable("SETTINGS_FILE_PATH");

        _localSettingsPath = string.IsNullOrWhiteSpace(overridePath)
            ? Path.Combine(env.ContentRootPath, "appsettings.Local.json")
            : overridePath;

        var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");

        _connectionString = string.IsNullOrWhiteSpace(databaseUrl)
            ? null
            : BuildConnectionString(databaseUrl);

        _log = log;
    }

    // Render (and Heroku before it) hand out Postgres connections as a
    // "postgres://user:pass@host:port/dbname" URI rather than Npgsql's own
    // "Host=...;Username=...;..." format, so this bridges the two. SSL is
    // required outright — Render's Postgres instances reject plain
    // connections, and there's no local-dev case to accommodate here since
    // DATABASE_URL is only ever set when a real Postgres is meant to be used.
    private static string BuildConnectionString(string databaseUrl)
    {
        var uri = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':', 2);

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
            Database = uri.AbsolutePath.TrimStart('/'),
            SslMode = SslMode.Require
        };

        return builder.ConnectionString;
    }

    // Called once from Program.cs, before AddJsonFile brings the local file
    // into IConfiguration, when DATABASE_URL is set. Several settings
    // (GitHubOAuthSettings, AuthorizationSettings, DockerSettings, JwtSettings
    // — see Program.cs's Configure<> calls) are bound from that file via
    // IOptionsMonitor, not read through this service's own GetViewAsync/etc,
    // so without this the file stays empty forever in a container whose disk
    // never had this run's Postgres data on it, even though every other read
    // path through SettingsService itself would correctly see it.
    public static async Task HydrateLocalFileFromDatabaseAsync(string databaseUrl, string localFilePath)
    {
        var connectionString = BuildConnectionString(databaseUrl);

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        await using (var createCommand = new NpgsqlCommand(
            "CREATE TABLE IF NOT EXISTS portal_settings (id INTEGER PRIMARY KEY, data JSONB NOT NULL)",
            connection))
        {
            await createCommand.ExecuteNonQueryAsync();
        }

        await using var selectCommand = new NpgsqlCommand("SELECT data FROM portal_settings WHERE id = 1", connection);
        var result = await selectCommand.ExecuteScalarAsync();

        var json = result as string ?? "{}";

        var directory = Path.GetDirectoryName(localFilePath);

        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);

        await File.WriteAllTextAsync(localFilePath, json);

        _tableEnsured = true;
    }

    public async Task<SettingsViewDto> GetViewAsync()
    {
        var root = await ReadRootAsync();
        return BuildView(root);
    }

    // Every user brings their own GitHub repo + token — stored keyed by
    // their portal login (the GitHub username from OAuth) under
    // "UserGitHubCredentials", instead of the one shared "GitHub" section
    // this used to be. GitHubAuthService.LoadAsync() reads this per request.
    public async Task<UserGitHubCredentials> GetUserGitHubCredentialsAsync(string login)
    {
        var root = await ReadRootAsync();
        var users = root["UserGitHubCredentials"] as JObject;
        var entry = users?[login] as JObject;

        return new UserGitHubCredentials(
            entry?["Owner"]?.ToString() ?? string.Empty,
            entry?["Repository"]?.ToString() ?? string.Empty,
            entry?["PersonalAccessToken"]?.ToString());
    }

    public async Task<UserGitHubCredentials> SaveUserGitHubCredentialsAsync(string login, GitHubSettingsUpdateDto update)
    {
        var root = await ReadRootAsync();

        var users = root["UserGitHubCredentials"] as JObject ?? new JObject();
        var entry = users[login] as JObject ?? new JObject();

        // Trimmed defensively: a stray leading/trailing space (easy to pick
        // up copy-pasting from a browser or terminal) makes GitHub reject
        // the token outright with a plain 401 that looks identical to an
        // actually-wrong token, which is a frustrating thing to have to
        // debug from the outside.
        entry["Owner"] = update.Owner?.Trim() ?? string.Empty;
        entry["Repository"] = update.Repository?.Trim() ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(update.PersonalAccessToken))
            entry["PersonalAccessToken"] = update.PersonalAccessToken.Trim();

        users[login] = entry;
        root["UserGitHubCredentials"] = users;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"GitHub settings saved for '{login}': {update.Owner}/{update.Repository}"
            + (string.IsNullOrWhiteSpace(update.PersonalAccessToken) ? "" : " (token updated)"));

        return await GetUserGitHubCredentialsAsync(login);
    }

    public async Task ClearUserGitHubTokenAsync(string login)
    {
        var root = await ReadRootAsync();

        if (root["UserGitHubCredentials"] is JObject users && users[login] is JObject entry)
        {
            entry.Remove("PersonalAccessToken");
            await WriteRootAsync(root);

            _log.LogInfo("Settings", $"GitHub token cleared for '{login}'.");
        }
    }

    public async Task<SettingsViewDto> SaveDockerAsync(DockerSettingsUpdateDto update)
    {
        var root = await ReadRootAsync();

        var docker = root["Docker"] as JObject ?? new JObject();

        docker["Registry"] = update.Registry;
        docker["Username"] = update.Username;

        if (!string.IsNullOrWhiteSpace(update.Password))
            docker["Password"] = update.Password;

        root["Docker"] = docker;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Docker settings saved: {update.Registry}/{update.Username}"
            + (string.IsNullOrWhiteSpace(update.Password) ? "" : " (password updated)"));

        return BuildView(root);
    }

    public async Task<SettingsViewDto> SaveGitHubOAuthAsync(GitHubOAuthUpdateDto update)
    {
        var root = await ReadRootAsync();

        var oauth = root["GitHubOAuth"] as JObject ?? new JObject();

        oauth["ClientId"] = update.ClientId;

        if (!string.IsNullOrWhiteSpace(update.ClientSecret))
            oauth["ClientSecret"] = update.ClientSecret;

        root["GitHubOAuth"] = oauth;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"GitHub OAuth settings saved: client ID {update.ClientId}"
            + (string.IsNullOrWhiteSpace(update.ClientSecret) ? "" : " (secret updated)"));

        return BuildView(root);
    }

    public async Task<SettingsViewDto> SaveAdminUsernamesAsync(AdminUsernamesUpdateDto update)
    {
        var root = await ReadRootAsync();

        var auth = root["Auth"] as JObject ?? new JObject();

        auth["AdminGitHubUsernames"] = new JArray(update.AdminGitHubUsernames);

        root["Auth"] = auth;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Admin allowlist saved: {string.Join(", ", update.AdminGitHubUsernames)}");

        return BuildView(root);
    }

    // "Clear" removes only the secret field, leaving non-secret identifiers
    // (Docker Registry/Username, OAuth ClientId) in place — a null
    // SecretField means the whole section IS the thing being cleared.
    // GitHub credentials are per-user now (see ClearUserGitHubTokenAsync)
    // and aren't part of this shared-section mechanism at all.
    private static readonly Dictionary<string, (string SectionKey, string? SecretField)> SectionInfo = new()
    {
        ["docker"] = ("Docker", "Password"),
        ["github-oauth"] = ("GitHubOAuth", "ClientSecret"),
        ["admins"] = ("Auth", null)
    };

    // Unlike a per-section clear (which only removes the secret, leaving the
    // registry / client ID in place), "all" wipes every shared, portal-wide
    // section entirely, plus the caller's own GitHub repo/token — resetting
    // both back to unconfigured, first-run state. Only the CALLER's own
    // entry in UserGitHubCredentials is removed (other users' stay intact —
    // "all" for one visitor never reaches into another's data). Jwt is
    // deliberately left alone so existing sessions/cookies stay valid.
    public async Task<SettingsViewDto> ClearAllAsync(string callerKey)
    {
        var root = await ReadRootAsync();

        root.Remove("Docker");
        root.Remove("GitHubOAuth");
        root.Remove("Auth");

        if (root["UserGitHubCredentials"] is JObject users)
            users.Remove(callerKey);

        await WriteRootAsync(root);

        _log.LogInfo("Settings", "All settings cleared — portal reset to unconfigured state.");

        return BuildView(root);
    }

    public async Task<SettingsViewDto> ClearAsync(string section)
    {
        if (!SectionInfo.TryGetValue(section, out var info))
            throw new ArgumentException($"Unknown settings section '{section}'.");

        var root = await ReadRootAsync();

        if (info.SecretField == null)
        {
            root.Remove(info.SectionKey);
        }
        else if (root[info.SectionKey] is JObject existing)
        {
            existing.Remove(info.SecretField);
        }

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"{info.SectionKey} section cleared ({section}).");

        return BuildView(root);
    }

    // Which sidebar tabs the admin has restricted, PER PAT user (keyed the
    // same way UserGitHubCredentials is — see PortalIdentity) — "locked"
    // (still shown, greyed out, unreachable) or "hidden" (removed from the
    // sidebar and unreachable). Absent from a user's entry means fully
    // visible/usable for them, so a brand new PAT user starts unrestricted.
    // Deliberately per-user rather than one shared policy: the admin picks
    // a specific PAT user (see GetPatUsersAsync) from Settings > Sidebar
    // Access and restricts THEM, not "everyone browsing the portal."
    private static readonly HashSet<string> ValidSidebarStates = new() { "locked", "hidden" };

    // Never restrictable: "settings" is the only way back to this screen to
    // undo a lock/hide, and "dashboard" is where the frontend's route guard
    // redirects anyone who lands on a restricted tab — restricting either
    // would strand someone with nowhere safe to go.
    private static readonly HashSet<string> UnrestrictableTabs = new() { "settings", "dashboard" };

    public async Task<Dictionary<string, string>> GetSidebarAccessAsync(string key)
    {
        var root = await ReadRootAsync();
        var users = root["SidebarAccess"] as JObject;
        var entry = users?[key] as JObject;

        return entry?.Properties()
            .ToDictionary(p => p.Name, p => p.Value?.ToString() ?? string.Empty)
            ?? new Dictionary<string, string>();
    }

    public async Task<Dictionary<string, string>> SaveSidebarAccessAsync(string key, Dictionary<string, string> states)
    {
        var root = await ReadRootAsync();
        var users = root["SidebarAccess"] as JObject ?? new JObject();
        var entry = new JObject();

        foreach (var (tabKey, state) in states)
        {
            if (UnrestrictableTabs.Contains(tabKey))
                continue;

            if (ValidSidebarStates.Contains(state))
                entry[tabKey] = state;
        }

        // No restrictions left for this user — drop their entry entirely
        // rather than keep an empty object around.
        if (entry.Properties().Any())
            users[key] = entry;
        else
            users.Remove(key);

        root["SidebarAccess"] = users;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", entry.Properties().Any()
            ? $"Sidebar access updated for '{key}': {string.Join(", ", entry.Properties().Select(p => $"{p.Name}={p.Value}"))}"
            : $"Sidebar access reset for '{key}' — every tab visible again.");

        return await GetSidebarAccessAsync(key);
    }

    // The list an admin picks from in Settings > Sidebar Access — every
    // browser/device that has ever configured a Personal Access Token here,
    // regardless of which repo. Only PAT users are listed (not every
    // UserGitHubCredentials entry) since a session with no token can't
    // trigger anything restriction would matter for. Labeled by owner/repo,
    // not a resolved GitHub identity — that would mean a live API call per
    // entry here, and some stored tokens may no longer even be valid.
    public async Task<List<PatUserSummaryDto>> GetPatUsersAsync()
    {
        var root = await ReadRootAsync();
        var users = root["UserGitHubCredentials"] as JObject;
        var access = root["SidebarAccess"] as JObject;

        if (users == null)
            return new List<PatUserSummaryDto>();

        var entries = users.Properties()
            .Where(p => p.Value is JObject entry && !string.IsNullOrWhiteSpace(entry["PersonalAccessToken"]?.ToString()))
            .ToList();

        // Two different browsers can configure the SAME repo (as in
        // "VarshithChand/yaml" for both an admin's own session and a
        // teammate's) — Owner/Repository alone can't tell them apart, so
        // this resolves each token's actual GitHub identity live, the same
        // way AdminGate does for the admin-authority check itself.
        var logins = await Task.WhenAll(
            entries.Select(p => ResolvePatOwnerLoginAsync(((JObject)p.Value!)["PersonalAccessToken"]!.ToString()!)));

        return entries.Select((p, i) =>
        {
            var entry = (JObject)p.Value!;
            var restrictionCount = (access?[p.Name] as JObject)?.Properties().Count() ?? 0;

            return new PatUserSummaryDto
            {
                Key = p.Name,
                PatOwnerLogin = logins[i] ?? "Unknown (invalid or expired token)",
                Owner = entry["Owner"]?.ToString() ?? string.Empty,
                Repository = entry["Repository"]?.ToString() ?? string.Empty,
                RestrictedTabCount = restrictionCount
            };
        }).ToList();
    }

    private static async Task<string?> ResolvePatOwnerLoginAsync(string token)
    {
        using var client = new HttpClient();

        client.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
        client.DefaultRequestHeaders.Add("User-Agent", "DeploymentPortal");
        client.DefaultRequestHeaders.Add("Accept", "application/vnd.github+json");

        try
        {
            var response = await client.GetAsync("https://api.github.com/user");

            if (!response.IsSuccessStatusCode)
                return null;

            var json = await response.Content.ReadAsStringAsync();
            return JObject.Parse(json)["login"]?.ToString();
        }
        catch
        {
            return null;
        }
    }

    public async Task ClearSidebarAccessAsync(string key)
    {
        var root = await ReadRootAsync();

        if (root["SidebarAccess"] is JObject users && users.Remove(key))
        {
            await WriteRootAsync(root);
            _log.LogInfo("Settings", $"Sidebar access reset for '{key}' — every tab visible again.");
        }
    }

    // Branch "purpose" is a portal-only note (GitHub has no such field) —
    // stored in its own top-level section rather than folded into
    // SettingsViewDto, since it's per-branch data, not a single credential.
    public async Task<Dictionary<string, string>> GetBranchPurposesAsync()
    {
        var root = await ReadRootAsync();
        var purposes = root["BranchPurposes"] as JObject;

        return purposes?.Properties()
            .ToDictionary(p => p.Name, p => p.Value?.ToString() ?? string.Empty)
            ?? new Dictionary<string, string>();
    }

    public async Task SaveBranchPurposeAsync(string branch, string purpose)
    {
        var root = await ReadRootAsync();
        var purposes = root["BranchPurposes"] as JObject ?? new JObject();

        if (string.IsNullOrWhiteSpace(purpose))
            purposes.Remove(branch);
        else
            purposes[branch] = purpose;

        root["BranchPurposes"] = purposes;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", string.IsNullOrWhiteSpace(purpose)
            ? $"Branch purpose cleared for '{branch}'."
            : $"Branch purpose saved for '{branch}': {purpose}");
    }

    // Who created a branch through the portal — GitHub's API has no
    // "branch creator" concept of its own, so this is tracked locally the
    // same way branch purposes are. Drives "the creator or an admin can
    // delete this branch"; a branch with no recorded creator (made outside
    // the portal, or before this existed) can only be deleted by an admin.
    public async Task<Dictionary<string, string>> GetBranchCreatorsAsync()
    {
        var root = await ReadRootAsync();
        var creators = root["BranchCreators"] as JObject;

        return creators?.Properties()
            .ToDictionary(p => p.Name, p => p.Value?.ToString() ?? string.Empty)
            ?? new Dictionary<string, string>();
    }

    public async Task SaveBranchCreatorAsync(string branch, string login)
    {
        var root = await ReadRootAsync();
        var creators = root["BranchCreators"] as JObject ?? new JObject();

        creators[branch] = login;
        root["BranchCreators"] = creators;

        await WriteRootAsync(root);
    }

    public async Task RemoveBranchCreatorAsync(string branch)
    {
        var root = await ReadRootAsync();

        if (root["BranchCreators"] is JObject creators && creators.Remove(branch))
            await WriteRootAsync(root);
    }

    private static SettingsViewDto BuildView(JObject root)
    {
        var docker = root["Docker"] as JObject;
        var oauth = root["GitHubOAuth"] as JObject;
        var auth = root["Auth"] as JObject;

        var admins = (auth?["AdminGitHubUsernames"] as JArray)?
            .Select(x => x.ToString())
            .ToList() ?? new List<string>();

        return new SettingsViewDto
        {
            DockerRegistry = docker?["Registry"]?.ToString() ?? string.Empty,
            DockerUsername = docker?["Username"]?.ToString() ?? string.Empty,
            DockerPasswordConfigured = !string.IsNullOrWhiteSpace(docker?["Password"]?.ToString()),

            GitHubOAuthClientId = oauth?["ClientId"]?.ToString() ?? string.Empty,
            GitHubOAuthClientSecretConfigured = !string.IsNullOrWhiteSpace(oauth?["ClientSecret"]?.ToString()),

            AdminGitHubUsernames = admins
        };
    }

    private async Task<JObject> ReadRootAsync()
    {
        if (_connectionString != null)
            return await ReadRootFromDatabaseAsync();

        if (!File.Exists(_localSettingsPath))
            return new JObject();

        var text = await File.ReadAllTextAsync(_localSettingsPath);

        return string.IsNullOrWhiteSpace(text)
            ? new JObject()
            : JObject.Parse(text);
    }

    private async Task WriteRootAsync(JObject root)
    {
        if (_connectionString != null)
        {
            await WriteRootToDatabaseAsync(root);
            return;
        }

        var directory = Path.GetDirectoryName(_localSettingsPath);

        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);

        await File.WriteAllTextAsync(_localSettingsPath, root.ToString());
    }

    // Everything this service stores lives as one JSON blob — same shape as
    // the file, just in a single row (id is always 1) instead of a path.
    // Simplest possible schema that still gets real persistence: no per-
    // section columns to keep in sync with BuildView/SaveXAsync, no
    // migrations to write when a new section is added (see SidebarAccess,
    // added well after this table would have first been created).
    private async Task EnsureTableAsync(NpgsqlConnection connection)
    {
        if (_tableEnsured)
            return;

        await using var command = new NpgsqlCommand(
            "CREATE TABLE IF NOT EXISTS portal_settings (id INTEGER PRIMARY KEY, data JSONB NOT NULL)",
            connection);

        await command.ExecuteNonQueryAsync();
        _tableEnsured = true;
    }

    private async Task<JObject> ReadRootFromDatabaseAsync()
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        await EnsureTableAsync(connection);

        await using var command = new NpgsqlCommand("SELECT data FROM portal_settings WHERE id = 1", connection);
        var result = await command.ExecuteScalarAsync();

        return result is string json && !string.IsNullOrWhiteSpace(json)
            ? JObject.Parse(json)
            : new JObject();
    }

    private async Task WriteRootToDatabaseAsync(JObject root)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        await EnsureTableAsync(connection);

        await using var command = new NpgsqlCommand(
            "INSERT INTO portal_settings (id, data) VALUES (1, @data::jsonb) " +
            "ON CONFLICT (id) DO UPDATE SET data = @data::jsonb",
            connection);

        command.Parameters.AddWithValue("data", root.ToString(Newtonsoft.Json.Formatting.None));
        await command.ExecuteNonQueryAsync();

        // Mirrored into the local file too (which IConfiguration is already
        // watching with reloadOnChange — see Program.cs) so IOptionsMonitor-
        // bound settings on THIS running process pick up the change right
        // away, without waiting for a restart to re-hydrate from Postgres.
        // Postgres stays the durable copy; on a multi-instance deployment
        // other instances only see this write on their own next restart,
        // which is a real gap but not one Render's free single-instance
        // tier hits.
        var directory = Path.GetDirectoryName(_localSettingsPath);

        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);

        await File.WriteAllTextAsync(_localSettingsPath, root.ToString());
    }
}

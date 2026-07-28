using DeploymentAPI.DTOs;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Reads/writes appsettings.Local.json directly (the gitignored file that overrides
// appsettings.json) so credentials entered via the Settings page are never
// stored in the browser and never land in a file that gets committed.
public class SettingsService
{
    private readonly string _localSettingsPath;
    private readonly ActivityLogService _log;

    public SettingsService(IHostEnvironment env, ActivityLogService log)
    {
        // SETTINGS_FILE_PATH lets a deployment point this at a mounted
        // persistent volume (e.g. Fly.io) instead of the app's own content
        // root, which is typically wiped and replaced on every redeploy.
        // Program.cs points AddJsonFile at the same path, so reads and
        // writes always agree on where the file lives.
        var overridePath = Environment.GetEnvironmentVariable("SETTINGS_FILE_PATH");

        _localSettingsPath = string.IsNullOrWhiteSpace(overridePath)
            ? Path.Combine(env.ContentRootPath, "appsettings.Local.json")
            : overridePath;

        _log = log;
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

        entry["Owner"] = update.Owner;
        entry["Repository"] = update.Repository;

        if (!string.IsNullOrWhiteSpace(update.PersonalAccessToken))
            entry["PersonalAccessToken"] = update.PersonalAccessToken;

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
        ["admins"] = ("Auth", null),
        ["sidebar"] = ("SidebarAccess", null)
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

    // Which sidebar tabs the repo owner has restricted for everyone else —
    // "locked" (still shown, greyed out, unreachable) or "hidden" (removed
    // from the sidebar and unreachable). Absent from this dict means fully
    // visible/usable, so a fresh portal starts with nothing restricted.
    private static readonly HashSet<string> ValidSidebarStates = new() { "locked", "hidden" };

    // Never restrictable: "settings" is the only way back to this screen to
    // undo a lock/hide, and "dashboard" is where the frontend's route guard
    // redirects anyone who lands on a restricted tab — restricting either
    // would strand someone with nowhere safe to go.
    private static readonly HashSet<string> UnrestrictableTabs = new() { "settings", "dashboard" };

    public async Task<Dictionary<string, string>> GetSidebarAccessAsync()
    {
        var root = await ReadRootAsync();
        var access = root["SidebarAccess"] as JObject;

        return access?.Properties()
            .ToDictionary(p => p.Name, p => p.Value?.ToString() ?? string.Empty)
            ?? new Dictionary<string, string>();
    }

    public async Task<Dictionary<string, string>> SaveSidebarAccessAsync(Dictionary<string, string> states)
    {
        var root = await ReadRootAsync();
        var access = new JObject();

        foreach (var (key, state) in states)
        {
            if (UnrestrictableTabs.Contains(key))
                continue;

            if (ValidSidebarStates.Contains(state))
                access[key] = state;
        }

        root["SidebarAccess"] = access;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", access.Properties().Any()
            ? $"Sidebar access updated: {string.Join(", ", access.Properties().Select(p => $"{p.Name}={p.Value}"))}"
            : "Sidebar access reset — every tab visible again.");

        return await GetSidebarAccessAsync();
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
        if (!File.Exists(_localSettingsPath))
            return new JObject();

        var text = await File.ReadAllTextAsync(_localSettingsPath);

        return string.IsNullOrWhiteSpace(text)
            ? new JObject()
            : JObject.Parse(text);
    }

    private async Task WriteRootAsync(JObject root)
    {
        var directory = Path.GetDirectoryName(_localSettingsPath);

        if (!string.IsNullOrEmpty(directory))
            Directory.CreateDirectory(directory);

        await File.WriteAllTextAsync(_localSettingsPath, root.ToString());
    }
}

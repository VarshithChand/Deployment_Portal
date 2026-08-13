using System.Security.Cryptography;
using System.Text;
using DeploymentAPI.DTOs;
using Microsoft.AspNetCore.DataProtection;
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

    // Encrypts every secret field at rest (GitHub PATs, AWS/Azure secret
    // keys, Docker password, Sonar/Gemini API tokens) - see
    // Protect/Unprotect below and security_findings.txt Finding 006. Keyed
    // off a purpose string so a key compromise elsewhere in the app (were
    // Data Protection ever used for something else) can't be replayed
    // against these values. The key ring itself is persisted to Postgres
    // when DATABASE_URL is set (see PostgresXmlRepository/Program.cs) so
    // it survives Render redeploys - without that, every stored credential
    // would become undecryptable the moment the container restarted with a
    // fresh, ephemeral key.
    private readonly IDataProtector _protector;

    // CREATE TABLE IF NOT EXISTS is idempotent and cheap, but there's no
    // reason to round-trip it on every single read/write within the same
    // process — a race between two requests both finding this false is
    // harmless (the statement is safe to run concurrently).
    private static bool _tableEnsured;

    // Memoized for the lifetime of THIS request only - SettingsService is
    // registered AddScoped (one instance per HTTP request, see Program.cs),
    // so there's no cross-request staleness risk here at all, just a plain
    // instance field. Before this, a single request that touched several
    // Get*Async methods (exactly what BootstrapController does - view,
    // GitHub creds, AWS creds, pin status, signed-out flag) paid for a
    // separate file read or Postgres round trip per call, all fetching the
    // exact same JSON blob. WriteRootAsync updates this to the just-written
    // value rather than clearing it, so a read that follows a write within
    // the same request still sees the fresh state instead of falling back
    // to a second real read.
    private JObject? _cachedRoot;

    public SettingsService(IHostEnvironment env, ActivityLogService log, IDataProtectionProvider dataProtectionProvider)
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
        _protector = dataProtectionProvider.CreateProtector("DeploymentPortal.Credentials.v1");
    }

    // Null/empty passes through unchanged - there's nothing to protect, and
    // callers already use string.IsNullOrWhiteSpace to decide whether a
    // field was actually submitted before ever reaching this.
    private string? Protect(string? plaintext) =>
        string.IsNullOrEmpty(plaintext) ? plaintext : _protector.Protect(plaintext);

    // Every value already stored before this encryption layer existed is
    // plain text, not Data-Protection ciphertext - Unprotect() throws
    // CryptographicException on anything it doesn't recognize as its own
    // format, which is exactly what tells those two cases apart. Passing
    // the legacy value through as-is (rather than erroring) is what keeps
    // every already-saved credential working without a migration step;
    // it's re-encrypted automatically the next time that field is saved.
    private string? Unprotect(string? stored)
    {
        if (string.IsNullOrEmpty(stored)) return stored;

        try
        {
            return _protector.Unprotect(stored);
        }
        catch (CryptographicException)
        {
            return stored;
        }
    }

    // Render (and Heroku before it) hand out Postgres connections as a
    // "postgres://user:pass@host:port/dbname" URI rather than Npgsql's own
    // "Host=...;Username=...;..." format, so this bridges the two. SSL is
    // required outright by default — Render's Postgres instances reject
    // plain connections. DATABASE_SSL_MODE exists solely for the Database
    // Smoke Test job's own throwaway Postgres service container (see
    // .github/workflows/smoke-tests.yml), which has no SSL configured at
    // all - Render itself never sets this, so production behavior is
    // unchanged.
    // internal, not private: Program.cs reuses this to build the connection
    // string for the Data Protection key ring's own Postgres persistence
    // (see PostgresXmlRepository) - same DATABASE_URL, no reason to parse
    // it a second, slightly-different way.
    internal static string BuildConnectionString(string databaseUrl)
    {
        var uri = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':', 2);

        var sslMode = Environment.GetEnvironmentVariable("DATABASE_SSL_MODE") switch
        {
            "Disable" => SslMode.Disable,
            "Prefer" => SslMode.Prefer,
            _ => SslMode.Require
        };

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
            Database = uri.AbsolutePath.TrimStart('/'),
            SslMode = sslMode
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

    // Reused by DatabaseManagementService instead of re-parsing DATABASE_URL
    // a second time — null when the app is running against the local JSON
    // file (no DATABASE_URL configured), which is exactly when Database
    // Management has nothing to show anyway.
    public string? GetDatabaseConnectionString() => _connectionString;

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

        // A soft-signed-out entry (see SoftSignOutPatUserAsync) reports no
        // token even though the real value is still sitting there
        // untouched - this is what makes GitHubAuthService/TokenConfigured
        // treat the session as "not connected," which is what puts
        // RequireGitHubSetup's PAT popup back in front of them. Re-saving
        // a token (SaveUserGitHubCredentialsAsync) clears the flag and
        // this goes back to reporting the real value.
        var signedOut = entry?["SignedOut"]?.Value<bool>() ?? false;

        return new UserGitHubCredentials(
            entry?["Owner"]?.ToString() ?? string.Empty,
            entry?["Repository"]?.ToString() ?? string.Empty,
            signedOut ? null : Unprotect(entry?["PersonalAccessToken"]?.ToString()),
            entry?["PreviousOwner"]?.ToString(),
            entry?["PreviousRepository"]?.ToString());
    }

    // The raw SignedOut flag, unmasked by GetUserGitHubCredentialsAsync's
    // "report no token" behavior - lets a caller tell "never configured
    // anything" apart from "an admin signed this session out," which is
    // what RequireGitHubSetup uses to show a specific explanation instead
    // of the generic first-time setup message.
    public async Task<bool> IsPatUserSignedOutAsync(string key)
    {
        var root = await ReadRootAsync();
        var entry = (root["UserGitHubCredentials"] as JObject)?[key] as JObject;

        return entry?["SignedOut"]?.Value<bool>() ?? false;
    }

    // Admin-triggered "Sign Out" from the Services page's Users tab - a
    // soft delete, not a real one: the stored token/repo are left exactly
    // as they were, only a flag is set that makes every read of them (see
    // GetUserGitHubCredentialsAsync above) report "not connected" instead.
    // The practical effect is the same as if their token had never been
    // entered - GitHubAuthService can't authenticate as them, and
    // RequireGitHubSetup puts the PAT setup popup back in front of them -
    // but nothing is actually lost, and typing a token back in (even the
    // same one) immediately undoes it.
    public async Task SoftSignOutPatUserAsync(string key)
    {
        var root = await ReadRootAsync();

        if (root["UserGitHubCredentials"] is JObject users && users[key] is JObject entry)
        {
            entry["SignedOut"] = true;
            await WriteRootAsync(root);

            _log.LogInfo("Settings", $"PAT user '{MaskKey(key)}' signed out by admin (soft - token kept, marked inactive).");
        }
    }

    // A real delete (unlike SoftSignOutPatUserAsync above) - the Services
    // page's Users tab "Delete" action for a session an admin never wants
    // to see again. Removes everything tied to that key: GitHub, AWS,
    // Azure, GCP credentials, sidebar access restrictions, and its block
    // flag if it had one. Irreversible - if that browser comes back, it
    // starts over as a brand-new, unconfigured session.
    public async Task DeletePatUserAsync(string key)
    {
        var root = await ReadRootAsync();

        (root["UserGitHubCredentials"] as JObject)?.Remove(key);
        (root["UserAwsCredentials"] as JObject)?.Remove(key);
        (root["UserAzureCredentials"] as JObject)?.Remove(key);
        (root["UserGcpCredentials"] as JObject)?.Remove(key);
        (root["SidebarAccess"] as JObject)?.Remove(key);

        if (root["BlockedPatUsers"] is JArray blocked)
            root["BlockedPatUsers"] = new JArray(blocked.Where(k => k.ToString() != key));

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"PAT user '{MaskKey(key)}' deleted by admin.");
    }

    // Carries a reconnecting PAT owner's own saved data across to the new
    // session that just proved ownership of their token - AWS/Azure/GCP
    // credentials, their screen-lock PIN, and any admin-set sidebar
    // restrictions. Without this, logging in with the same PAT from a
    // different browser (or after localStorage/portalSessionId resets)
    // meant starting over from nothing even though it's genuinely the
    // same person - SaveUserGitHubCredentialsAsync already detects this
    // exact situation (see ResolvePatOwnerLoginAsync below) to evict the
    // old session; this runs right before that eviction so the data isn't
    // simply lost. Only ever copies a field the destination doesn't
    // already have - anything already entered in the new session during
    // THIS visit wins over older data being migrated in, rather than
    // being silently overwritten by it.
    private async Task MigrateSessionDataAsync(string fromKey, string toKey)
    {
        var root = await ReadRootAsync();
        var changed = false;

        void MigrateField(string sectionName)
        {
            if (root[sectionName] is not JObject section) return;
            if (!section.TryGetValue(fromKey, out var value)) return;
            if (section.ContainsKey(toKey)) return;

            section[toKey] = value.DeepClone();
            changed = true;
        }

        MigrateField("UserAwsCredentials");
        MigrateField("UserAzureCredentials");
        MigrateField("UserGcpCredentials");
        MigrateField("SecurityPins");
        MigrateField("SidebarAccess");

        if (changed)
        {
            await WriteRootAsync(root);
            _log.LogInfo("Settings", $"Migrated saved AWS/Azure/GCP/PIN/sidebar data to the reconnecting session for '{MaskKey(toKey)}'.");
        }
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
        var newOwner = update.Owner?.Trim() ?? string.Empty;
        var newRepository = update.Repository?.Trim() ?? string.Empty;

        // Stash whatever was active right before this switch (Dashboard's
        // "Previously used" quick-switch reads this) - only when something
        // real was already configured and it's actually changing, so first-
        // time setup and a same-repo token refresh never fabricate a bogus
        // "previous" repo.
        var previousOwner = entry["Owner"]?.ToString();
        var previousRepository = entry["Repository"]?.ToString();

        if (!string.IsNullOrWhiteSpace(previousOwner) && !string.IsNullOrWhiteSpace(previousRepository)
            && (previousOwner != newOwner || previousRepository != newRepository))
        {
            entry["PreviousOwner"] = previousOwner;
            entry["PreviousRepository"] = previousRepository;
        }

        entry["Owner"] = newOwner;
        entry["Repository"] = newRepository;

        string? evictedDuplicateLogin = null;

        if (!string.IsNullOrWhiteSpace(update.PersonalAccessToken))
        {
            var trimmedToken = update.PersonalAccessToken.Trim();
            entry["PersonalAccessToken"] = Protect(trimmedToken);

            // Reconnecting undoes an admin's earlier soft sign-out (see
            // SoftSignOutPatUserAsync) - typing a token back in is exactly
            // the recovery path that flag exists to require.
            entry.Remove("SignedOut");

            // One session per real GitHub account: if this token belongs
            // to an identity that some OTHER key already has stored,
            // that older session is deleted outright (see
            // DeletePatUserAsync) instead of being left as a duplicate
            // row - the browser saving right now becomes the one and
            // only session for that GitHub account.
            var resolvedLogin = await ResolvePatOwnerLoginAsync(trimmedToken);

            if (!string.IsNullOrWhiteSpace(resolvedLogin))
            {
                var existing = await GetPatUsersAsync();

                foreach (var other in existing.Where(u => u.Key != login && u.PatOwnerLogin == resolvedLogin))
                {
                    await MigrateSessionDataAsync(other.Key, login);
                    await DeletePatUserAsync(other.Key);
                    evictedDuplicateLogin = resolvedLogin;
                }

                // DeletePatUserAsync above wrote its own fresh copy of
                // root - re-read so this save doesn't clobber that with
                // the stale root captured at the top of this method.
                if (evictedDuplicateLogin != null)
                {
                    root = await ReadRootAsync();
                    users = root["UserGitHubCredentials"] as JObject ?? new JObject();
                }
            }
        }

        users[login] = entry;
        root["UserGitHubCredentials"] = users;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"GitHub settings saved for '{login}': {update.Owner}/{update.Repository}"
            + (string.IsNullOrWhiteSpace(update.PersonalAccessToken) ? "" : " (token updated)")
            + (evictedDuplicateLogin != null ? $" (replaced an existing session for @{evictedDuplicateLogin})" : ""));

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

    // Reference defaults so the Dashboard's Environments card shows
    // something useful before an admin has configured anything — one per
    // existing release/CD workflow, cloud target left unset ("none") since
    // there's no real AWS/Azure target to assume. An admin edits these
    // (including renaming or removing them) in Settings > Environments;
    // once anything is saved there, these defaults are never shown again.
    private static List<EnvironmentDefinitionDto> DefaultEnvironments() => new()
    {
        new EnvironmentDefinitionDto { Name = "API", WorkflowName = "Release API" },
        new EnvironmentDefinitionDto { Name = "Admin API", WorkflowName = "Release Admin API" },
        new EnvironmentDefinitionDto { Name = "PMSCore API", WorkflowName = "Release PMSCore API" },
        new EnvironmentDefinitionDto { Name = "Security API", WorkflowName = "Release Security API" }
    };

    // Portal-wide (not per-visitor) — which deployment targets exist and
    // what each maps to is a shared, admin-managed fact about the portal,
    // same as the External APIs endpoint list.
    public async Task<List<EnvironmentDefinitionDto>> GetEnvironmentDefinitionsAsync()
    {
        var root = await ReadRootAsync();
        var array = root["Environments"]?["Definitions"] as JArray;

        if (array == null)
            return DefaultEnvironments();

        return array
            .Select(x => x.ToObject<EnvironmentDefinitionDto>())
            .Where(x => x != null)
            .Select(x => x!)
            .ToList();
    }

    public async Task<List<EnvironmentDefinitionDto>> SaveEnvironmentDefinitionsAsync(List<EnvironmentDefinitionDto> environments)
    {
        var root = await ReadRootAsync();

        var section = root["Environments"] as JObject ?? new JObject();
        section["Definitions"] = JArray.FromObject(environments ?? new List<EnvironmentDefinitionDto>());
        root["Environments"] = section;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Environment list saved ({environments?.Count ?? 0} environment(s)).");

        return await GetEnvironmentDefinitionsAsync();
    }

    // AWS/Azure credentials, one visitor at a time — same isolation as
    // UserGitHubCredentials (see PortalIdentity): keyed by session, never
    // shared portal-wide, since these are secrets that authorize real
    // cloud-account access.
    public async Task<UserAwsCredentials> GetUserAwsCredentialsAsync(string key)
    {
        var root = await ReadRootAsync();
        var entry = (root["UserAwsCredentials"] as JObject)?[key] as JObject;

        return new UserAwsCredentials(
            entry?["AccessKeyId"]?.ToString(),
            Unprotect(entry?["SecretAccessKey"]?.ToString()),
            entry?["Region"]?.ToString(),
            entry?["MfaSerialNumber"]?.ToString(),
            entry?["SessionAccessKeyId"]?.ToString(),
            Unprotect(entry?["SessionSecretAccessKey"]?.ToString()),
            Unprotect(entry?["SessionToken"]?.ToString()),
            DateTime.TryParse(entry?["ExpiresAtUtc"]?.ToString(), out var expiresAt) ? expiresAt : null,
            entry?["SsoAccountId"]?.ToString(),
            entry?["SsoAccountName"]?.ToString(),
            entry?["SsoRoleName"]?.ToString());
    }

    // Blank fields keep whatever was already saved (same as
    // SaveUserGitHubCredentialsAsync's token) - lets the region be updated
    // without retyping the secret key, or vice versa. `session` is the
    // temporary credential set from either a successful STS GetSessionToken
    // (MFA path) or AWS SSO's GetRoleCredentials (SSO path, carries the
    // Sso* display fields too) - null when this save didn't establish a
    // new session at all.
    public async Task SaveUserAwsCredentialsAsync(string key, AwsCredentialsUpdateDto update, AwsSessionCredentials? session = null)
    {
        var root = await ReadRootAsync();
        var users = root["UserAwsCredentials"] as JObject ?? new JObject();
        var entry = users[key] as JObject ?? new JObject();

        if (!string.IsNullOrWhiteSpace(update.AccessKeyId))
            entry["AccessKeyId"] = update.AccessKeyId.Trim();

        if (!string.IsNullOrWhiteSpace(update.SecretAccessKey))
            entry["SecretAccessKey"] = Protect(update.SecretAccessKey.Trim());

        if (!string.IsNullOrWhiteSpace(update.Region))
            entry["Region"] = update.Region.Trim();

        if (!string.IsNullOrWhiteSpace(update.MfaSerialNumber))
            entry["MfaSerialNumber"] = update.MfaSerialNumber.Trim();

        if (session != null)
        {
            entry["SessionAccessKeyId"] = session.AccessKeyId;
            entry["SessionSecretAccessKey"] = Protect(session.SecretAccessKey);
            entry["SessionToken"] = Protect(session.SessionToken);
            entry["ExpiresAtUtc"] = session.ExpiresAtUtc.ToString("o");
            entry["SsoAccountId"] = session.SsoAccountId;
            entry["SsoAccountName"] = session.SsoAccountName;
            entry["SsoRoleName"] = session.SsoRoleName;
        }

        users[key] = entry;
        root["UserAwsCredentials"] = users;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", "AWS credentials saved for a session." + (session != null ? " (new session established)" : ""));
    }

    public async Task ClearUserAwsCredentialsAsync(string key)
    {
        var root = await ReadRootAsync();

        if (root["UserAwsCredentials"] is JObject users && users[key] != null)
        {
            users.Remove(key);
            await WriteRootAsync(root);

            _log.LogInfo("Settings", "AWS credentials cleared for a session.");
        }
    }

    public async Task<UserAzureCredentials> GetUserAzureCredentialsAsync(string key)
    {
        var root = await ReadRootAsync();
        var entry = (root["UserAzureCredentials"] as JObject)?[key] as JObject;

        return new UserAzureCredentials(
            entry?["TenantId"]?.ToString(),
            entry?["ClientId"]?.ToString(),
            Unprotect(entry?["ClientSecret"]?.ToString()));
    }

    // Blank fields keep whatever was already saved - see SaveUserAwsCredentialsAsync.
    public async Task SaveUserAzureCredentialsAsync(string key, AzureCredentialsUpdateDto update)
    {
        var root = await ReadRootAsync();
        var users = root["UserAzureCredentials"] as JObject ?? new JObject();
        var entry = users[key] as JObject ?? new JObject();

        if (!string.IsNullOrWhiteSpace(update.TenantId))
            entry["TenantId"] = update.TenantId.Trim();

        if (!string.IsNullOrWhiteSpace(update.ClientId))
            entry["ClientId"] = update.ClientId.Trim();

        if (!string.IsNullOrWhiteSpace(update.ClientSecret))
            entry["ClientSecret"] = Protect(update.ClientSecret.Trim());

        users[key] = entry;
        root["UserAzureCredentials"] = users;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", "Azure credentials saved for a session.");
    }

    public async Task ClearUserAzureCredentialsAsync(string key)
    {
        var root = await ReadRootAsync();

        if (root["UserAzureCredentials"] is JObject users && users[key] != null)
        {
            users.Remove(key);
            await WriteRootAsync(root);

            _log.LogInfo("Settings", "Azure credentials cleared for a session.");
        }
    }

    public async Task<UserGcpCredentials> GetUserGcpCredentialsAsync(string key)
    {
        var root = await ReadRootAsync();
        var entry = (root["UserGcpCredentials"] as JObject)?[key] as JObject;

        return new UserGcpCredentials(
            entry?["ProjectId"]?.ToString(),
            Unprotect(entry?["ServiceAccountKeyJson"]?.ToString()));
    }

    // Blank fields keep whatever was already saved - see SaveUserAwsCredentialsAsync.
    public async Task SaveUserGcpCredentialsAsync(string key, GcpCredentialsUpdateDto update)
    {
        var root = await ReadRootAsync();
        var users = root["UserGcpCredentials"] as JObject ?? new JObject();
        var entry = users[key] as JObject ?? new JObject();

        if (!string.IsNullOrWhiteSpace(update.ProjectId))
            entry["ProjectId"] = update.ProjectId.Trim();

        if (!string.IsNullOrWhiteSpace(update.ServiceAccountKeyJson))
            entry["ServiceAccountKeyJson"] = Protect(update.ServiceAccountKeyJson.Trim());

        users[key] = entry;
        root["UserGcpCredentials"] = users;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", "GCP credentials saved for a session.");
    }

    public async Task ClearUserGcpCredentialsAsync(string key)
    {
        var root = await ReadRootAsync();

        if (root["UserGcpCredentials"] is JObject users && users[key] != null)
        {
            users.Remove(key);
            await WriteRootAsync(root);

            _log.LogInfo("Settings", "GCP credentials cleared for a session.");
        }
    }

    public async Task<SettingsViewDto> SaveDockerAsync(DockerSettingsUpdateDto update)
    {
        var root = await ReadRootAsync();

        var docker = root["Docker"] as JObject ?? new JObject();

        docker["Registry"] = update.Registry;
        docker["Username"] = update.Username;

        if (!string.IsNullOrWhiteSpace(update.Password))
            docker["Password"] = Protect(update.Password);

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

    // SonarCloud/SonarQube credentials for the Code Quality page — shared,
    // portal-wide, same as Docker/OAuth above (there's one repo being
    // scanned, not one per PAT user). The token is never sent to the
    // frontend; SonarController uses it server-side to call Sonar's own Web
    // API, the same pattern GitHub credentials already follow.
    public async Task<SettingsViewDto> SaveSonarAsync(SonarSettingsUpdateDto update)
    {
        var root = await ReadRootAsync();

        var sonar = root["Sonar"] as JObject ?? new JObject();

        sonar["HostUrl"] = string.IsNullOrWhiteSpace(update.HostUrl) ? "https://sonarcloud.io" : update.HostUrl.TrimEnd('/');
        sonar["Organization"] = update.Organization ?? string.Empty;
        sonar["ProjectKey"] = update.ProjectKey ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(update.Token))
            sonar["Token"] = Protect(update.Token);

        root["Sonar"] = sonar;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Sonar settings saved: {update.Organization}/{update.ProjectKey}"
            + (string.IsNullOrWhiteSpace(update.Token) ? "" : " (token updated)"));

        return BuildView(root);
    }

    public async Task<SonarCredentials> GetSonarCredentialsAsync()
    {
        var root = await ReadRootAsync();
        var sonar = root["Sonar"] as JObject;

        return new SonarCredentials(
            sonar?["HostUrl"]?.ToString() is string h && !string.IsNullOrWhiteSpace(h) ? h : "https://sonarcloud.io",
            sonar?["Organization"]?.ToString() ?? string.Empty,
            sonar?["ProjectKey"]?.ToString() ?? string.Empty,
            Unprotect(sonar?["Token"]?.ToString()));
    }

    // Deployment Copilot's Gemini API key/model - portal-wide, shared, same
    // storage model as Sonar above. The key is never sent to the frontend
    // (see SettingsViewDto/BuildView, which only ever exposes AiModel and
    // AiApiKeyConfigured); GeminiService/AiToolsService are the only
    // callers of GetAiAssistantCredentialsAsync below.
    public async Task<SettingsViewDto> SaveAiAssistantAsync(AiAssistantSettingsUpdateDto update)
    {
        var root = await ReadRootAsync();

        var ai = root["AiAssistant"] as JObject ?? new JObject();

        // Accept either a bare model ID ("gemini-2.0-flash") or the full
        // resource name as Google's docs/AI Studio often display it
        // ("models/gemini-2.0-flash") - GeminiService always builds the
        // URL as ".../models/{model}:generateContent", so a stored value
        // that still had "models/" on it would 404 twice-prefixed. See
        // GeminiService.NormalizeModel for the same rule applied
        // defensively at call time too.
        var normalizedModel = (update.Model ?? string.Empty).Trim().Trim('/');

        if (normalizedModel.StartsWith("models/", StringComparison.OrdinalIgnoreCase))
            normalizedModel = normalizedModel["models/".Length..];

        ai["Model"] = normalizedModel;

        if (!string.IsNullOrWhiteSpace(update.ApiKey))
            ai["GeminiApiKey"] = Protect(update.ApiKey);

        root["AiAssistant"] = ai;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"AI Assistant settings saved (model: {update.Model})"
            + (string.IsNullOrWhiteSpace(update.ApiKey) ? "" : ", API key updated"));

        return BuildView(root);
    }

    public async Task<AiAssistantCredentials> GetAiAssistantCredentialsAsync()
    {
        var root = await ReadRootAsync();
        var ai = root["AiAssistant"] as JObject;

        return new AiAssistantCredentials(
            Unprotect(ai?["GeminiApiKey"]?.ToString()),
            ai?["Model"]?.ToString() ?? string.Empty);
    }

    // Forces every visitor's browser to refresh to the latest deployed
    // frontend build (see AppVersionController) - a portal-wide counter,
    // same shared/admin-writable storage model as every other section
    // here, just with no secret field to mask. GET is anonymous (even a
    // visitor stuck at the pre-login setup screen should get prompted to
    // refresh); only the increment is admin-gated.
    public async Task<long> GetAppVersionAsync()
    {
        var root = await ReadRootAsync();
        var cache = root["AppCache"] as JObject;

        return cache?["Version"]?.Value<long>() ?? 1;
    }

    public async Task<long> IncrementAppVersionAsync()
    {
        var root = await ReadRootAsync();
        var cache = root["AppCache"] as JObject ?? new JObject();

        var next = (cache["Version"]?.Value<long>() ?? 1) + 1;
        cache["Version"] = next;

        root["AppCache"] = cache;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Application cache version bumped to {next} — every visitor will be prompted to refresh.");

        return next;
    }

    public async Task<SettingsViewDto> SaveAdminUsernamesAsync(AdminUsernamesUpdateDto update)
    {
        var root = await ReadRootAsync();

        var auth = root["Auth"] as JObject ?? new JObject();

        auth["AdminGitHubUsernames"] = new JArray(update.AdminGitHubUsernames);

        root["Auth"] = auth;

        await WriteRootAsync(root);

        // An empty allowlist is "bootstrap mode" (see AdminGate.
        // IsAdminOrBootstrap) - literally every visitor becomes Admin until
        // this is configured again. The frontend already confirms this
        // with the person saving it; logging it as an Error (not Info) is
        // what makes it stand out in Activity Log for anyone checking on
        // this instance's security posture afterward, not just at the
        // moment it happened.
        if (update.AdminGitHubUsernames.Count == 0)
            _log.LogError("Settings", "Admin allowlist saved EMPTY - every visitor to this portal is now treated as Admin (bootstrap mode) until it's configured again.");
        else
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
        ["sonar"] = ("Sonar", "Token"),
        ["ai"] = ("AiAssistant", "GeminiApiKey")
    };

    // Resets just the CALLER's own credentials (GitHub, AWS, Azure, GCP) -
    // no admin required to call this, same as saving any one of them isn't
    // admin-gated either (see SaveUserGitHubCredentialsAsync etc.). Other
    // visitors' own entries are untouched - this never reaches into
    // another session's data.
    public async Task<SettingsViewDto> ClearMyCredentialsAsync(string callerKey)
    {
        var root = await ReadRootAsync();

        if (root["UserGitHubCredentials"] is JObject githubUsers)
            githubUsers.Remove(callerKey);

        if (root["UserAwsCredentials"] is JObject awsUsers)
            awsUsers.Remove(callerKey);

        if (root["UserAzureCredentials"] is JObject azureUsers)
            azureUsers.Remove(callerKey);

        if (root["UserGcpCredentials"] is JObject gcpUsers)
            gcpUsers.Remove(callerKey);

        // The screen-lock PIN (see SetPinAsync/VerifyPinAsync below) is part
        // of this same "your own security settings" scope - PinLockScreen's
        // "Forgot your PIN?" link calls this same self-clear, and leaving
        // the PIN in place would mean "forgot it" still locks the next
        // visit behind the very PIN that was just declared forgotten.
        if (root["SecurityPins"] is JObject pins)
            pins.Remove(callerKey);

        await WriteRootAsync(root);

        _log.LogInfo("Settings", "One visitor's own credentials cleared (GitHub/AWS/Azure/GCP/screen-lock PIN).");

        return BuildView(root);
    }

    // The admin version of the button above: everything ClearMyCredentialsAsync
    // does, PLUS every shared, portal-wide section (Docker, GitHubOAuth,
    // Sonar) - resetting the whole portal back to unconfigured, first-run
    // state for everyone, not just the caller. Admin-gated at the
    // controller because those sections affect every visitor, not just
    // whoever clicked the button. "Auth" (the admin allowlist) is
    // deliberately the one exception even here: wiping it used to drop the
    // whole portal into bootstrap mode (anyone is Admin until it's
    // reconfigured) as a side effect of a reset button - a much bigger
    // blast radius than intended. Jwt is deliberately left alone too, so
    // existing sessions/cookies stay valid.
    public async Task<SettingsViewDto> ClearAllAsync(string callerKey)
    {
        var root = await ReadRootAsync();

        root.Remove("Docker");
        root.Remove("GitHubOAuth");
        root.Remove("Sonar");
        root.Remove("AiAssistant");

        await WriteRootAsync(root);

        _log.LogInfo("Settings", "Shared portal-wide settings cleared (admin allowlist kept).");

        return await ClearMyCredentialsAsync(callerKey);
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
            ? $"Sidebar access updated for '{MaskKey(key)}': {string.Join(", ", entry.Properties().Select(p => $"{p.Name}={p.Value}"))}"
            : $"Sidebar access reset for '{MaskKey(key)}' — every tab visible again.");

        return await GetSidebarAccessAsync(key);
    }

    // Scoped alternative to the global admin allowlist: a GitHub login can
    // be granted admin authority for ONE page's actions (e.g. Docker) without
    // joining AdminGitHubUsernames, which would hand them every admin-gated
    // action portal-wide. Keyed by GitHub login (not a PortalIdentity session
    // key) for the same reason the allowlist itself is — a login survives
    // that person re-configuring their PAT or switching browsers, where a
    // session key wouldn't. Only these page keys are grantable: each maps to
    // a real page with its own admin-gated controller (see AdminGate call
    // sites) — "settings" itself is deliberately excluded, same rule as
    // UnrestrictableTabs above, since granting Settings access would let a
    // scoped grantee edit the admin allowlist and grant themselves anything.
    // IReadOnlySet, not HashSet: a public static HashSet is only
    // reference-immutable (the field itself can't be reassigned), not
    // content-immutable — any caller could still do
    // GrantablePageKeys.Add("settings") and silently defeat the
    // "settings is never grantable" rule above. The interface hides
    // Add/Remove/Clear from callers entirely.
    public static readonly IReadOnlySet<string> GrantablePageKeys = new HashSet<string>
    {
        "deploy", "approvals", "pullRequests", "storage", "environments", "docker", "services", "codeQuality"
    };

    public async Task<Dictionary<string, List<string>>> GetPageAdminGrantsAsync()
    {
        var root = await ReadRootAsync();
        var grants = root["PageAdminGrants"] as JObject ?? new JObject();

        return grants.Properties()
            .ToDictionary(
                p => p.Name,
                p => (p.Value as JArray)?.Select(v => v.ToString()).ToList() ?? new List<string>());
    }

    public async Task<List<string>> GetPageAdminGrantAsync(string pageKey)
    {
        var all = await GetPageAdminGrantsAsync();
        return all.TryGetValue(pageKey, out var logins) ? logins : new List<string>();
    }

    public async Task<bool> IsGrantedPageAdminAsync(string pageKey, string? login)
    {
        if (string.IsNullOrWhiteSpace(login))
            return false;

        var logins = await GetPageAdminGrantAsync(pageKey);
        return logins.Any(u => string.Equals(u, login, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<List<string>> GrantPageAdminAsync(string pageKey, string login)
    {
        if (!GrantablePageKeys.Contains(pageKey))
            throw new ArgumentException($"'{pageKey}' isn't a grantable page.");

        var root = await ReadRootAsync();
        var grants = root["PageAdminGrants"] as JObject ?? new JObject();
        var list = grants[pageKey] as JArray ?? new JArray();

        if (!list.Any(v => string.Equals(v.ToString(), login, StringComparison.OrdinalIgnoreCase)))
            list.Add(login);

        grants[pageKey] = list;
        root["PageAdminGrants"] = grants;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Granted '{pageKey}' admin access to @{login}.");

        return list.Select(v => v.ToString()).ToList();
    }

    public async Task<List<string>> RevokePageAdminAsync(string pageKey, string login)
    {
        var root = await ReadRootAsync();
        var grants = root["PageAdminGrants"] as JObject;
        var list = grants?[pageKey] as JArray;

        if (list != null)
        {
            var match = list.FirstOrDefault(v => string.Equals(v.ToString(), login, StringComparison.OrdinalIgnoreCase));

            if (match != null)
                list.Remove(match);

            if (list.Count == 0)
                grants!.Remove(pageKey);

            await WriteRootAsync(root);
        }

        _log.LogInfo("Settings", $"Revoked '{pageKey}' admin access from @{login}.");

        return list?.Select(v => v.ToString()).ToList() ?? new List<string>();
    }

    // Settings > External APIs — a portal-wide, admin-pasted list of
    // external health-check URLs (one per line) to monitor, stored as raw
    // text rather than a parsed structure since grouping by version/
    // cluster/service is display-only logic that lives entirely on the
    // frontend (see parseHealthEndpoint.js) and can evolve without a
    // storage migration.
    public async Task<string> GetExternalHealthEndpointsAsync()
    {
        var root = await ReadRootAsync();
        return root["ExternalHealth"]?["EndpointsText"]?.ToString() ?? string.Empty;
    }

    public async Task<string> SaveExternalHealthEndpointsAsync(string endpointsText)
    {
        var root = await ReadRootAsync();
        var section = root["ExternalHealth"] as JObject ?? new JObject();

        section["EndpointsText"] = endpointsText ?? string.Empty;
        root["ExternalHealth"] = section;

        await WriteRootAsync(root);

        var count = (endpointsText ?? string.Empty)
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Length;

        _log.LogInfo("Settings", $"External API endpoint list saved ({count} line(s)).");

        return await GetExternalHealthEndpointsAsync();
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
        var blocked = root["BlockedPatUsers"] as JArray;

        if (users == null)
            return new List<PatUserSummaryDto>();

        var entries = users.Properties()
            .Where(p => p.Value is JObject entry && !string.IsNullOrWhiteSpace(entry["PersonalAccessToken"]?.ToString()))
            .ToList();

        // Two different browsers can configure the SAME repo (as in
        // "VarshithChand/yaml" for both an admin's own session and a
        // teammate's) — Owner/Repository alone can't tell them apart, so
        // this resolves each token's actual GitHub identity live, the same
        // way AdminGate does for the admin-authority check itself. Uses the
        // richer status variant (not ResolvePatOwnerLoginAsync, kept
        // unchanged for the security-sensitive eviction/migration callers
        // that only need a plain match/no-match) so a genuinely bad
        // credential and a merely-transient failure (GitHub rate limit, a
        // network blip) don't collapse into the same misleading label.
        var statuses = await Task.WhenAll(
            entries.Select(p => ResolvePatOwnerStatusAsync(((JObject)p.Value!)["PersonalAccessToken"]!.ToString()!)));

        return entries.Select((p, i) =>
        {
            var entry = (JObject)p.Value!;
            var restrictionCount = (access?[p.Name] as JObject)?.Properties().Count() ?? 0;
            var (login, failureReason) = statuses[i];

            var ownerValue = entry["Owner"]?.ToString();
            var repositoryValue = entry["Repository"]?.ToString();

            // A hint, not a claim - kept inside the "Unknown (...)" label
            // (never its own separate value) so AdminUsersController's
            // dedupe feature, which explicitly skips anything starting
            // with "Unknown" because there's no CONFIRMED identity to
            // safely group same-named strangers by, keeps skipping it.
            // Configured Owner/Repository is a real clue for a human
            // admin reading this table, but not proof of identity the way
            // a resolved GitHub login is.
            var configuredForHint = !string.IsNullOrWhiteSpace(ownerValue) && !string.IsNullOrWhiteSpace(repositoryValue)
                ? $" — configured for {ownerValue}/{repositoryValue}"
                : string.Empty;

            return new PatUserSummaryDto
            {
                Key = p.Name,
                PatOwnerLogin = login ?? $"Unknown ({failureReason}{configuredForHint})",
                Owner = ownerValue ?? string.Empty,
                Repository = repositoryValue ?? string.Empty,
                RestrictedTabCount = restrictionCount,
                IsBlocked = blocked?.Any(k => k.ToString() == p.Name) ?? false,
                IsSignedOut = entry["SignedOut"]?.Value<bool>() ?? false
            };
        }).ToList();
    }

    // GetPatUsersAsync's `Key` above is the literal PortalIdentity session
    // key ("sess:{X-Session-Id}") - the exact bearer value that determines
    // whose saved GitHub PAT a request uses (see PortalIdentity.
    // GetOrCreateKey). Returning that raw value to an admin's browser would
    // let them replay it as their OWN X-Session-Id header and silently
    // start acting with a completely different, specific person's GitHub
    // identity - a real credential-impersonation path, not just visibility.
    // Controllers call this to swap Key for a stable-but-non-reversible
    // row identifier immediately before serializing the response; ONLY
    // after any internal per-key lookups (SessionActivityService etc.,
    // which are still keyed by the real value) have already run.
    public async Task<string> ComputeSessionRowIdAsync(string sessionKey)
    {
        var secret = await GetOrCreateRowIdSecretAsync();

        using var hmac = new HMACSHA256(secret);
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(sessionKey));

        return Convert.ToHexString(hash);
    }

    // The reverse of ComputeSessionRowIdAsync - HMAC output can't be
    // un-hashed, so this instead recomputes the row ID for every currently
    // known PAT-user session key and returns whichever one matches. The
    // list this scans is small (one row per browser/device that has ever
    // configured a GitHub PAT), so this stays cheap despite being called
    // on every admin action (Block/Unblock/Logout/Delete/Sidebar Access)
    // instead of a persisted rowId-to-key table.
    public async Task<string?> ResolveSessionKeyFromRowIdAsync(string rowId)
    {
        var root = await ReadRootAsync();
        var users = root["UserGitHubCredentials"] as JObject;

        if (users == null)
            return null;

        foreach (var property in users.Properties())
        {
            if (await ComputeSessionRowIdAsync(property.Name) == rowId)
                return property.Name;
        }

        return null;
    }

    // Same reasoning as ComputeSessionRowIdAsync, applied to Activity Log
    // text instead of an API response - Settings > Logs / Security > Audit
    // Log are both admin-only, but they're still an admin-visible surface,
    // and the whole point of the row-ID scheme is that this raw value
    // should never be fully reconstructible from anything an admin can see.
    // Keeps just enough of the key (a short prefix) for one admin-visible
    // event to be visually distinguished from another in the log, without
    // being replayable as a real X-Session-Id.
    private static string MaskKey(string key) =>
        key.Length <= 12 ? "sess:***" : $"{key[..12]}***";

    private async Task<byte[]> GetOrCreateRowIdSecretAsync()
    {
        var root = await ReadRootAsync();
        var existing = root["Internal"]?["RowIdSecret"]?.ToString();

        if (!string.IsNullOrWhiteSpace(existing))
            return Convert.FromBase64String(existing);

        var generated = RandomNumberGenerator.GetBytes(32);

        var section = root["Internal"] as JObject ?? new JObject();
        section["RowIdSecret"] = Convert.ToBase64String(generated);
        root["Internal"] = section;
        await WriteRootAsync(root);

        return generated;
    }

    // A blocked key is rejected outright by every request (see the block-
    // check middleware in Program.cs), even with a still-valid token —
    // stronger than clearing their credentials, which they could just
    // re-enter. Persisted (unlike SessionActivityService's force-logout)
    // since a block is meant to stick across restarts until an admin
    // explicitly lifts it.
    public async Task<bool> IsPatUserBlockedAsync(string key)
    {
        var root = await ReadRootAsync();
        var blocked = root["BlockedPatUsers"] as JArray;

        return blocked?.Any(k => k.ToString() == key) ?? false;
    }

    public async Task BlockPatUserAsync(string key)
    {
        var root = await ReadRootAsync();
        var blocked = root["BlockedPatUsers"] as JArray ?? new JArray();

        if (!blocked.Any(k => k.ToString() == key))
            blocked.Add(key);

        root["BlockedPatUsers"] = blocked;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"PAT user '{MaskKey(key)}' blocked by admin.");
    }

    public async Task UnblockPatUserAsync(string key)
    {
        var root = await ReadRootAsync();

        if (root["BlockedPatUsers"] is JArray blocked)
        {
            var remaining = new JArray(blocked.Where(k => k.ToString() != key));
            root["BlockedPatUsers"] = remaining;
            await WriteRootAsync(root);
        }

        _log.LogInfo("Settings", $"PAT user '{MaskKey(key)}' unblocked by admin.");
    }

    // Backs the Services page's "Security" tab's API Keys panel — persisted
    // like everything else here now, so a redeploy/restart doesn't wipe
    // them the way the old purely in-memory ApiKeyStore did.
    public async Task<List<ApiKey>> GetApiKeysAsync()
    {
        var root = await ReadRootAsync();
        var array = root["ApiKeys"] as JArray;

        return array?
            .Select(x => x.ToObject<ApiKey>())
            .Where(x => x != null)
            .Select(x => x!)
            .ToList() ?? new List<ApiKey>();
    }

    // Generates a cryptographically random key (RandomNumberGenerator, not
    // Random) and returns the raw value exactly once — only its SHA-256
    // hash plus a short prefix are ever persisted, the same as GitHub/
    // Stripe-style tokens. ownerKey is the creating session's
    // PortalIdentity key, resolved to a friendly GitHub login by
    // SecurityApiKeysController whenever this list is read back.
    public async Task<(ApiKey Entry, string RawKey)> CreateApiKeyAsync(string name, string ownerKey)
    {
        var rawKey = "sk_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawKey))).ToLowerInvariant();

        var root = await ReadRootAsync();
        var array = root["ApiKeys"] as JArray ?? new JArray();

        var nextId = array.Count == 0
            ? 1
            : array.Max(x => x["Id"]?.Value<int>() ?? 0) + 1;

        var entry = new ApiKey
        {
            Id = nextId,
            Name = string.IsNullOrWhiteSpace(name) ? "Unnamed key" : name,
            Prefix = rawKey[..11], // "sk_" + 8 hex chars — enough to tell keys apart
            HashedKey = hash,
            CreatedAt = DateTime.UtcNow,
            Revoked = false,
            OwnerKey = ownerKey
        };

        array.Add(JObject.FromObject(entry));
        root["ApiKeys"] = array;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"API key '{entry.Name}' created.");

        return (entry, rawKey);
    }

    public async Task<bool> RevokeApiKeyAsync(int id)
    {
        var root = await ReadRootAsync();

        if (root["ApiKeys"] is not JArray array)
            return false;

        var entry = array.FirstOrDefault(x => x["Id"]?.Value<int>() == id) as JObject;

        if (entry == null)
            return false;

        entry["Revoked"] = true;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"API key #{id} revoked.");

        return true;
    }

    // Would be how an incoming request's key gets checked against what's
    // stored — hash the presented key and compare, never the raw values.
    // Nothing in this app calls this yet (no endpoint actually requires
    // one of these keys) - kept as the validation path anything that
    // later does would use.
    public async Task<bool> IsApiKeyValidAsync(string presentedKey)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(presentedKey))).ToLowerInvariant();
        var keys = await GetApiKeysAsync();

        return keys.Any(k => !k.Revoked && k.HashedKey == hash);
    }

    // Screen-lock PIN — replaces PeriodicSignOutMonitor's old "wipe every
    // credential after 10 minutes" behavior for whoever sets one: instead
    // of clearing GitHub/AWS/Azure/GCP, the frontend shows a lock screen
    // and this is what it checks the entered PIN against. Only ever the
    // hash (same SHA-256 pattern as API keys above) — the raw PIN is never
    // stored, only compared against on each unlock attempt. Session-scoped
    // like every other /me/* setting - never shared across visitors.
    public async Task<bool> HasPinAsync(string key)
    {
        var root = await ReadRootAsync();
        var pins = root["SecurityPins"] as JObject;

        return !string.IsNullOrWhiteSpace(pins?[key]?.ToString());
    }

    public async Task SetPinAsync(string key, string pin)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(pin))).ToLowerInvariant();

        var root = await ReadRootAsync();
        var pins = root["SecurityPins"] as JObject ?? new JObject();

        pins[key] = hash;
        root["SecurityPins"] = pins;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", "Screen-lock PIN set for a session.");
    }

    public async Task ClearPinAsync(string key)
    {
        var root = await ReadRootAsync();

        if (root["SecurityPins"] is JObject pins && pins.Remove(key))
            await WriteRootAsync(root);
    }

    public async Task<bool> VerifyPinAsync(string key, string pin)
    {
        var root = await ReadRootAsync();
        var pins = root["SecurityPins"] as JObject;
        var stored = pins?[key]?.ToString();

        if (string.IsNullOrWhiteSpace(stored))
            return false;

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(pin))).ToLowerInvariant();

        return stored == hash;
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

    // Same live /user lookup as ResolvePatOwnerLoginAsync above, for
    // GetPatUsersAsync's admin-facing display specifically - distinguishes
    // a genuinely bad credential (401, GitHub rejects the token itself)
    // from a merely transient failure (rate limited, network error, a
    // GitHub outage), which the plain string? version collapses into the
    // same "null" either way. Kept as a separate method rather than
    // changing ResolvePatOwnerLoginAsync's signature - its other callers
    // (the one-session-per-account eviction/migration check) only ever
    // need "did this resolve to a real login or not," not why it didn't.
    private static async Task<(string? Login, string FailureReason)> ResolvePatOwnerStatusAsync(string token)
    {
        using var client = new HttpClient();

        client.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
        client.DefaultRequestHeaders.Add("User-Agent", "DeploymentPortal");
        client.DefaultRequestHeaders.Add("Accept", "application/vnd.github+json");

        try
        {
            var response = await client.GetAsync("https://api.github.com/user");

            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                return (null, "invalid or expired token");

            if (!response.IsSuccessStatusCode)
                return (null, "unable to verify right now");

            var json = await response.Content.ReadAsStringAsync();
            var login = JObject.Parse(json)["login"]?.ToString();

            return (login, "unable to verify right now");
        }
        catch
        {
            return (null, "unable to verify right now");
        }
    }

    public async Task ClearSidebarAccessAsync(string key)
    {
        var root = await ReadRootAsync();

        if (root["SidebarAccess"] is JObject users && users.Remove(key))
        {
            await WriteRootAsync(root);
            _log.LogInfo("Settings", $"Sidebar access reset for '{MaskKey(key)}' — every tab visible again.");
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

    // Bumped whenever a deployment is triggered through the portal (see
    // DeploymentController.Deploy) - every browser session polls
    // GET /api/auth/session-epoch and compares against the value it saw on
    // its own last load. A changed value means "someone just ran a
    // pipeline since I last checked," which is this portal's stand-in for
    // "force every session to log out": there's no server-side session
    // store to revoke (auth is a stateless JWT cookie, and most visitors
    // aren't even OAuth-logged-in — see PortalIdentity), so the timestamp
    // itself IS the signal, and each tab independently reacts to seeing it
    // change rather than being individually revoked.
    public async Task<string> BumpForceLogoutEpochAsync()
    {
        var root = await ReadRootAsync();
        var session = root["Session"] as JObject ?? new JObject();

        var stamp = DateTime.UtcNow.ToString("o");
        session["ForceLogoutEpoch"] = stamp;
        root["Session"] = session;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", "Force-logout epoch bumped — a deployment run will sign out every active session.");

        return stamp;
    }

    public async Task<string?> GetForceLogoutEpochAsync()
    {
        var root = await ReadRootAsync();
        return root["Session"]?["ForceLogoutEpoch"]?.ToString();
    }

    private static SettingsViewDto BuildView(JObject root)
    {
        var docker = root["Docker"] as JObject;
        var oauth = root["GitHubOAuth"] as JObject;
        var auth = root["Auth"] as JObject;
        var sonar = root["Sonar"] as JObject;
        var ai = root["AiAssistant"] as JObject;

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

            AdminGitHubUsernames = admins,

            SonarHostUrl = sonar?["HostUrl"]?.ToString() is string h && !string.IsNullOrWhiteSpace(h) ? h : "https://sonarcloud.io",
            SonarOrganization = sonar?["Organization"]?.ToString() ?? string.Empty,
            SonarProjectKey = sonar?["ProjectKey"]?.ToString() ?? string.Empty,
            SonarTokenConfigured = !string.IsNullOrWhiteSpace(sonar?["Token"]?.ToString()),

            AiProvider = "Google Gemini",
            AiModel = ai?["Model"]?.ToString() ?? string.Empty,
            AiApiKeyConfigured = !string.IsNullOrWhiteSpace(ai?["GeminiApiKey"]?.ToString())
        };
    }

    private async Task<JObject> ReadRootAsync()
    {
        if (_cachedRoot != null)
            return _cachedRoot;

        JObject root;

        if (_connectionString != null)
        {
            root = await ReadRootFromDatabaseAsync();
        }
        else if (!File.Exists(_localSettingsPath))
        {
            root = new JObject();
        }
        else
        {
            var text = await File.ReadAllTextAsync(_localSettingsPath);
            root = string.IsNullOrWhiteSpace(text) ? new JObject() : JObject.Parse(text);
        }

        _cachedRoot = root;
        return root;
    }

    // Used by the /api/health/db smoke-test endpoint - a genuine connect +
    // query against whatever DATABASE_URL points at, independent of the
    // read/write JSONB path everything else here uses. "local-file" isn't
    // a failure: plenty of deployments (local dev, a single always-on
    // host) intentionally never set DATABASE_URL at all. Host/Port/Database
    // (not the username/password half of the connection string) and a real
    // measured query time are what let the Smoke Tests page show this is a
    // live database, not a stub.
    public async Task<DatabaseHealthDto> CheckDatabaseHealthAsync()
    {
        if (_connectionString == null)
            return new DatabaseHealthDto { Healthy = true, Mode = "local-file" };

        var builder = new NpgsqlConnectionStringBuilder(_connectionString);

        try
        {
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();

            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            await using var command = new NpgsqlCommand("SELECT 1", connection);
            await command.ExecuteScalarAsync();

            stopwatch.Stop();

            return new DatabaseHealthDto
            {
                Healthy = true,
                Mode = "postgres",
                ResponseTimeMs = Math.Round(stopwatch.Elapsed.TotalMilliseconds, 1),
                Host = builder.Host,
                Port = builder.Port,
                Database = builder.Database
            };
        }
        catch (Exception ex)
        {
            return new DatabaseHealthDto { Healthy = false, Mode = "postgres", Error = ex.Message };
        }
    }

    private async Task WriteRootAsync(JObject root)
    {
        // Keeps ReadRootAsync's per-request cache correct for any read that
        // follows this write later in the same request, rather than either
        // serving stale pre-write data or forcing an unnecessary re-read.
        _cachedRoot = root;

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
    private static async Task EnsureTableAsync(NpgsqlConnection connection)
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

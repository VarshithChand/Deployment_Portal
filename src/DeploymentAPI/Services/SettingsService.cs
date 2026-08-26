using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using DeploymentAPI.DTOs;
using DeploymentAPI.Models;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
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

    // Singleton, safe to inject into this AddScoped service (a shorter-
    // lived service depending on a longer-lived one is fine; the reverse
    // isn't). Only used to force-sign-out a device this method is about to
    // evict (see SaveUserGitHubCredentialsAsync's one-session-per-account
    // check below) - everywhere else in this file already didn't need it.
    private readonly SessionActivityService _activity;

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

    // Hashes/verifies account passwords (PBKDF2-HMACSHA256, versioned) -
    // see the Users region below. TUser is only used as a generic-type
    // anchor by PasswordHasher<TUser>'s default implementation, never
    // actually read, so a throwaway PortalUserAccount with just Id set is
    // enough at every call site.
    private readonly IPasswordHasher<PortalUserAccount> _passwordHasher;

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

    public SettingsService(IHostEnvironment env, ActivityLogService log, IDataProtectionProvider dataProtectionProvider, SessionActivityService activity, IPasswordHasher<PortalUserAccount> passwordHasher)
    {
        _activity = activity;
        _passwordHasher = passwordHasher;

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

    // Host/port/database name only — never the username or password (see
    // "never expose credentials to the frontend" rule this app follows
    // everywhere else). Shared here so DatabaseController and
    // HostingObservabilityController don't each carry their own copy for
    // previewing an admin-supplied connection before it's saved -
    // DatabaseManagementService has its own instance-level copy for the
    // exact same reason (it already has a live connection string field to
    // read from, no need to route through here for that one).
    internal static string? BuildMaskedConnection(string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString)) return null;

        try
        {
            var builder = new NpgsqlConnectionStringBuilder(connectionString);
            return $"{builder.Host}:{builder.Port}/{builder.Database}";
        }
        catch
        {
            return null;
        }
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

        // Ensures the one-time super-admin seed (see
        // GetOrCreateUsersSectionAsync) has run by the time ANYTHING reads
        // the admin allowlist - GetViewAsync is the most universally-called
        // entry point in this file (AdminGate, Bootstrap, Settings itself),
        // so this is where a brand-new deploy is guaranteed to seed on its
        // very first request, not just whenever a Users-region method
        // happens to be called first.
        var (_, seeded) = await GetOrCreateUsersSectionAsync(root);

        if (seeded)
            await WriteRootAsync(root);

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

        // Returns whether it actually migrated something, rather than
        // mutating a captured outer bool - the closure-over-a-mutable-
        // local version worked correctly at runtime, but its data flow
        // wasn't something static analysis (SonarQube: "this condition
        // does not always evaluate to False") could follow through the
        // local function boundary. Same behavior either way - `|=` (not
        // short-circuiting `||`) still calls every field unconditionally.
        bool MigrateField(string sectionName)
        {
            if (root[sectionName] is not JObject section) return false;
            if (!section.TryGetValue(fromKey, out var value)) return false;
            if (section.ContainsKey(toKey)) return false;

            section[toKey] = value.DeepClone();
            return true;
        }

        var changed = MigrateField("UserAwsCredentials");
        changed |= MigrateField("UserAzureCredentials");
        changed |= MigrateField("UserGcpCredentials");
        changed |= MigrateField("SecurityPins");
        changed |= MigrateField("SidebarAccess");

        if (changed)
        {
            await WriteRootAsync(root);
            _log.LogInfo("Settings", $"Migrated saved AWS/Azure/GCP/PIN/sidebar data to the reconnecting session for '{MaskKey(toKey)}'.");
        }
    }

    // A session must be silent for this long before its device slot counts
    // as abandoned rather than "someone's actively using this right now" -
    // comfortably longer than GlobalLogoutMonitor's 15s session-epoch poll
    // (so ordinary poll jitter or a brief network hiccup never falsely
    // reads as abandoned) but short enough that closing a tab and trying
    // again a few minutes later isn't blocked by your own old session.
    private static readonly TimeSpan ActiveDeviceWindow = TimeSpan.FromMinutes(2);

    // A session counts as "still active" (and therefore blocks another
    // device's login for the same account) only if it's BOTH been seen
    // recently AND hasn't explicitly signed out. Recency alone isn't
    // enough: the sign-out flow's own requests (POST me/github/signout,
    // POST auth/logout, then the reload that follows onto the login page)
    // all touch this same session's lastSeen right up to the moment of
    // signing out - so checking recency alone meant explicitly signing
    // out on one device didn't actually free the account for a SECOND
    // device to log into for up to ActiveDeviceWindow afterward, the
    // exact opposite of what signing out is for. An explicit sign-out is
    // a stronger, deliberate signal than mere silence, so it short-
    // circuits the recency check entirely rather than waiting it out.
    private async Task<bool> IsSessionConsideredActiveAsync(string key)
    {
        var root = await ReadRootAsync();
        var entry = (root["UserGitHubCredentials"] as JObject)?[key] as JObject;

        if (entry?["SignedOut"]?.Value<bool>() ?? false)
            return false;

        var lastSeen = _activity.GetLastSeen(key);
        return lastSeen.HasValue && DateTime.UtcNow - lastSeen.Value < ActiveDeviceWindow;
    }

    // allowTakeoverIfActive: false (default) is Round 21's behavior - a
    // bare token is the only proof this call has, so an OTHER device that's
    // genuinely active right now wins and this save is refused outright.
    // true is for a caller that already has STRONGER proof than the token
    // alone - reaching this point with it set required a valid TOTP/
    // recovery code (previously AuthController.MfaVerify, now this
    // account's own MFA already having been satisfied to reach here at
    // all), which is real evidence this connection is the legitimate
    // account owner, not just whoever has a copy of the PAT string. With
    // that proof in hand, the active device loses instead of the new one -
    // migrated/evicted/notified exactly like an abandoned session already
    // was, just without waiting for it to go quiet first.
    public async Task<SaveGitHubCredentialsResult> SaveUserGitHubCredentialsAsync(
        string login, GitHubSettingsUpdateDto update, bool allowTakeoverIfActive = false)
    {
        var root = await ReadRootAsync();

        var users = root["UserGitHubCredentials"] as JObject ?? new JObject();
        var entry = users[login] as JObject ?? new JObject();

        // Resolved BEFORE any mutation below, and rejected outright (no
        // write at all) if that identity is currently active on some
        // OTHER device AND this caller has no stronger proof than the bare
        // token - one PAT, one device at a time, enforced by refusing the
        // second login rather than silently kicking the first one out. A
        // session that's gone quiet for a couple of minutes
        // (ActiveDeviceWindow), or a caller with proven MFA in hand, skips
        // this block entirely and takes over instead.
        string? evictedDuplicateLogin = null;

        if (!string.IsNullOrWhiteSpace(update.PersonalAccessToken))
        {
            var trimmedToken = update.PersonalAccessToken.Trim();
            var resolvedLogin = await ResolvePatOwnerLoginAsync(trimmedToken);

            if (!string.IsNullOrWhiteSpace(resolvedLogin))
            {
                var existing = await GetPatUsersAsync();
                var other = existing.FirstOrDefault(u => u.Key != login && u.PatOwnerLogin == resolvedLogin);

                if (other != null)
                {
                    if (!allowTakeoverIfActive)
                    {
                        var stillActive = await IsSessionConsideredActiveAsync(other.Key);

                        if (stillActive)
                        {
                            return new SaveGitHubCredentialsResult(false,
                                "This GitHub account is already signed in on another device. Sign out there first, then try again.",
                                null);
                        }
                    }

                    // Either abandoned, or this caller already proved
                    // itself via MFA - safe to take over: migrate useful
                    // data forward, then remove the other row (see
                    // DeletePatUserAsync) and notify it live via the same
                    // force-logout GlobalLogoutMonitor already reacts to.
                    await MigrateSessionDataAsync(other.Key, login);
                    await DeletePatUserAsync(other.Key);
                    _activity.ForceLogout(other.Key, "device");

                    evictedDuplicateLogin = resolvedLogin;

                    // DeletePatUserAsync above wrote its own fresh copy of
                    // root - re-read so this save doesn't clobber that
                    // with the stale root captured at the top of this
                    // method.
                    root = await ReadRootAsync();
                    users = root["UserGitHubCredentials"] as JObject ?? new JObject();
                    entry = users[login] as JObject ?? new JObject();
                }
            }
        }

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

        if (!string.IsNullOrWhiteSpace(update.PersonalAccessToken))
        {
            entry["PersonalAccessToken"] = Protect(update.PersonalAccessToken.Trim());

            // Reconnecting undoes an admin's earlier soft sign-out (see
            // SoftSignOutPatUserAsync) - typing a token back in is exactly
            // the recovery path that flag exists to require.
            entry.Remove("SignedOut");
        }

        users[login] = entry;
        root["UserGitHubCredentials"] = users;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"GitHub settings saved for '{login}': {update.Owner}/{update.Repository}"
            + (string.IsNullOrWhiteSpace(update.PersonalAccessToken) ? "" : " (token updated)")
            + (evictedDuplicateLogin != null ? $" (replaced an abandoned session for @{evictedDuplicateLogin})" : ""));

        return new SaveGitHubCredentialsResult(true, null, await GetUserGitHubCredentialsAsync(login));
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
            Unprotect(entry?["ClientSecret"]?.ToString()),
            entry?["SubscriptionId"]?.ToString());
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

        if (!string.IsNullOrWhiteSpace(update.SubscriptionId))
            entry["SubscriptionId"] = update.SubscriptionId.Trim();

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
            Unprotect(entry?["ServiceAccountKeyJson"]?.ToString()),
            entry?["Location"]?.ToString());
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

        if (!string.IsNullOrWhiteSpace(update.Location))
            entry["Location"] = update.Location.Trim();

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

    // Render/Cloudflare/Netlify/Vercel credentials, one visitor at a time -
    // same isolation as UserAwsCredentials/UserAzureCredentials above, and
    // (unlike those two, which need a record type per provider because AWS
    // and Azure's actual field sets genuinely differ) ONE generic method
    // set parameterized by `provider`, since all four PaaS providers store
    // the exact same two fields (a bearer token, and Cloudflare's account
    // id). Storage layout: root["UserPaasCredentials"][provider][key] =
    // { Token, AccountId }.
    public async Task<UserPaasCredentials> GetUserPaasCredentialsAsync(string provider, string key)
    {
        var root = await ReadRootAsync();
        var entry = ((root["UserPaasCredentials"] as JObject)?[provider] as JObject)?[key] as JObject;

        return new UserPaasCredentials(
            Unprotect(entry?["Token"]?.ToString()),
            entry?["AccountId"]?.ToString());
    }

    // Blank fields keep whatever was already saved - see SaveUserAwsCredentialsAsync.
    public async Task SaveUserPaasCredentialsAsync(string provider, string key, PaasCredentialsUpdateDto update)
    {
        var root = await ReadRootAsync();
        var providers = root["UserPaasCredentials"] as JObject ?? new JObject();
        var users = providers[provider] as JObject ?? new JObject();
        var entry = users[key] as JObject ?? new JObject();

        if (!string.IsNullOrWhiteSpace(update.Token))
            entry["Token"] = Protect(update.Token.Trim());

        if (!string.IsNullOrWhiteSpace(update.AccountId))
            entry["AccountId"] = update.AccountId.Trim();

        users[key] = entry;
        providers[provider] = users;
        root["UserPaasCredentials"] = providers;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"{provider} credentials saved for a session.");
    }

    public async Task ClearUserPaasCredentialsAsync(string provider, string key)
    {
        var root = await ReadRootAsync();

        if (root["UserPaasCredentials"] is JObject providers
            && providers[provider] is JObject users
            && users[key] != null)
        {
            users.Remove(key);
            await WriteRootAsync(root);

            _log.LogInfo("Settings", $"{provider} credentials cleared for a session.");
        }
    }

    // Portal-wide PaaS credentials for the Hosting Observability dashboard
    // (Frontend/Backend/Database tabs) - parallel to, and completely
    // separate from, UserPaasCredentials above. That store is per-VISITOR-
    // session and answers "what's under MY connected account"; this one is
    // per-PORTAL and answers "what's actually running THIS deployment", set
    // once by the super-admin (see AdminGate.DenyUnlessSuperAdminAsync on
    // every action that reads/writes it) and shown identically to every
    // visitor of the new dashboard. Storage layout:
    // root["PortalPaasCredentials"][provider] = { Token, AccountId } - same
    // shape as UserPaasCredentials's entry, minus the session-key dimension.
    public async Task<UserPaasCredentials> GetPortalPaasCredentialsAsync(string provider)
    {
        var root = await ReadRootAsync();
        var entry = (root["PortalPaasCredentials"] as JObject)?[provider] as JObject;

        return new UserPaasCredentials(
            Unprotect(entry?["Token"]?.ToString()),
            entry?["AccountId"]?.ToString());
    }

    // Blank fields keep whatever was already saved - see SaveUserPaasCredentialsAsync.
    public async Task SavePortalPaasCredentialsAsync(string provider, PaasCredentialsUpdateDto update)
    {
        var root = await ReadRootAsync();
        var providers = root["PortalPaasCredentials"] as JObject ?? new JObject();
        var entry = providers[provider] as JObject ?? new JObject();

        if (!string.IsNullOrWhiteSpace(update.Token))
            entry["Token"] = Protect(update.Token.Trim());

        if (!string.IsNullOrWhiteSpace(update.AccountId))
            entry["AccountId"] = update.AccountId.Trim();

        providers[provider] = entry;
        root["PortalPaasCredentials"] = providers;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Portal-wide {provider} credentials saved.");
    }

    public async Task ClearPortalPaasCredentialsAsync(string provider)
    {
        var root = await ReadRootAsync();

        if (root["PortalPaasCredentials"] is JObject providers && providers[provider] != null)
        {
            providers.Remove(provider);
            await WriteRootAsync(root);

            _log.LogInfo("Settings", $"Portal-wide {provider} credentials cleared.");
        }
    }

    // Docker Hub and GHCR - session-scoped, same isolation as
    // UserPaasCredentials above (each visitor connects their own, never
    // shared with any other visitor of the portal). Both reuse that exact
    // (Token, AccountId) shape and method set directly - see
    // GetUserPaasCredentialsAsync - so no dedicated methods are needed here;
    // callers pass provider "dockerhub" or "ghcr" straight into
    // GetUserPaasCredentialsAsync/SaveUserPaasCredentialsAsync/
    // ClearUserPaasCredentialsAsync.

    // GitLab Container Registry - its own dedicated shape (HostUrl,
    // ProjectId, Token), not the generic (Token, AccountId) pair - see
    // ContainerRegistryDtos.cs's own comment on why. Session-scoped: each
    // visitor's own connection, isolated from every other visitor. Storage:
    // root["UserGitLabRegistryCredentials"][key] = { HostUrl, ProjectId, Token }.
    public async Task<PortalGitLabRegistryCredentials> GetUserGitLabRegistryCredentialsAsync(string key)
    {
        var root = await ReadRootAsync();
        var node = (root["UserGitLabRegistryCredentials"] as JObject)?[key] as JObject;

        return new PortalGitLabRegistryCredentials(
            node?["HostUrl"]?.ToString(),
            node?["ProjectId"]?.ToString(),
            Unprotect(node?["Token"]?.ToString()));
    }

    // Blank fields keep whatever was already saved - see SaveUserPaasCredentialsAsync.
    public async Task SaveUserGitLabRegistryCredentialsAsync(string key, GitLabRegistryCredentialsUpdateDto update)
    {
        var root = await ReadRootAsync();
        var users = root["UserGitLabRegistryCredentials"] as JObject ?? new JObject();
        var node = users[key] as JObject ?? new JObject();

        if (!string.IsNullOrWhiteSpace(update.HostUrl))
            node["HostUrl"] = update.HostUrl.Trim().TrimEnd('/');

        if (!string.IsNullOrWhiteSpace(update.ProjectId))
            node["ProjectId"] = update.ProjectId.Trim();

        if (!string.IsNullOrWhiteSpace(update.Token))
            node["Token"] = Protect(update.Token.Trim());

        users[key] = node;
        root["UserGitLabRegistryCredentials"] = users;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", "GitLab Registry credentials saved for a session.");
    }

    public async Task ClearUserGitLabRegistryCredentialsAsync(string key)
    {
        var root = await ReadRootAsync();

        if (root["UserGitLabRegistryCredentials"] is JObject users && users[key] != null)
        {
            users.Remove(key);
            await WriteRootAsync(root);

            _log.LogInfo("Settings", "GitLab Registry credentials cleared for a session.");
        }
    }

    // JFrog Artifactory - same reasoning as GitLab Registry above, its own
    // dedicated shape (HostUrl, Token) since every Artifactory instance is
    // its own domain, unlike Docker Hub/GHCR's fixed hosts. Session-scoped.
    // Storage: root["UserJfrogCredentials"][key] = { HostUrl, Token }.
    public async Task<PortalJfrogCredentials> GetUserJfrogCredentialsAsync(string key)
    {
        var root = await ReadRootAsync();
        var node = (root["UserJfrogCredentials"] as JObject)?[key] as JObject;

        return new PortalJfrogCredentials(
            node?["HostUrl"]?.ToString(),
            Unprotect(node?["Token"]?.ToString()));
    }

    public async Task SaveUserJfrogCredentialsAsync(string key, JfrogCredentialsUpdateDto update)
    {
        var root = await ReadRootAsync();
        var users = root["UserJfrogCredentials"] as JObject ?? new JObject();
        var node = users[key] as JObject ?? new JObject();

        if (!string.IsNullOrWhiteSpace(update.HostUrl))
            node["HostUrl"] = update.HostUrl.Trim().TrimEnd('/');

        if (!string.IsNullOrWhiteSpace(update.Token))
            node["Token"] = Protect(update.Token.Trim());

        users[key] = node;
        root["UserJfrogCredentials"] = users;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", "JFrog credentials saved for a session.");
    }

    public async Task ClearUserJfrogCredentialsAsync(string key)
    {
        var root = await ReadRootAsync();

        if (root["UserJfrogCredentials"] is JObject users && users[key] != null)
        {
            users.Remove(key);
            await WriteRootAsync(root);

            _log.LogInfo("Settings", "JFrog credentials cleared for a session.");
        }
    }

    // Harbor and Nexus - both self-hosted, both authenticate with a plain
    // (HostUrl, Username, Password) Basic-auth triple - see
    // PortalHostCredentials' own comment for why that one shape covers
    // both rather than two near-identical dedicated stores. Session-scoped:
    // provider is "harbor" or "nexus", key is the caller's own session.
    // Storage: root["UserHostCredentials"][provider][key] =
    // { HostUrl, Username, Password }.
    public async Task<PortalHostCredentials> GetUserHostCredentialsAsync(string provider, string key)
    {
        var root = await ReadRootAsync();
        var entry = ((root["UserHostCredentials"] as JObject)?[provider] as JObject)?[key] as JObject;

        return new PortalHostCredentials(
            entry?["HostUrl"]?.ToString(),
            entry?["Username"]?.ToString(),
            Unprotect(entry?["Password"]?.ToString()));
    }

    // Blank fields keep whatever was already saved - see SaveUserPaasCredentialsAsync.
    public async Task SaveUserHostCredentialsAsync(string provider, string key, HostCredentialsUpdateDto update)
    {
        var root = await ReadRootAsync();
        var providers = root["UserHostCredentials"] as JObject ?? new JObject();
        var users = providers[provider] as JObject ?? new JObject();
        var entry = users[key] as JObject ?? new JObject();

        if (!string.IsNullOrWhiteSpace(update.HostUrl))
            entry["HostUrl"] = update.HostUrl.Trim().TrimEnd('/');

        if (!string.IsNullOrWhiteSpace(update.Username))
            entry["Username"] = update.Username.Trim();

        if (!string.IsNullOrWhiteSpace(update.Password))
            entry["Password"] = Protect(update.Password.Trim());

        users[key] = entry;
        providers[provider] = users;
        root["UserHostCredentials"] = providers;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"{provider} host credentials saved for a session.");
    }

    public async Task ClearUserHostCredentialsAsync(string provider, string key)
    {
        var root = await ReadRootAsync();

        if (root["UserHostCredentials"] is JObject providers
            && providers[provider] is JObject users
            && users[key] != null)
        {
            users.Remove(key);
            await WriteRootAsync(root);

            _log.LogInfo("Settings", $"{provider} host credentials cleared for a session.");
        }
    }

    // Source Control providers (currently just Azure DevOps - Organization +
    // PAT, powering the Branches/Pipelines/Build Artifacts/Package Feeds
    // sub-pages) - reuses UserPaasCredentials(Token, AccountId)'s existing
    // generic shape and method set directly (AccountId holds the org name),
    // same as Docker Hub/GHCR above - callers pass provider "azureDevOps"
    // straight into GetUserPaasCredentialsAsync/SaveUserPaasCredentialsAsync/
    // ClearUserPaasCredentialsAsync. No dedicated methods needed here.

    // Which provider+service fills each of the Hosting Observability
    // dashboard's 3 roles - see PortalDeploymentTargetsDto. One object, not
    // per-provider, since there's exactly one Frontend/Backend/(optional)
    // Database target for the whole portal. Storage: flat
    // root["PortalDeploymentTargets"] = { ... }, no secrets in it (provider/
    // service IDs only), so no Protect/Unprotect treatment is needed.
    public async Task<PortalDeploymentTargetsDto> GetPortalDeploymentTargetsAsync()
    {
        var root = await ReadRootAsync();
        var node = root["PortalDeploymentTargets"] as JObject;

        return node?.ToObject<PortalDeploymentTargetsDto>() ?? new PortalDeploymentTargetsDto();
    }

    public async Task SavePortalDeploymentTargetsAsync(PortalDeploymentTargetsDto targets)
    {
        var root = await ReadRootAsync();
        root["PortalDeploymentTargets"] = JObject.FromObject(targets);
        await WriteRootAsync(root);

        _log.LogInfo("Settings", "Portal deployment targets saved.");
    }

    // Two INDEPENDENT admin-pasted connection strings, each its own storage
    // key, each cleared without touching the other - confirmed explicitly
    // with the user rather than assumed, since it would have been just as
    // easy to accidentally let one page's "Clear" wipe both:
    //   - root["PortalDatabaseConnection"] powers ONLY the Hosting
    //     Providers -> Database tab, connected from Settings > Credentials
    //     > Database (see HostingObservabilityController).
    //   - root["PortalManagementDatabaseConnection"] powers ONLY Settings >
    //     Database's own table browser/editor, connected directly on that
    //     page (see DatabaseController). This app's own DATABASE_URL is
    //     still that page's fallback-free "must connect explicitly"
    //     requirement (see DatabaseManagementService/DatabaseController) -
    //     this is a SEPARATE credential from DATABASE_URL, not a way to
    //     re-expose it.
    // Same shape either way ({ ProviderLabel, ConnectionString(protected) })
    // so both share PortalDatabaseConnectionDto/*UpdateDto and this one
    // parametrized implementation - only the storage key differs.
    public Task<(string? ProviderLabel, string? ConnectionString)> GetPortalDatabaseConnectionAsync() =>
        GetDatabaseConnectionAsync("PortalDatabaseConnection");

    public Task SavePortalDatabaseConnectionAsync(PortalDatabaseConnectionUpdateDto update) =>
        SaveDatabaseConnectionAsync("PortalDatabaseConnection", update);

    public Task ClearPortalDatabaseConnectionAsync() =>
        ClearDatabaseConnectionAsync("PortalDatabaseConnection", "Hosting Providers dashboard");

    public Task<(string? ProviderLabel, string? ConnectionString)> GetPortalManagementDatabaseConnectionAsync() =>
        GetDatabaseConnectionAsync("PortalManagementDatabaseConnection");

    public Task SavePortalManagementDatabaseConnectionAsync(PortalDatabaseConnectionUpdateDto update) =>
        SaveDatabaseConnectionAsync("PortalManagementDatabaseConnection", update);

    public Task ClearPortalManagementDatabaseConnectionAsync() =>
        ClearDatabaseConnectionAsync("PortalManagementDatabaseConnection", "Settings > Database management");

    private async Task<(string? ProviderLabel, string? ConnectionString)> GetDatabaseConnectionAsync(string storageKey)
    {
        var root = await ReadRootAsync();
        var entry = root[storageKey] as JObject;

        var stored = Unprotect(entry?["ConnectionString"]?.ToString());

        // Normalized here too, not just on save - a value saved before
        // NormalizeConnectionString existed (or by any future caller that
        // forgets to) still self-heals on every read instead of silently
        // failing to connect forever.
        var connectionString = string.IsNullOrWhiteSpace(stored) ? stored : NormalizeConnectionString(stored);

        return (entry?["ProviderLabel"]?.ToString(), connectionString);
    }

    // Blank ConnectionString keeps whatever was already saved - see
    // SaveUserPaasCredentialsAsync's identical convention.
    private async Task SaveDatabaseConnectionAsync(string storageKey, PortalDatabaseConnectionUpdateDto update)
    {
        var root = await ReadRootAsync();
        var entry = root[storageKey] as JObject ?? new JObject();

        if (!string.IsNullOrWhiteSpace(update.ProviderLabel))
            entry["ProviderLabel"] = update.ProviderLabel.Trim();

        if (!string.IsNullOrWhiteSpace(update.ConnectionString))
            entry["ConnectionString"] = Protect(NormalizeConnectionString(update.ConnectionString.Trim()));

        root[storageKey] = entry;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Database connection saved ({storageKey}).");
    }

    private async Task ClearDatabaseConnectionAsync(string storageKey, string ownerLabel)
    {
        var root = await ReadRootAsync();

        if (root[storageKey] != null)
        {
            root.Remove(storageKey);
            await WriteRootAsync(root);

            _log.LogInfo("Settings", $"Database connection cleared ({ownerLabel}).");
        }
    }

    private static readonly Regex EmbeddedPostgresUriRegex =
        new(@"postgres(?:ql)?://\S+", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));

    // Render (and most managed Postgres providers - Supabase, Neon, Heroku)
    // hand out connections as a "postgres://user:pass@host:port/dbname" URI,
    // the same shape DATABASE_URL itself always arrives in - see
    // BuildConnectionString above, reused here so a pasted string or one
    // fetched from Render's own API (see HostingObservabilityController.
    // ConnectRenderDatabase/SaveDatabaseConnectionFields) gets the identical
    // treatment rather than being handed to Npgsql as a raw URI, which it
    // doesn't understand and fails to even parse (never mind negotiate
    // SSL). Also tolerates a quoted URI or one embedded in a larger pasted
    // command (e.g. someone pasting Render's own "psql ... 'postgresql://
    // ...'" command line instead of just the URL field) by extracting the
    // URI substring first. Left as-is if it's already in Npgsql's own
    // "Host=...;Username=...;..." keyword format (e.g. built from
    // individual fields - see SaveDatabaseConnectionFields, which never
    // routes through here with a URI in the first place).
    private static string NormalizeConnectionString(string raw)
    {
        var trimmed = raw.Trim().Trim('"', '\'');

        if (trimmed.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
            trimmed.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
            return BuildConnectionString(trimmed);

        var embedded = EmbeddedPostgresUriRegex.Match(trimmed);

        return embedded.Success
            ? BuildConnectionString(embedded.Value.Trim('"', '\''))
            : trimmed;
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

    // SonarQube and SonarCloud credentials for the Code Quality page's two
    // sidebar sub-pages — session-scoped: each visitor connects their own,
    // isolated from every other visitor of the portal (previously portal-
    // wide/shared; converted per explicit user request that no visitor's
    // connected credential should be shared with or visible to any other
    // visitor). Two independent, separately-storable credentials per
    // provider (a single Host URL used to have to point at either one) so a
    // team using self-hosted SonarQube AND SonarCloud simultaneously isn't
    // limited to one or the other. provider is "sonarqube" or "sonarcloud",
    // key is the caller's own session. Storage:
    // root["UserSonarCredentials"][provider][key] =
    // { HostUrl, Organization, ProjectKey, Token }. SonarCloud has no
    // user-editable Host URL (always sonarcloud.io, forced server-side
    // below) since that's the one thing that's genuinely fixed about it,
    // unlike self-hosted SonarQube which requires one with no sensible
    // default. The token is never sent to the frontend; SonarController
    // uses it server-side to call Sonar's own Web API, the same pattern
    // GitHub credentials already follow.
    public async Task SaveUserSonarCredentialsAsync(string provider, string key, SonarSettingsUpdateDto update)
    {
        var root = await ReadRootAsync();
        var providers = root["UserSonarCredentials"] as JObject ?? new JObject();
        var users = providers[provider] as JObject ?? new JObject();
        var sonar = users[key] as JObject ?? new JObject();

        sonar["HostUrl"] = provider == "sonarcloud"
            ? "https://sonarcloud.io"
            : (string.IsNullOrWhiteSpace(update.HostUrl) ? sonar["HostUrl"]?.ToString() ?? string.Empty : update.HostUrl.TrimEnd('/'));

        if (!string.IsNullOrWhiteSpace(update.Organization))
            sonar["Organization"] = update.Organization;

        if (!string.IsNullOrWhiteSpace(update.ProjectKey))
            sonar["ProjectKey"] = update.ProjectKey;

        if (!string.IsNullOrWhiteSpace(update.Token))
            sonar["Token"] = Protect(update.Token);

        users[key] = sonar;
        providers[provider] = users;
        root["UserSonarCredentials"] = providers;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"{provider} settings saved for a session: {sonar["Organization"]}/{sonar["ProjectKey"]}"
            + (string.IsNullOrWhiteSpace(update.Token) ? "" : " (token updated)"));
    }

    public async Task<SonarCredentials> GetUserSonarCredentialsAsync(string provider, string key)
    {
        var root = await ReadRootAsync();
        var sonar = ((root["UserSonarCredentials"] as JObject)?[provider] as JObject)?[key] as JObject;

        return new SonarCredentials(
            sonar?["HostUrl"]?.ToString() is string h && !string.IsNullOrWhiteSpace(h)
                ? h
                : (provider == "sonarcloud" ? "https://sonarcloud.io" : string.Empty),
            sonar?["Organization"]?.ToString() ?? string.Empty,
            sonar?["ProjectKey"]?.ToString() ?? string.Empty,
            Unprotect(sonar?["Token"]?.ToString()));
    }

    public async Task ClearUserSonarCredentialsAsync(string provider, string key)
    {
        var root = await ReadRootAsync();

        if (root["UserSonarCredentials"] is JObject providers
            && providers[provider] is JObject users
            && users[key] != null)
        {
            users.Remove(key);
            await WriteRootAsync(root);

            _log.LogInfo("Settings", $"{provider} settings cleared for a session.");
        }
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

    // Login-notification email (Resend) - same portal-wide, admin-only
    // model as AI Assistant above. The saved view (BuildView) never echoes
    // the key back, only NotificationsApiKeyConfigured/FromEmail/FromName.
    public async Task<SettingsViewDto> SaveNotificationSettingsAsync(NotificationSettingsUpdateDto update)
    {
        var root = await ReadRootAsync();
        var notifications = root["Notifications"] as JObject ?? new JObject();

        notifications["FromEmail"] = (update.FromEmail ?? string.Empty).Trim();
        notifications["FromName"] = (update.FromName ?? string.Empty).Trim();

        if (!string.IsNullOrWhiteSpace(update.ApiKey))
            notifications["ResendApiKey"] = Protect(update.ApiKey.Trim());

        root["Notifications"] = notifications;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Notification settings saved (from: {update.FromEmail})"
            + (string.IsNullOrWhiteSpace(update.ApiKey) ? "" : ", API key updated"));

        return BuildView(root);
    }

    public async Task<NotificationCredentials> GetNotificationCredentialsAsync()
    {
        var root = await ReadRootAsync();
        var notifications = root["Notifications"] as JObject;

        return new NotificationCredentials(
            Unprotect(notifications?["ResendApiKey"]?.ToString()),
            notifications?["FromEmail"]?.ToString() ?? string.Empty,
            notifications?["FromName"]?.ToString() ?? string.Empty);
    }

    // ==================== Users (real accounts) ====================
    // Replaces the old PAT-login model, where "logged in" just meant a
    // GitHub PAT was saved against an anonymous PortalIdentity session key.
    // Stored as root["Users"][id], same one-blob pattern as every other
    // section - see PortalUserAccount's own comment for the Id scheme
    // (raw GitHub username / "google:"+sub / "usr_"+random hex) and why it's
    // deliberately opaque rather than a uniform GUID.
    //
    // Password hashes are one-way (never decrypted), unlike every other
    // secret in this file - they're Protect()'d anyway before storage as
    // defense in depth (consistent with "when in doubt, protect it"), even
    // though a leaked hash alone is already useless without also breaking
    // PBKDF2 itself.
    private async Task<(JObject Users, bool Seeded)> GetOrCreateUsersSectionAsync(JObject root)
    {
        var users = root["Users"] as JObject;

        if (users != null)
            return (users, false);

        users = new JObject();
        root["Users"] = users;

        // One-time seed, only when this instance has never had ANY account
        // created yet - mirrors how an empty admin allowlist means
        // "bootstrap mode" elsewhere in this file. Without this, a fresh
        // deploy would have no way to reach Database Management (super-
        // admin-gated) at all, since nothing could ever satisfy that gate.
        const string seedEmail = "v.varshith.2004@gmail.com";
        const string seedId = "usr_seed_super_admin";

        var seedEntry = new JObject
        {
            ["Email"] = seedEmail,
            ["PasswordHash"] = Protect(_passwordHasher.HashPassword(new PortalUserAccount { Id = seedId }, "Dp@123")),
            ["DisplayName"] = "Varshith Chand",
            ["Provider"] = "password",
            ["CreatedAtUtc"] = DateTime.UtcNow
        };

        users[seedId] = seedEntry;

        var auth = root["Auth"] as JObject ?? new JObject();

        var adminEmails = (auth["AdminEmails"] as JArray) ?? new JArray();

        if (!adminEmails.Any(e => string.Equals(e.ToString(), seedEmail, StringComparison.OrdinalIgnoreCase)))
            adminEmails.Add(seedEmail);

        auth["AdminEmails"] = adminEmails;

        if (string.IsNullOrWhiteSpace(auth["SuperAdminEmail"]?.ToString()))
            auth["SuperAdminEmail"] = seedEmail;

        root["Auth"] = auth;

        _log.LogInfo("Settings", $"Seeded the initial super-admin account ({seedEmail}) - change its password after first login.");

        return (users, true);
    }

    public async Task<PortalUserAccount?> FindUserByEmailAsync(string email)
    {
        var root = await ReadRootAsync();
        var (users, seeded) = await GetOrCreateUsersSectionAsync(root);

        if (seeded)
            await WriteRootAsync(root);

        var match = users.Properties()
            .FirstOrDefault(p => string.Equals(
                (p.Value as JObject)?["Email"]?.ToString(), email, StringComparison.OrdinalIgnoreCase));

        return match == null ? null : ParseUser(match.Name, (JObject)match.Value!);
    }

    public async Task<PortalUserAccount?> GetUserByIdAsync(string id)
    {
        var root = await ReadRootAsync();
        var (users, seeded) = await GetOrCreateUsersSectionAsync(root);

        if (seeded)
            await WriteRootAsync(root);

        return users[id] is JObject entry ? ParseUser(id, entry) : null;
    }

    // plaintextPassword is null for a Google/GitHub-only account (nothing to
    // hash - LinkedGoogleSub/LinkedGitHubLogin is what lets them sign in).
    public async Task<PortalUserAccount> CreateUserAsync(string id, string email, string? plaintextPassword, string provider, string? displayName = null)
    {
        var root = await ReadRootAsync();
        var (users, _) = await GetOrCreateUsersSectionAsync(root);

        var entry = new JObject
        {
            ["Email"] = email.Trim().ToLowerInvariant(),
            ["PasswordHash"] = plaintextPassword == null
                ? null
                : Protect(_passwordHasher.HashPassword(new PortalUserAccount { Id = id }, plaintextPassword)),
            ["DisplayName"] = displayName,
            ["Provider"] = provider,
            ["CreatedAtUtc"] = DateTime.UtcNow
        };

        users[id] = entry;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Account created ({provider}): {MaskKey(email)}.");

        return ParseUser(id, entry)!;
    }

    public async Task UpdateUserLastLoginAsync(string id)
    {
        var root = await ReadRootAsync();
        var (users, _) = await GetOrCreateUsersSectionAsync(root);

        if (users[id] is JObject entry)
        {
            entry["LastLoginAtUtc"] = DateTime.UtcNow;
            await WriteRootAsync(root);
        }
    }

    // Called after a successful Google/GitHub OAuth exchange for an email
    // that already has a password (or other-provider) account - links
    // rather than creating a duplicate, so the same person reaches the same
    // account/MFA enrollment/re-keyed data regardless of which of the 3
    // methods they used this time. See AccountAuthService.
    public async Task LinkProviderAsync(string id, string? gitHubLogin, string? googleSub)
    {
        var root = await ReadRootAsync();
        var (users, _) = await GetOrCreateUsersSectionAsync(root);

        if (users[id] is not JObject entry)
            return;

        if (gitHubLogin != null)
            entry["LinkedGitHubLogin"] = gitHubLogin;

        if (googleSub != null)
            entry["LinkedGoogleSub"] = googleSub;

        await WriteRootAsync(root);
    }

    // Verifies a plaintext password against the stored hash for that user -
    // AccountAuthService never sees the hash itself or touches
    // IPasswordHasher directly, matching how every other secret's crypto
    // (Protect/Unprotect) stays inside this file. Null user or no password
    // set (a Google/GitHub-only account) both correctly fail verification
    // rather than throwing.
    public async Task<bool> VerifyUserPasswordAsync(string id, string plaintextPassword)
    {
        var root = await ReadRootAsync();
        var (users, seeded) = await GetOrCreateUsersSectionAsync(root);

        if (seeded)
            await WriteRootAsync(root);

        var storedHash = Unprotect((users[id] as JObject)?["PasswordHash"]?.ToString());

        if (string.IsNullOrEmpty(storedHash))
            return false;

        var result = _passwordHasher.VerifyHashedPassword(new PortalUserAccount { Id = id }, storedHash, plaintextPassword);

        return result is PasswordVerificationResult.Success or PasswordVerificationResult.SuccessRehashNeeded;
    }

    private static PortalUserAccount? ParseUser(string id, JObject entry) => new()
    {
        Id = id,
        Email = entry["Email"]?.ToString() ?? string.Empty,
        DisplayName = entry["DisplayName"]?.ToString(),
        LinkedGitHubLogin = entry["LinkedGitHubLogin"]?.ToString(),
        LinkedGoogleSub = entry["LinkedGoogleSub"]?.ToString(),
        Provider = entry["Provider"]?.ToString() ?? "password",
        CreatedAtUtc = entry["CreatedAtUtc"]?.Value<DateTime>() ?? DateTime.UtcNow,
        LastLoginAtUtc = entry["LastLoginAtUtc"]?.Value<DateTime>()
    };

    // Same shape as SaveAdminUsernamesAsync, just the email-based lists -
    // deliberately a SEPARATE method (not merged into that one's DTO) so
    // saving the GitHub-username allowlist can never accidentally wipe the
    // email allowlist, or vice versa.
    public async Task<SettingsViewDto> SaveAdminEmailsAsync(List<string> adminEmails, List<string> viewerEmails)
    {
        var root = await ReadRootAsync();
        var auth = root["Auth"] as JObject ?? new JObject();

        auth["AdminEmails"] = new JArray(adminEmails.Select(e => e.Trim().ToLowerInvariant()));
        auth["ViewerEmails"] = new JArray(viewerEmails.Select(e => e.Trim().ToLowerInvariant()));

        root["Auth"] = auth;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Email allowlist saved: {adminEmails.Count} admin(s), {viewerEmails.Count} viewer(s).");

        return BuildView(root);
    }

    public async Task<SettingsViewDto> SetSuperAdminEmailAsync(string email)
    {
        var root = await ReadRootAsync();
        var auth = root["Auth"] as JObject ?? new JObject();

        auth["SuperAdminEmail"] = email.Trim().ToLowerInvariant();
        root["Auth"] = auth;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Super-admin email set to {MaskKey(email)}.");

        return BuildView(root);
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

    // Suspends an admin in place - unlike SaveAdminUsernamesAsync removing
    // them from the list outright, this keeps the username on the
    // allowlist (nothing to retype to bring them back) but marks it so
    // AdminGate.IsAdminOrBootstrap stops honoring even an already-issued
    // session's Admin role claim for it. Effective on that session's very
    // next request - no logout, no waiting for a token to expire.
    public async Task<SettingsViewDto> SuspendAdminAsync(string username)
    {
        var root = await ReadRootAsync();
        var auth = root["Auth"] as JObject ?? new JObject();
        var suspended = auth["SuspendedAdminGitHubUsernames"] as JArray ?? new JArray();

        if (!suspended.Any(u => string.Equals(u.ToString(), username, StringComparison.OrdinalIgnoreCase)))
            suspended.Add(username);

        auth["SuspendedAdminGitHubUsernames"] = suspended;
        root["Auth"] = auth;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Admin '{username}' suspended - treated as a normal Viewer until unsuspended.");

        return BuildView(root);
    }

    public async Task<SettingsViewDto> UnsuspendAdminAsync(string username)
    {
        var root = await ReadRootAsync();

        if (root["Auth"] is JObject auth && auth["SuspendedAdminGitHubUsernames"] is JArray suspended)
        {
            auth["SuspendedAdminGitHubUsernames"] = new JArray(
                suspended.Where(u => !string.Equals(u.ToString(), username, StringComparison.OrdinalIgnoreCase)));

            root["Auth"] = auth;
            await WriteRootAsync(root);
        }

        _log.LogInfo("Settings", $"Admin '{username}' unsuspended.");

        return BuildView(root);
    }

    // "Clear" removes only the secret field, leaving non-secret identifiers
    // (Docker Registry/Username, OAuth ClientId) in place — a null
    // SecretField means the whole section IS the thing being cleared.
    // GitHub credentials are per-user now (see ClearUserGitHubTokenAsync)
    // and aren't part of this shared-section mechanism at all.
    // Sonar is deliberately NOT here - SonarQube/SonarCloud each have their
    // own dedicated Clear route now (SonarController.Clear), same as every
    // other provider-keyed credential split out this way (Docker Hub/GHCR/
    // Harbor/Nexus above) - this generic section-clear mechanism only
    // still fits credentials with exactly one value, which Sonar hasn't
    // been since the split.
    private static readonly Dictionary<string, (string SectionKey, string? SecretField)> SectionInfo = new()
    {
        ["docker"] = ("Docker", "Password"),
        ["github-oauth"] = ("GitHubOAuth", "ClientSecret"),
        ["admins"] = ("Auth", null),
        ["ai"] = ("AiAssistant", "GeminiApiKey"),
        ["notifications"] = ("Notifications", "ResendApiKey")
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
    // does, PLUS every shared, portal-wide section (Docker, GitHubOAuth) -
    // resetting the whole portal back to unconfigured, first-run state for
    // everyone, not just the caller. Admin-gated at the controller because
    // those sections affect every visitor, not just whoever clicked the
    // button. "Auth" (the admin allowlist) is deliberately the one
    // exception even here: wiping it used to drop the whole portal into
    // bootstrap mode (anyone is Admin until it's reconfigured) as a side
    // effect of a reset button - a much bigger blast radius than intended.
    // Jwt is deliberately left alone too, so existing sessions/cookies stay
    // valid. Sonar is deliberately NOT here anymore - it's session-scoped
    // now (see SaveUserSonarCredentialsAsync), same as every other
    // per-session credential this generic portal-wide reset never touches.
    public async Task<SettingsViewDto> ClearAllAsync(string callerKey)
    {
        var root = await ReadRootAsync();

        root.Remove("Docker");
        root.Remove("GitHubOAuth");
        root.Remove("AiAssistant");
        root.Remove("Notifications");

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

    // The reverse lookup of IsGrantedPageAdminAsync - every page THIS login
    // has scoped admin access to, not just whether one specific page does.
    // Used by BootstrapController to tell the frontend which admin-only
    // tabs (see Sidebar.jsx's ADMIN_ONLY_TABS) a page-scoped (not full-
    // admin) grantee should still be allowed to reach - without this, the
    // backend's own pageKey-aware AdminGate checks were correct but
    // unreachable, since the frontend had no way to know a grant existed
    // and bounced the grantee away before any API call was ever made.
    public async Task<List<string>> GetGrantedPagesForLoginAsync(string? login)
    {
        if (string.IsNullOrWhiteSpace(login))
            return new List<string>();

        var all = await GetPageAdminGrantsAsync();

        return all
            .Where(kv => kv.Value.Any(u => string.Equals(u, login, StringComparison.OrdinalIgnoreCase)))
            .Select(kv => kv.Key)
            .ToList();
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

    // Settings > Security Testing Lab's authorized-target allowlist -
    // server-side enforcement of "only scan what you've explicitly said
    // you're allowed to test" (see SecurityTestingController.Scan's
    // IsSecurityTestingTargetAuthorizedAsync check), not just a frontend
    // list. Same JSONB-blob-in-root-object pattern as ExternalHealth above.
    private const int MaxSecurityTestingTargets = 200;

    public async Task<List<SecurityTestingTargetDto>> GetSecurityTestingTargetsAsync()
    {
        var root = await ReadRootAsync();
        var targets = root["SecurityTestingTargets"] as JArray;

        if (targets == null)
            return new List<SecurityTestingTargetDto>();

        return targets
            .OfType<JObject>()
            .Select(t => new SecurityTestingTargetDto
            {
                Id = t["Id"]?.ToString() ?? string.Empty,
                Url = t["Url"]?.ToString() ?? string.Empty,
                AddedAtUtc = t["AddedAtUtc"]?.Value<DateTime>() ?? DateTime.MinValue
            })
            .OrderByDescending(t => t.AddedAtUtc)
            .ToList();
    }

    // Idempotent by URL (case-sensitive exact match) - the frontend's bulk
    // "Add All" actions (Application Pages / Backend API Endpoints) call
    // this once per discovered page/route, and re-running that after some
    // are already authorized shouldn't pile up duplicate entries toward
    // MaxSecurityTestingTargets for the same URL.
    public async Task<SecurityTestingTargetDto> AddSecurityTestingTargetAsync(string url)
    {
        var root = await ReadRootAsync();
        var targets = root["SecurityTestingTargets"] as JArray ?? new JArray();

        var existing = targets.OfType<JObject>().FirstOrDefault(t => t["Url"]?.ToString() == url);

        if (existing != null)
        {
            return new SecurityTestingTargetDto
            {
                Id = existing["Id"]?.ToString() ?? string.Empty,
                Url = url,
                AddedAtUtc = existing["AddedAtUtc"]?.Value<DateTime>() ?? DateTime.UtcNow
            };
        }

        var entry = new SecurityTestingTargetDto
        {
            Id = Guid.NewGuid().ToString("N"),
            Url = url,
            AddedAtUtc = DateTime.UtcNow
        };

        targets.Add(JObject.FromObject(entry));

        while (targets.Count > MaxSecurityTestingTargets)
            targets.RemoveAt(0);

        root["SecurityTestingTargets"] = targets;
        await WriteRootAsync(root);

        _log.LogInfo("SecurityTesting", $"Authorized target added: {url}");

        return entry;
    }

    public async Task RemoveSecurityTestingTargetAsync(string id)
    {
        var root = await ReadRootAsync();
        var targets = root["SecurityTestingTargets"] as JArray;

        var match = targets?.OfType<JObject>().FirstOrDefault(t => t["Id"]?.ToString() == id);

        if (match == null)
            return;

        var url = match["Url"]?.ToString() ?? string.Empty;
        targets!.Remove(match);

        root["SecurityTestingTargets"] = targets;
        await WriteRootAsync(root);

        _log.LogInfo("SecurityTesting", $"Authorized target removed: {url}");
    }

    // Exact-origin match (scheme + host + port) - a target authorized as
    // "https://example.com" does NOT implicitly authorize
    // "https://example.com:8443" or "http://example.com", since either
    // could be a genuinely different, unauthorized service. Case-
    // insensitive on the host only (DNS names aren't case-sensitive);
    // scheme/port comparison is exact.
    public async Task<bool> IsSecurityTestingTargetAuthorizedAsync(Uri target)
    {
        var targets = await GetSecurityTestingTargetsAsync();

        return targets.Any(t =>
            Uri.TryCreate(t.Url, UriKind.Absolute, out var authorized)
            && string.Equals(authorized.Scheme, target.Scheme, StringComparison.OrdinalIgnoreCase)
            && string.Equals(authorized.Host, target.Host, StringComparison.OrdinalIgnoreCase)
            && authorized.Port == target.Port);
    }

    // Scan history - capped like every other unbounded admin-facing list
    // in this app (ActivityLogService's 200-entry cap is the in-memory
    // equivalent; this one's durable, so it's capped the same way on
    // write instead of relying on process lifetime). Never holds a raw
    // response body or header dump - see SecurityScanResultDto's own
    // comment for why there's nothing here to redact retroactively.
    private const int MaxSecurityTestingScans = 100;

    public async Task<List<SecurityScanHistoryEntryDto>> GetSecurityTestingScansAsync()
    {
        var root = await ReadRootAsync();
        var scans = root["SecurityTestingScans"] as JArray;

        if (scans == null)
            return new List<SecurityScanHistoryEntryDto>();

        return scans
            .OfType<JObject>()
            .Select(s => s.ToObject<SecurityScanResultDto>())
            .Where(s => s != null)
            .Select(s => new SecurityScanHistoryEntryDto
            {
                Id = s!.Id,
                Target = s.Target,
                StartedAtUtc = s.StartedAtUtc,
                DurationMs = s.DurationMs,
                ActiveMode = s.ActiveMode,
                SecurityScore = s.SecurityScore,
                PerformanceScore = s.PerformanceScore,
                Summary = s.Summary,
                Error = s.Error
            })
            .OrderByDescending(s => s.StartedAtUtc)
            .ToList();
    }

    public async Task<SecurityScanResultDto?> GetSecurityTestingScanAsync(string id)
    {
        var root = await ReadRootAsync();
        var scans = root["SecurityTestingScans"] as JArray;

        return scans?.OfType<JObject>()
            .FirstOrDefault(s => s["Id"]?.ToString() == id)
            ?.ToObject<SecurityScanResultDto>();
    }

    public async Task SaveSecurityTestingScanAsync(SecurityScanResultDto scan)
    {
        var root = await ReadRootAsync();
        var scans = root["SecurityTestingScans"] as JArray ?? new JArray();

        scans.Add(JObject.FromObject(scan));

        while (scans.Count > MaxSecurityTestingScans)
            scans.RemoveAt(0);

        root["SecurityTestingScans"] = scans;
        await WriteRootAsync(root);
    }

    public async Task DeleteSecurityTestingScanAsync(string id)
    {
        var root = await ReadRootAsync();
        var scans = root["SecurityTestingScans"] as JArray;

        var match = scans?.OfType<JObject>().FirstOrDefault(s => s["Id"]?.ToString() == id);

        if (match == null)
            return;

        scans!.Remove(match);
        root["SecurityTestingScans"] = scans;
        await WriteRootAsync(root);
    }

    // The list backing Settings > Services > Users (and the Sidebar Access
    // picker) - one row per real logged-in account (see PortalUserAccount/
    // AccountAuthService), not per connected GitHub PAT. Login is real
    // accounts now (email/password, Google, or GitHub OAuth), so identity
    // is already known - labeled by the account's own email/display name,
    // no live GitHub lookup needed (that was only ever a proxy for
    // identity back when a PAT WAS the login). A connected GitHub PAT
    // (UserGitHubCredentials, keyed by this same account id) is still
    // shown as supplementary Owner/Repository info when present, since
    // that's still useful context for an admin, just no longer how the
    // row is identified.
    public async Task<List<PatUserSummaryDto>> GetPatUsersAsync()
    {
        var root = await ReadRootAsync();
        var accounts = root["Users"] as JObject;
        var gitHubCreds = root["UserGitHubCredentials"] as JObject;
        var access = root["SidebarAccess"] as JObject;
        var blocked = root["BlockedPatUsers"] as JArray;

        if (accounts == null)
            return new List<PatUserSummaryDto>();

        var entries = accounts.Properties().ToList();

        var mfaEnabledFlags = await Task.WhenAll(
            entries.Select(p => IsMfaEnabledAsync(p.Name)));

        var mfaRequiredFlags = await Task.WhenAll(
            entries.Select(p => IsMfaRequiredByAdminAsync(p.Name)));

        return entries.Select((p, i) =>
        {
            var account = (JObject)p.Value!;
            var email = account["Email"]?.ToString();
            var displayName = account["DisplayName"]?.ToString();

            var gitHubEntry = gitHubCreds?[p.Name] as JObject;
            var ownerValue = gitHubEntry?["Owner"]?.ToString();
            var repositoryValue = gitHubEntry?["Repository"]?.ToString();

            var restrictionCount = (access?[p.Name] as JObject)?.Properties().Count() ?? 0;

            return new PatUserSummaryDto
            {
                Key = p.Name,
                PatOwnerLogin = !string.IsNullOrWhiteSpace(email)
                    ? email
                    : (!string.IsNullOrWhiteSpace(displayName) ? displayName : p.Name),
                Owner = ownerValue ?? string.Empty,
                Repository = repositoryValue ?? string.Empty,
                RestrictedTabCount = restrictionCount,
                IsBlocked = blocked?.Any(k => k.ToString() == p.Name) ?? false,
                IsSignedOut = gitHubEntry?["SignedOut"]?.Value<bool>() ?? false,
                IsMfaEnabled = mfaEnabledFlags[i],
                IsMfaRequired = mfaRequiredFlags[i]
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

        // Same source GetPatUsersAsync lists rows from - every real
        // account, not just ones with a connected GitHub PAT. Searching
        // UserGitHubCredentials here (as this used to, back when that WAS
        // the user list) meant every action button for an account with no
        // connected PAT could never resolve its own row id back to a real
        // key - it isn't in that section at all.
        var users = root["Users"] as JObject;

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

    //===========================================================
    // TOTP MFA (Google Authenticator) — keyed by the resolved real GitHub
    // login (see ResolvePatOwnerLoginAsync below), not the PortalIdentity
    // session key, so it follows the person across browsers/devices the
    // same way Round 14's cross-session credential migration does - both
    // resolve identity through the exact same live GitHub call. This
    // service only ever does pure enrollment/verification; rate-limiting
    // and lockout orchestration live in the controller alongside
    // SessionActivityService, matching VerifyMyPin's existing split
    // rather than inventing a new pattern.
    //===========================================================

    private const int TotpDigits = 6;
    private const int TotpStepSeconds = 30;

    // Public wrappers around Protect/Unprotect above - AuthController's
    // two-page login flow needs to hold a PAT encrypted in
    // SessionActivityService's short-lived in-memory pending-session
    // store (see SetPendingPatSession) between the PAT-login and MFA-
    // verify requests, using the exact same protection every other
    // stored secret in this app already gets, not a separate scheme.
    public string ProtectValue(string value) => Protect(value)!;

    public string UnprotectValue(string value) => Unprotect(value)!;

    // Public wrapper around the private ResolvePatOwnerLoginAsync below -
    // MfaGate needs to resolve a not-yet-saved token's real owner the
    // exact same way SaveUserGitHubCredentialsAsync's own duplicate-
    // session check already does, without duplicating that logic or
    // widening the private method's own access.
    public Task<string?> ResolveGitHubLoginAsync(string token) => ResolvePatOwnerLoginAsync(token);

    public async Task<bool> IsMfaEnabledAsync(string login)
    {
        var root = await ReadRootAsync();
        var entry = (root["Mfa"] as JObject)?[login] as JObject;

        return entry?["Enabled"]?.Value<bool>() ?? false;
    }

    // Whether a super-admin has flagged this login as required to set up
    // MFA (see SetMfaRequiredAsync) - independent of whether they've
    // enrolled yet. Feeds BootstrapController's MfaNudge.Mandatory
    // alongside the existing "this session has a cloud credential saved"
    // trigger from Round 18 - this is the second, admin-initiated way a
    // nudge can become mandatory rather than just a friendly suggestion.
    public async Task<bool> IsMfaRequiredByAdminAsync(string login)
    {
        var root = await ReadRootAsync();
        var entry = (root["Mfa"] as JObject)?[login] as JObject;

        return entry?["AdminRequired"]?.Value<bool>() ?? false;
    }

    // Super-admin action (see AdminUsersController's mfa/require and
    // mfa/unrequire actions) - flips the AdminRequired flag without
    // touching anything else about this login's MFA state. Creates a
    // bare, not-yet-enrolled Mfa[login] entry if none exists at all yet
    // (Enabled stays false - flagging someone as required doesn't enroll
    // them, only a nudge/block plus their own QR scan can do that; see
    // MfaEnforcementGate). Un-requiring never disables an already-enabled
    // account - it only stops the nudge from being mandatory going
    // forward for someone who hasn't enrolled.
    public async Task SetMfaRequiredAsync(string login, bool required)
    {
        var root = await ReadRootAsync();
        var mfa = root["Mfa"] as JObject ?? new JObject();
        var entry = mfa[login] as JObject;

        if (entry == null)
        {
            if (!required) return;

            entry = new JObject
            {
                ["Enabled"] = false,
                ["CreatedAtUtc"] = DateTime.UtcNow,
                ["RecoveryCodes"] = new JArray()
            };

            mfa[login] = entry;
        }

        entry["AdminRequired"] = required;
        entry["UpdatedAtUtc"] = DateTime.UtcNow;

        root["Mfa"] = mfa;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"MFA {(required ? "required" : "no longer required")} by admin for '{login}'.");
    }

    // Step 1 of enrollment - generates and stores a new secret with
    // Enabled left false, so an abandoned enrollment (closed the tab
    // before scanning the QR) never actually protects the account; only
    // VerifyMfaEnrollmentAsync flips it on. Safely overwrites any earlier
    // unverified pending secret for this login - starting over is fine as
    // long as Enabled was never true. Preserves AdminRequired across the
    // overwrite (SetMfaRequiredAsync above may have set it on a bare,
    // not-yet-enrolled entry before this ever runs) - losing it here
    // would silently un-require someone the moment they started enrolling.
    public async Task<(string Secret, string OtpAuthUri)> EnrollMfaAsync(string login)
    {
        var secret = GenerateTotpSecret();
        var now = DateTime.UtcNow;

        var root = await ReadRootAsync();
        var mfa = root["Mfa"] as JObject ?? new JObject();
        var previous = mfa[login] as JObject;
        var wasAdminRequired = previous?["AdminRequired"]?.Value<bool>() ?? false;
        var previousNotificationEmail = previous?["NotificationEmail"]?.ToString();

        mfa[login] = new JObject
        {
            ["SecretEncrypted"] = Protect(secret),
            ["Enabled"] = false,
            ["CreatedAtUtc"] = now,
            ["UpdatedAtUtc"] = now,
            ["LastVerifiedAtUtc"] = null,
            ["RecoveryCodes"] = new JArray(),
            ["AdminRequired"] = wasAdminRequired,
            // Preserved the same reason AdminRequired is - a re-enroll
            // (e.g. after Disable) shouldn't silently make someone
            // re-enter an email they already registered.
            ["NotificationEmail"] = previousNotificationEmail
        };

        root["Mfa"] = mfa;
        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"MFA enrollment started for '{login}'.");

        return (secret, BuildOtpAuthUri(login, secret));
    }

    // Step 2 - the first real code from the authenticator app. Only this
    // call ever turns Enabled on. Deliberately does NOT generate any
    // recovery codes (RecoveryCodes stays the empty array EnrollMfaAsync
    // already set) - per this round's policy, a user is never shown a
    // recovery code at all; only GenerateAdminRecoveryCodeAsync below
    // (super-admin-only, issued on demand when someone's actually locked
    // out) ever adds one. Returns false on a wrong code (nothing changes)
    // so the controller can tell "enrollment not finished" apart from
    // "enrollment finished."
    public async Task<bool> VerifyMfaEnrollmentAsync(string login, string code)
    {
        var root = await ReadRootAsync();
        var entry = (root["Mfa"] as JObject)?[login] as JObject;
        var secret = Unprotect(entry?["SecretEncrypted"]?.ToString());

        if (secret == null || !VerifyTotp(secret, code))
            return false;

        var now = DateTime.UtcNow;

        entry!["Enabled"] = true;
        entry["UpdatedAtUtc"] = now;
        entry["LastVerifiedAtUtc"] = now;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"MFA enabled for '{login}'.");

        return true;
    }

    // Super-admin-only escape hatch (see AdminUsersController's
    // mfa/recovery-code action) - the ONLY way a recovery code ever gets
    // created now that self-enrollment no longer generates any (see
    // VerifyMfaEnrollmentAsync above). Returns null when MFA isn't even
    // enabled for this login - there's no enrollment to reset INTO, the
    // user has to self-enroll first via the QR flow same as anyone else.
    // Appends to whatever codes already exist rather than replacing them,
    // so an earlier still-unused admin-issued code doesn't get silently
    // invalidated by issuing a new one.
    public async Task<string?> GenerateAdminRecoveryCodeAsync(string login)
    {
        var root = await ReadRootAsync();
        var entry = (root["Mfa"] as JObject)?[login] as JObject;

        if (entry?["Enabled"]?.Value<bool>() != true)
            return null;

        var code = GenerateRecoveryCode();
        var codes = entry["RecoveryCodes"] as JArray ?? new JArray();

        codes.Add(new JObject
        {
            ["HashHex"] = HashRecoveryCode(code),
            ["UsedAtUtc"] = null
        });

        entry["RecoveryCodes"] = codes;
        entry["UpdatedAtUtc"] = DateTime.UtcNow;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Admin-issued MFA recovery code generated for '{login}'.");

        return code;
    }

    // Self-service disable - the caller already proved a valid code (see
    // VerifyMfaCodeAsync/VerifyMfaRecoveryCodeAsync) before this is ever
    // reached, same "re-prove it before turning off a security feature"
    // requirement as everything else in this file. A full removal, not
    // just Enabled=false, so a stale secret/recovery codes can never
    // linger for some future re-enrollment to accidentally trust.
    public async Task DisableMfaAsync(string login)
    {
        var root = await ReadRootAsync();

        if (root["Mfa"] is not JObject mfa || mfa[login] is not JObject existing)
            return;

        // A full removal would also silently wipe AdminRequired - letting
        // whoever disables (the user themselves, or an admin's reset-mfa)
        // quietly escape a super-admin's requirement. If it was set,
        // replace the entry with the same bare "not enrolled, still
        // required" shape SetMfaRequiredAsync creates instead of removing
        // it outright - the next bootstrap call picks this straight back
        // up as mandatory, same as if they'd never enrolled at all.
        var wasAdminRequired = existing["AdminRequired"]?.Value<bool>() ?? false;

        if (wasAdminRequired)
        {
            mfa[login] = new JObject
            {
                ["Enabled"] = false,
                ["CreatedAtUtc"] = DateTime.UtcNow,
                ["RecoveryCodes"] = new JArray(),
                ["AdminRequired"] = true,
                // Preserved here too - this branch already keeps a live
                // entry around (not a full removal), so there's no reason
                // to also make them re-enter their notification email.
                ["NotificationEmail"] = existing["NotificationEmail"]?.ToString()
            };
        }
        else
        {
            mfa.Remove(login);
        }

        await WriteRootAsync(root);
        _log.LogInfo("Settings", $"MFA disabled for '{login}'{(wasAdminRequired ? " (still required by admin - will be re-nudged)" : "")}.");
    }

    // Admin-triggered equivalent of DisableMfaAsync (see
    // AdminUsersController's reset-mfa action) - same full removal, just
    // reached without the user's own code, since the entire point is
    // recovering an account whose authenticator device is unavailable.
    // The user must re-enroll from scratch afterward - nothing here
    // quietly restores or reuses the old secret.
    public Task ResetMfaForLoginAsync(string login) => DisableMfaAsync(login);

    // Escalating MFA-lockout state (see Helpers/MfaLockoutPolicy.cs) -
    // durable and per-login, in its own top-level dict rather than folded
    // into Mfa[login] itself: this is an abuse-tracking concern, not an
    // enrollment/credential one, the same separation MfaNudgeSkips already
    // draws for the (different) nudge-skip counter.
    public async Task<MfaLockoutStateDto> GetMfaLockoutStateAsync(string login)
    {
        var root = await ReadRootAsync();
        var entry = (root["MfaLockouts"] as JObject)?[login] as JObject;

        if (entry == null)
            return new MfaLockoutStateDto();

        return new MfaLockoutStateDto
        {
            Tier = entry["Tier"]?.Value<int>() ?? 0,
            AttemptsInTier = entry["AttemptsInTier"]?.Value<int>() ?? 0,
            LockedUntilUtc = entry["LockedUntilUtc"]?.Value<DateTime?>()
        };
    }

    public async Task SaveMfaLockoutStateAsync(string login, MfaLockoutStateDto state)
    {
        var root = await ReadRootAsync();
        var lockouts = root["MfaLockouts"] as JObject ?? new JObject();

        lockouts[login] = JObject.FromObject(state);
        root["MfaLockouts"] = lockouts;

        await WriteRootAsync(root);
    }

    // Self-service, opt-in - where MfaLockoutPolicy sends the "too many
    // wrong codes" notice (see NotificationService.SendMfaLockoutEmailAsync).
    // Deliberately part of Mfa[login] rather than its own dict: this is
    // "part of this login's MFA settings" the same way AdminRequired
    // already is, not a separate concept. Not preserved across a full
    // DisableMfaAsync removal (unlike AdminRequired) - a full disable is
    // meant to leave nothing MFA-related lingering, and there's no
    // possible future lockout to notify about until they re-enroll and
    // set it again.
    public async Task<string?> GetMfaNotificationEmailAsync(string login)
    {
        var root = await ReadRootAsync();
        var entry = (root["Mfa"] as JObject)?[login] as JObject;

        return entry?["NotificationEmail"]?.ToString();
    }

    public async Task SetMfaNotificationEmailAsync(string login, string email)
    {
        var root = await ReadRootAsync();
        var mfa = root["Mfa"] as JObject;
        var entry = mfa?[login] as JObject;

        // Only meaningful once MFA is actually enabled for this login -
        // there's no possible lockout to notify about otherwise, and
        // EnrollMfaAsync would just overwrite this on the next enrollment
        // anyway.
        if (entry == null)
            return;

        entry["NotificationEmail"] = email;
        entry["UpdatedAtUtc"] = DateTime.UtcNow;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"MFA lockout notification email updated for '{login}'.");
    }

    public async Task<bool> VerifyMfaCodeAsync(string login, string code)
    {
        var root = await ReadRootAsync();
        var entry = (root["Mfa"] as JObject)?[login] as JObject;
        var secret = Unprotect(entry?["SecretEncrypted"]?.ToString());

        if (secret == null || !VerifyTotp(secret, code))
            return false;

        entry!["LastVerifiedAtUtc"] = DateTime.UtcNow;
        await WriteRootAsync(root);

        return true;
    }

    public async Task<bool> VerifyMfaRecoveryCodeAsync(string login, string code)
    {
        var root = await ReadRootAsync();
        var entry = (root["Mfa"] as JObject)?[login] as JObject;
        var codes = entry?["RecoveryCodes"] as JArray;

        if (codes == null)
        {
            // Distinct from "wrong code" - either this login has no MFA
            // entry at all, or it does but nobody's ever generated a
            // recovery code for it (self-enrollment doesn't create any
            // anymore - see VerifyMfaEnrollmentAsync - only the admin's
            // GenerateAdminRecoveryCodeAsync does). Logged (never the
            // code itself) specifically so a "the admin JUST generated
            // one and it still says invalid" report is actually
            // debuggable via Activity Log instead of a dead end - the
            // user-facing message stays the same generic "Invalid
            // verification code" either way, so this doesn't leak
            // whether an account has MFA/codes configured to whoever's
            // attempting the login.
            _log.LogInfo("Settings", $"Recovery code check for '{login}' failed - no RecoveryCodes exist for this login (entry {(entry == null ? "missing" : "present")}).");
            return false;
        }

        var hash = HashRecoveryCode(code);

        var match = codes.FirstOrDefault(c =>
            string.Equals(c["HashHex"]?.ToString(), hash, StringComparison.OrdinalIgnoreCase)
            && c["UsedAtUtc"] == null);

        if (match == null)
        {
            var unusedCount = codes.Count(c => c["UsedAtUtc"] == null);
            var totalCount = codes.Count;

            _log.LogInfo("Settings", $"Recovery code check for '{login}' failed - no match among {unusedCount} unused of {totalCount} stored code(s). " +
                (unusedCount == 0 && totalCount > 0
                    ? "Every issued code for this login has already been used once - ask the admin to generate a new one."
                    : "The submitted code doesn't match any currently unused code on file for this exact login."));

            return false;
        }

        // Single-use - marked spent immediately, never valid again even
        // if the exact same code is presented a second time.
        match["UsedAtUtc"] = DateTime.UtcNow;
        entry!["LastVerifiedAtUtc"] = DateTime.UtcNow;

        await WriteRootAsync(root);

        _log.LogInfo("Settings", $"Recovery code accepted for '{login}'.");

        return true;
    }

    // How many times THIS SESSION has dismissed the mandatory-MFA nudge
    // (see BootstrapController's MfaNudge block) - keyed by PortalIdentity
    // session key, not login, since it's paired with the AWS/Azure/GCP
    // credential check that decides whether the nudge is even mandatory,
    // and those are session-keyed too (see GetUserAwsCredentialsAsync
    // etc.). Persisted in the same JSONB blob as everything else here
    // (not SessionActivityService's in-memory dictionaries) because this
    // is a real enforcement control, not throwaway UI state - it has to
    // survive a backend restart the same way the PIN/MFA lockouts
    // conceptually should, even though those specific ones don't today.
    public async Task<int> GetMfaNudgeSkipCountAsync(string key)
    {
        var root = await ReadRootAsync();
        return (root["MfaNudgeSkips"] as JObject)?[key]?.Value<int>() ?? 0;
    }

    public async Task<int> IncrementMfaNudgeSkipCountAsync(string key)
    {
        var root = await ReadRootAsync();
        var skips = root["MfaNudgeSkips"] as JObject ?? new JObject();

        var next = (skips[key]?.Value<int>() ?? 0) + 1;
        skips[key] = next;

        root["MfaNudgeSkips"] = skips;
        await WriteRootAsync(root);

        return next;
    }

    private static string GenerateTotpSecret() => Base32Encode(RandomNumberGenerator.GetBytes(20));

    private static string BuildOtpAuthUri(string login, string secret)
    {
        const string issuer = "Deployment Portal";

        var label = Uri.EscapeDataString($"{issuer}:{login}");
        var encodedIssuer = Uri.EscapeDataString(issuer);

        return $"otpauth://totp/{label}?secret={secret}&issuer={encodedIssuer}&algorithm=SHA1&digits={TotpDigits}&period={TotpStepSeconds}";
    }

    // RFC 6238 over HMAC-SHA1 (RFC 4226's HOTP, time-stepped) - the exact
    // algorithm Google Authenticator (and every other standard TOTP app)
    // implements, so there's no app-specific quirk to work around. +/-1
    // step (30s window either side) tolerates ordinary clock drift
    // between this server and whatever device generated the code, the
    // same tolerance most TOTP implementations use.
    private static bool VerifyTotp(string base32Secret, string code)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Length != TotpDigits || !code.All(char.IsDigit))
            return false;

        var key = Base32Decode(base32Secret);
        var currentStep = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / TotpStepSeconds;

        for (var offset = -1; offset <= 1; offset++)
        {
            if (ComputeTotp(key, currentStep + offset) == code)
                return true;
        }

        return false;
    }

    private static string ComputeTotp(byte[] key, long step)
    {
        var stepBytes = BitConverter.GetBytes(step);

        if (BitConverter.IsLittleEndian)
            Array.Reverse(stepBytes);

        // SHA-1 here isn't a weak-hashing choice, it's RFC 6238/RFC 4226's
        // mandated PRF. Every standard TOTP app (Google Authenticator,
        // Authy, 1Password, etc.) computes codes assuming HMAC-SHA1 unless
        // the otpauth:// URI explicitly says otherwise; switching this to
        // SHA-256/512 would silently desync every already-enrolled user's
        // authenticator with no way for them to detect why, since their
        // app has no error path for "server changed algorithms." Secrets/
        // PATs/recovery codes elsewhere in this file already use SHA-256 -
        // this is the one deliberate, spec-forced exception. The NOSONAR
        // marker has to be on this exact line (not in the paragraph above)
        // for SonarQube to actually recognize the suppression.
        using var hmac = new HMACSHA1(key); // NOSONAR (csharpsquid:S4790) - RFC 6238/4226-mandated PRF for TOTP, see comment above
        var hash = hmac.ComputeHash(stepBytes);

        var offset = hash[^1] & 0x0F;

        var binaryCode = ((hash[offset] & 0x7F) << 24)
            | ((hash[offset + 1] & 0xFF) << 16)
            | ((hash[offset + 2] & 0xFF) << 8)
            | (hash[offset + 3] & 0xFF);

        var otp = binaryCode % (int)Math.Pow(10, TotpDigits);

        return otp.ToString(new string('0', TotpDigits));
    }

    // Crockford-ish: excludes 0/O/1/I so a human reading one of these off
    // to someone over the phone/chat can't confuse similar-looking
    // characters when they type it back in.
    private static string GenerateRecoveryCode()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

        var bytes = RandomNumberGenerator.GetBytes(8);
        var chars = bytes.Select(b => alphabet[b % alphabet.Length]).ToArray();

        return $"{new string(chars, 0, 4)}-{new string(chars, 4, 4)}";
    }

    // Same hash-only-at-rest treatment as API keys/the screen-lock PIN
    // above - normalized (trimmed, uppercased) first so "8h7k-xp2q" and
    // "8H7K-XP2Q" hash identically, since a human retyping one from a
    // downloaded text file shouldn't have to match case exactly.
    private static string HashRecoveryCode(string code) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(code.Trim().ToUpperInvariant()))).ToLowerInvariant();

    private static readonly char[] Base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".ToCharArray();

    private static string Base32Encode(byte[] data)
    {
        var sb = new StringBuilder((data.Length * 8 + 4) / 5);

        int bitBuffer = 0, bitsInBuffer = 0;

        foreach (var b in data)
        {
            bitBuffer = (bitBuffer << 8) | b;
            bitsInBuffer += 8;

            while (bitsInBuffer >= 5)
            {
                bitsInBuffer -= 5;
                sb.Append(Base32Alphabet[(bitBuffer >> bitsInBuffer) & 0x1F]);
            }
        }

        if (bitsInBuffer > 0)
            sb.Append(Base32Alphabet[(bitBuffer << (5 - bitsInBuffer)) & 0x1F]);

        return sb.ToString();
    }

    private static byte[] Base32Decode(string base32)
    {
        var bytes = new List<byte>();

        int bitBuffer = 0, bitsInBuffer = 0;

        foreach (var c in base32.TrimEnd('='))
        {
            var index = Array.IndexOf(Base32Alphabet, char.ToUpperInvariant(c));
            if (index < 0) continue;

            bitBuffer = (bitBuffer << 5) | index;
            bitsInBuffer += 5;

            if (bitsInBuffer >= 8)
            {
                bitsInBuffer -= 8;
                bytes.Add((byte)((bitBuffer >> bitsInBuffer) & 0xFF));
            }
        }

        return bytes.ToArray();
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
        var ai = root["AiAssistant"] as JObject;
        var notifications = root["Notifications"] as JObject;

        var admins = (auth?["AdminGitHubUsernames"] as JArray)?
            .Select(x => x.ToString())
            .ToList() ?? new List<string>();

        var suspendedAdmins = (auth?["SuspendedAdminGitHubUsernames"] as JArray)?
            .Select(x => x.ToString())
            .ToList() ?? new List<string>();

        var adminEmails = (auth?["AdminEmails"] as JArray)?
            .Select(x => x.ToString())
            .ToList() ?? new List<string>();

        var suspendedAdminEmails = (auth?["SuspendedAdminEmails"] as JArray)?
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
            SuspendedAdminGitHubUsernames = suspendedAdmins,
            AdminEmails = adminEmails,
            SuspendedAdminEmails = suspendedAdminEmails,
            SuperAdminEmail = auth?["SuperAdminEmail"]?.ToString(),

            AiProvider = "Google Gemini",
            AiModel = ai?["Model"]?.ToString() ?? string.Empty,
            AiApiKeyConfigured = !string.IsNullOrWhiteSpace(ai?["GeminiApiKey"]?.ToString()),

            NotificationsFromEmail = notifications?["FromEmail"]?.ToString() ?? string.Empty,
            NotificationsFromName = notifications?["FromName"]?.ToString() ?? string.Empty,
            NotificationsApiKeyConfigured = !string.IsNullOrWhiteSpace(notifications?["ResendApiKey"]?.ToString())
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

    // Everything this portal persists, in one file - built for migrating
    // off a Render free-tier Postgres instance before its 30-day
    // expiration deletes it. `Settings` is the exact portal_settings.data
    // JSONB as it sits at rest (individual secret fields still Data-
    // Protection ciphertext - this never calls Unprotect, so a leaked
    // export never hands over a plaintext credential on its own).
    // DataProtectionKeyXmls is the OTHER half that actually matters here:
    // without the matching key ring, every one of those encrypted fields
    // becomes permanently unreadable the moment this is restored into a
    // database with a different, freshly-generated key ring - the two
    // only work together. That also means this file is, in practice, AS
    // SENSITIVE AS every credential in this portal in plaintext (anyone
    // holding both halves can decrypt everything offline) - callers must
    // treat it that way, never as "safely encrypted".
    public async Task<PortalBackupDto> ExportBackupAsync()
    {
        if (_connectionString == null)
            throw new InvalidOperationException(
                "This portal isn't running against a Postgres database (DATABASE_URL not set) - there's nothing durable to back up.");

        var root = await ReadRootAsync();

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        await EnsureDataProtectionKeysTableAsync(connection);

        var keys = new List<string>();

        await using (var keysCommand = new NpgsqlCommand("SELECT xml FROM data_protection_keys ORDER BY id", connection))
        await using (var reader = await keysCommand.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
                keys.Add(reader.GetString(0));
        }

        return new PortalBackupDto
        {
            ExportedAtUtc = DateTime.UtcNow,
            Settings = root,
            DataProtectionKeyXmls = keys
        };
    }

    // Full overwrite of both halves - the settings row AND the key ring -
    // never a merge. A partial restore (settings without the matching
    // keys, or vice versa) is worse than no restore at all, since it
    // leaves every credential looking present but silently undecryptable.
    // The key ring change only takes effect for THIS process the next
    // time it starts (ASP.NET Core's Data Protection system loads keys
    // once at startup and caches them in memory) - the caller needs to
    // restart/redeploy afterward, not just call this and keep going.
    public async Task ImportBackupAsync(PortalBackupDto backup)
    {
        if (_connectionString == null)
            throw new InvalidOperationException(
                "This portal isn't running against a Postgres database (DATABASE_URL not set) - there's nothing to restore into.");

        if (backup.Settings == null)
            throw new ArgumentException("Backup file is missing its settings data.");

        await WriteRootAsync(backup.Settings);

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        await EnsureDataProtectionKeysTableAsync(connection);

        await using var transaction = await connection.BeginTransactionAsync();

        await using (var clearKeys = new NpgsqlCommand("DELETE FROM data_protection_keys", connection, transaction))
            await clearKeys.ExecuteNonQueryAsync();

        foreach (var xml in backup.DataProtectionKeyXmls)
        {
            await using var insertKey = new NpgsqlCommand(
                "INSERT INTO data_protection_keys (xml) VALUES (@xml)", connection, transaction);

            insertKey.Parameters.AddWithValue("xml", xml);
            await insertKey.ExecuteNonQueryAsync();
        }

        await transaction.CommitAsync();
    }

    // Same table PostgresXmlRepository (Program.cs's Data Protection setup)
    // creates and writes to - CREATE TABLE IF NOT EXISTS is idempotent, so
    // running it again here (a fresh connection, possibly before that
    // repository has ever been touched) is always safe.
    private static async Task EnsureDataProtectionKeysTableAsync(NpgsqlConnection connection)
    {
        await using var command = new NpgsqlCommand(
            "CREATE TABLE IF NOT EXISTS data_protection_keys (id SERIAL PRIMARY KEY, xml TEXT NOT NULL)",
            connection);

        await command.ExecuteNonQueryAsync();
    }
}

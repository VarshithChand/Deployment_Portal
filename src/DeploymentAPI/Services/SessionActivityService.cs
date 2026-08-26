using System.Collections.Concurrent;
using System.Linq;

namespace DeploymentAPI.Services;

// In-memory, per-session-key state that's inherently real-time and not
// worth persisting: when a given browser/device (see PortalIdentity) was
// last seen, and whether an admin has just force-signed it out. Both
// reset on restart, same as ActivityLogService - "last active a moment
// ago" and "sign this one browser out right now" don't need to survive
// that, unlike the durable block flag in SettingsService.
public class SessionActivityService
{
    private readonly ConcurrentDictionary<string, DateTime> _lastSeen = new();
    // Reason travels alongside the timestamp now - originally this only
    // ever meant "an admin force-signed this session out" (GlobalLogoutMonitor
    // hardcoded that copy), but SettingsService's own duplicate-device
    // eviction (see SaveUserGitHubCredentialsAsync) needed a distinct
    // "signed in from another device" explanation for the exact same
    // mechanism, rather than telling someone an admin did this when nobody
    // did.
    private readonly ConcurrentDictionary<string, (DateTime Timestamp, string Reason)> _forceLogoutAfter = new();
    private readonly ConcurrentDictionary<string, string> _lastUserAgent = new();
    private readonly ConcurrentDictionary<string, string> _lastIpAddress = new();

    // Every distinct "METHOD /path" this key has ever hit, not a full call
    // history - Security > Audit Log already covers "what happened when";
    // this answers "which of this app's own APIs does this user actually
    // use" at a glance. The inner ConcurrentDictionary<string, byte> is
    // just a thread-safe set (no concurrent HashSet in .NET) - the byte
    // value is never read.
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, byte>> _usedEndpoints = new();

    // Failed screen-lock PIN guesses for a session - the actual enforcement
    // of "N wrong attempts locks this out," since the frontend's own
    // attempt counter (PinLockScreen.jsx) is UI state only and can't stop
    // someone from calling the verify endpoint directly, bypassing it
    // entirely. See SettingsController.VerifyMyPin.
    private readonly ConcurrentDictionary<string, int> _failedPinAttempts = new();

    public int RecordFailedPinAttempt(string key) => _failedPinAttempts.AddOrUpdate(key, 1, (_, count) => count + 1);

    public int GetFailedPinAttemptCount(string key) => _failedPinAttempts.TryGetValue(key, out var count) ? count : 0;

    public void ClearFailedPinAttempts(string key) => _failedPinAttempts.TryRemove(key, out _);

    // MFA's own wrong-code lockout used to live here (an in-memory
    // counter+timestamp pair, keyed by resolved GitHub login rather than a
    // PortalIdentity session key, same reasoning the PIN counter above
    // uses a session key for). Moved to Helpers/MfaLockoutPolicy.cs +
    // SettingsService's durable MfaLockouts state - unlike a mistyped PIN
    // (still handled here, still just a temporary counter), MFA's lockout
    // now escalates across repeated offenses (2min -> 10min -> 1hr ->
    // 1day) and has to survive a restart for that escalation to mean
    // anything, which an in-memory ConcurrentDictionary can't do.

    // "Primary factor already proved, waiting on an MFA code before the
    // real JWT gets issued" - shared by every login method (email/
    // password, Google, GitHub OAuth; see AccountAuthController/
    // OAuthLoginFinisher). Keyed by PortalIdentity session key (unlike the
    // MFA attempt/lockout dictionaries above, which are per-account) since
    // this is specifically "what THIS browser is mid-login with," before
    // there's a JWT to identify it by any other way. Holds the resolved
    // identity/role/email rather than a credential - by this point
    // there's nothing left to prove except the MFA code itself, the
    // account and its role were already fully resolved before this was
    // set. In-memory only, same "gone on restart is fine" reasoning as
    // everything else here - worst case a mid-login visitor has to sign
    // in again, never a security hole.
    private readonly ConcurrentDictionary<string, (string UserId, string Role, string? Email, DateTime ExpiresAtUtc)> _pendingAccountLogins = new();

    public void SetPendingAccountLogin(string key, string userId, string role, string? email, TimeSpan ttl) =>
        _pendingAccountLogins[key] = (userId, role, email, DateTime.UtcNow.Add(ttl));

    public (string UserId, string Role, string? Email)? GetPendingAccountLogin(string key)
    {
        if (!_pendingAccountLogins.TryGetValue(key, out var entry) || entry.ExpiresAtUtc <= DateTime.UtcNow)
            return null;

        return (entry.UserId, entry.Role, entry.Email);
    }

    public void ClearPendingAccountLogin(string key) => _pendingAccountLogins.TryRemove(key, out _);

    // Per-credential PIN unlock grants (see CredentialGate) - a browser
    // that's verified the screen-lock PIN for one provider (say, AWS) does
    // NOT automatically get GitHub/Azure/etc. too; each is tracked
    // separately, keyed by "{session key}:{provider}". In-memory and
    // short-lived by design, same reasoning as everything else in this
    // file - losing every open grant on a restart just means re-entering
    // the PIN once more, never a security hole, and a real persisted grant
    // table would be a much bigger (and unnecessary) piece of state for
    // something this app already treats as "gone on restart" everywhere
    // else (force-logout, failed-attempt counters, frontend build
    // reporting).
    private readonly ConcurrentDictionary<string, DateTime> _credentialUnlocks = new();

    private static string CredentialUnlockKey(string sessionKey, string provider) => $"{sessionKey}:{provider}";

    public void GrantCredentialUnlock(string sessionKey, string provider, TimeSpan duration) =>
        _credentialUnlocks[CredentialUnlockKey(sessionKey, provider)] = DateTime.UtcNow.Add(duration);

    public bool IsCredentialUnlocked(string sessionKey, string provider) =>
        _credentialUnlocks.TryGetValue(CredentialUnlockKey(sessionKey, provider), out var expiresAt)
        && expiresAt > DateTime.UtcNow;

    // Called whenever the credential itself changes (saved or cleared) -
    // an unlock grant is authorization to manage THIS credential, not a
    // standing pass that should silently keep applying to whatever value
    // happens to be there after the next edit.
    public void RevokeCredentialUnlock(string sessionKey, string provider) =>
        _credentialUnlocks.TryRemove(CredentialUnlockKey(sessionKey, provider), out _);

    // Which frontend build a given session's browser is actually running -
    // reported once per app load (see AppVersionController's
    // frontend-heartbeat endpoint / deployment-ui's utils/buildInfo.js).
    // Backs Application Support's "User Versions" view (see
    // ApplicationSupportController) - lets an admin see whether a specific
    // user is stuck on a stale cached build without asking them.
    private readonly ConcurrentDictionary<string, FrontendBuildInfo> _frontendBuilds = new();

    public void Touch(string key, string? userAgent = null, string? ipAddress = null, string? endpoint = null)
    {
        _lastSeen[key] = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(userAgent))
            _lastUserAgent[key] = userAgent;

        if (!string.IsNullOrWhiteSpace(ipAddress))
            _lastIpAddress[key] = ipAddress;

        if (!string.IsNullOrWhiteSpace(endpoint))
            _usedEndpoints.GetOrAdd(key, _ => new ConcurrentDictionary<string, byte>())[endpoint] = 0;
    }

    public List<string> GetUsedEndpoints(string key) =>
        _usedEndpoints.TryGetValue(key, out var endpoints)
            ? endpoints.Keys.OrderBy(e => e).ToList()
            : new List<string>();

    public DateTime? GetLastSeen(string key) =>
        _lastSeen.TryGetValue(key, out var seen) ? seen : null;

    // Raw header value - see Helpers.DeviceInfo.Describe for turning this
    // into the "Windows · Chrome" style label the Users tab shows.
    public string? GetLastUserAgent(string key) =>
        _lastUserAgent.TryGetValue(key, out var ua) ? ua : null;

    // Resolved from X-Forwarded-For via ASP.NET Core's own forwarded-
    // headers middleware (see Program.cs's UseForwardedHeaders) - the
    // real client address, not Render's own proxy.
    public string? GetLastIpAddress(string key) =>
        _lastIpAddress.TryGetValue(key, out var ip) ? ip : null;

    // Stamped "now" - GlobalLogoutMonitor treats any change to this value
    // (polled per-session via GET /api/auth/session-epoch) as "sign out,"
    // the same way it already reacts to the portal-wide epoch changing.
    // reason defaults to "admin" - every pre-existing caller (AdminUsersController's
    // explicit Force Logout and Delete actions) genuinely is an admin
    // acting on this session, so neither needed to change.
    public void ForceLogout(string key, string reason = "admin") =>
        _forceLogoutAfter[key] = (DateTime.UtcNow, reason);

    public DateTime? GetForceLogoutAfter(string key) =>
        _forceLogoutAfter.TryGetValue(key, out var entry) ? entry.Timestamp : null;

    public string? GetForceLogoutReason(string key) =>
        _forceLogoutAfter.TryGetValue(key, out var entry) ? entry.Reason : null;

    public void RecordFrontendBuild(string key, string commit, string? version, string environment) =>
        _frontendBuilds[key] = new FrontendBuildInfo(commit, version, environment, DateTime.UtcNow);

    public FrontendBuildInfo? GetFrontendBuild(string key) =>
        _frontendBuilds.TryGetValue(key, out var info) ? info : null;

    // Settings > Security Testing Lab's own scan-rate limiter - a coarse,
    // GLOBAL (not per-session) counter, deliberately: this whole feature
    // is restricted to one identity (VarshithChand, see
    // AdminGate.DenyUnlessSuperAdminAsync), so there's only ever one
    // legitimate caller and no need for the per-key bookkeeping every
    // other counter in this file uses. Guards against an accidental
    // hammer-the-target-by-mistake click-spam, not a multi-attacker abuse
    // scenario - a portal-level backstop on top of (not a replacement
    // for) the target's own rate limiting.
    private readonly object _scanRateLock = new();
    private readonly List<DateTime> _recentScanTimestamps = new();
    private DateTime? _lastScanStartedAtUtc;

    private static readonly TimeSpan ScanCooldown = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan ScanRateWindow = TimeSpan.FromHours(1);
    private const int MaxScansPerWindow = 30;

    public (bool Allowed, string? Reason) TryRegisterScanAttempt()
    {
        lock (_scanRateLock)
        {
            var now = DateTime.UtcNow;

            if (_lastScanStartedAtUtc.HasValue && now - _lastScanStartedAtUtc.Value < ScanCooldown)
                return (false, "Please wait a few seconds between scans.");

            _recentScanTimestamps.RemoveAll(t => now - t > ScanRateWindow);

            if (_recentScanTimestamps.Count >= MaxScansPerWindow)
                return (false, $"Scan limit reached ({MaxScansPerWindow} per hour) - try again later.");

            _recentScanTimestamps.Add(now);
            _lastScanStartedAtUtc = now;

            return (true, null);
        }
    }
}

public record FrontendBuildInfo(string Commit, string? Version, string Environment, DateTime ReportedAtUtc);

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
    private readonly ConcurrentDictionary<string, DateTime> _forceLogoutAfter = new();
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
    public void ForceLogout(string key) => _forceLogoutAfter[key] = DateTime.UtcNow;

    public DateTime? GetForceLogoutAfter(string key) =>
        _forceLogoutAfter.TryGetValue(key, out var stamp) ? stamp : null;

    public void RecordFrontendBuild(string key, string commit, string? version, string environment) =>
        _frontendBuilds[key] = new FrontendBuildInfo(commit, version, environment, DateTime.UtcNow);

    public FrontendBuildInfo? GetFrontendBuild(string key) =>
        _frontendBuilds.TryGetValue(key, out var info) ? info : null;
}

public record FrontendBuildInfo(string Commit, string? Version, string Environment, DateTime ReportedAtUtc);

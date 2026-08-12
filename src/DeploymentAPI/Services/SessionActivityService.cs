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

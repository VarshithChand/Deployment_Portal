using System.Collections.Concurrent;

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

    public void Touch(string key, string? userAgent = null, string? ipAddress = null)
    {
        _lastSeen[key] = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(userAgent))
            _lastUserAgent[key] = userAgent;

        if (!string.IsNullOrWhiteSpace(ipAddress))
            _lastIpAddress[key] = ipAddress;
    }

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
}

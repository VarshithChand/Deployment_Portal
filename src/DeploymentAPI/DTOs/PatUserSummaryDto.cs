namespace DeploymentAPI.DTOs;

// One row in Services > Users (and the Sidebar Access picker) - one real
// logged-in account (see PortalUserAccount), identified by its own id (see
// SettingsService.GetPatUsersAsync). Name/field names kept as "Pat*" since
// this predates real accounts and the frontend already reads these exact
// field names throughout Services.jsx - only what populates them changed.
public class PatUserSummaryDto
{
    public string Key { get; set; } = string.Empty;

    // The account's own login email (or display name/id as a fallback) -
    // no longer a live-resolved GitHub PAT owner, since login is a real
    // account now and its identity is already known without an API call.
    public string PatOwnerLogin { get; set; } = string.Empty;

    // Only ever meaningful when PatOwnerLogin resolved to a real login
    // (never for an "Unknown (...)" row - same reasoning as the dedupe
    // feature's own StartsWith("Unknown") filter, there's no confirmed
    // identity to look this up against). Backs the Users table's "Reset
    // MFA" button and MFA badge.
    public bool IsMfaEnabled { get; set; }

    // A super-admin has flagged this login as required to set up MFA
    // (see SettingsService.SetMfaRequiredAsync) - independent of
    // IsMfaEnabled, since this can be true before they've ever enrolled.
    // Backs Admin Access's "Require MFA"/"Un-require" toggle.
    public bool IsMfaRequired { get; set; }

    public string Owner { get; set; } = string.Empty;

    public string Repository { get; set; } = string.Empty;

    public int RestrictedTabCount { get; set; }

    // Persisted (see SettingsService.IsPatUserBlockedAsync) - a blocked
    // key is rejected outright by every request, even with a still-valid
    // token (see the block-check middleware in Program.cs).
    public bool IsBlocked { get; set; }

    // Persisted (see SettingsService.SoftSignOutPatUserAsync) - the "Sign
    // Out" button's soft delete: their token is still saved, just reported
    // as absent, which puts RequireGitHubSetup's PAT popup back in front
    // of them. Re-entering a token there clears this automatically.
    public bool IsSignedOut { get; set; }

    // In-memory only (see SessionActivityService) - when this key was last
    // seen making any request, reset on every backend restart same as the
    // activity log. Null means "not seen since this instance started."
    public DateTime? LastActiveUtc { get; set; }

    // "Windows · Chrome" style label from that session's last request (see
    // Helpers.DeviceInfo.Describe) - same in-memory/reset-on-restart
    // caveat as LastActiveUtc.
    public string Device { get; set; } = "Unknown device";

    // The real client address (via X-Forwarded-For, see
    // SessionActivityService.GetLastIpAddress) from that session's last
    // request - same in-memory/reset-on-restart caveat as LastActiveUtc.
    public string? IpAddress { get; set; }

    // Every distinct "METHOD /path" this session has ever hit (see
    // SessionActivityService.GetUsedEndpoints) - which of this portal's
    // own APIs this user actually uses, not a full call history. Same
    // in-memory/reset-on-restart caveat as LastActiveUtc.
    public List<string> UsedEndpoints { get; set; } = new();

    // In-memory only (see SessionActivityService.GetFrontendBuild) - the
    // git commit this session's browser last reported running, from its
    // own build-time-embedded metadata (see deployment-ui/vite.config.js).
    // Null means this session hasn't loaded the app since the backend last
    // restarted, or is running a build from before this reporting existed.
    public string? FrontendCommit { get; set; }

    public string? FrontendVersion { get; set; }

    public string? FrontendEnvironment { get; set; }

    public DateTime? FrontendLastSeenUtc { get; set; }
}

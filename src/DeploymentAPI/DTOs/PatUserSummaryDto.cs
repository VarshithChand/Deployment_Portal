namespace DeploymentAPI.DTOs;

// One row in the admin's "Sidebar Access" picker — a browser/device that
// has configured a Personal Access Token, identified by its storage key
// (see PortalIdentity) plus the actual GitHub account that token belongs
// to (resolved live — see SettingsService.ResolvePatOwnerLoginAsync),
// since two different PAT users can otherwise look identical (same
// Owner/Repository, e.g. two teammates both deploying "org/repo").
public class PatUserSummaryDto
{
    public string Key { get; set; } = string.Empty;

    public string PatOwnerLogin { get; set; } = string.Empty;

    public string Owner { get; set; } = string.Empty;

    public string Repository { get; set; } = string.Empty;

    public int RestrictedTabCount { get; set; }

    // Persisted (see SettingsService.IsPatUserBlockedAsync) - a blocked
    // key is rejected outright by every request, even with a still-valid
    // token (see the block-check middleware in Program.cs).
    public bool IsBlocked { get; set; }

    // In-memory only (see SessionActivityService) - when this key was last
    // seen making any request, reset on every backend restart same as the
    // activity log. Null means "not seen since this instance started."
    public DateTime? LastActiveUtc { get; set; }

    // "Windows · Chrome" style label from that session's last request (see
    // Helpers.DeviceInfo.Describe) - same in-memory/reset-on-restart
    // caveat as LastActiveUtc.
    public string Device { get; set; } = "Unknown device";
}

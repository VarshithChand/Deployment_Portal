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
}

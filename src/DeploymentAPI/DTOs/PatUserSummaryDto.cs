namespace DeploymentAPI.DTOs;

// One row in the admin's "Sidebar Access" picker — a browser/device that
// has configured a Personal Access Token, identified by its storage key
// (see PortalIdentity), never by a resolved GitHub identity.
public class PatUserSummaryDto
{
    public string Key { get; set; } = string.Empty;

    public string Owner { get; set; } = string.Empty;

    public string Repository { get; set; } = string.Empty;

    public int RestrictedTabCount { get; set; }
}

namespace DeploymentAPI.DTOs;

// Safe-to-return view of the portal-wide (shared) settings — secrets are
// never echoed back, only whether one has been saved. GitHub repo/token are
// NOT here: those are per-user now (see UserGitHubCredentials and
// SettingsController's api/settings/me/github endpoints).
public class SettingsViewDto
{
    public string DockerRegistry { get; set; } = string.Empty;

    public string DockerUsername { get; set; } = string.Empty;

    public bool DockerPasswordConfigured { get; set; }

    public string GitHubOAuthClientId { get; set; } = string.Empty;

    public bool GitHubOAuthClientSecretConfigured { get; set; }

    public List<string> AdminGitHubUsernames { get; set; } = new();

    // Whether the CURRENT caller (this request's OAuth login or configured
    // Personal Access Token) has admin authority — computed per-request in
    // SettingsController.Get(), never derived from AdminGitHubUsernames on
    // the frontend, since that list itself is blanked out for non-admins.
    public bool IsAdminSession { get; set; }
}

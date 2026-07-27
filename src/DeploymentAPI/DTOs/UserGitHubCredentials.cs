namespace DeploymentAPI.DTOs;

// One portal user's own GitHub repo + Personal Access Token — every user
// configures their own instead of the whole portal sharing a single one.
public record UserGitHubCredentials(string Owner, string Repository, string? PersonalAccessToken)
{
    public bool TokenConfigured => !string.IsNullOrWhiteSpace(PersonalAccessToken);

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Owner) && !string.IsNullOrWhiteSpace(Repository);
}

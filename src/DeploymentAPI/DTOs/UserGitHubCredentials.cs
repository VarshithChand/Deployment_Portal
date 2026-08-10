namespace DeploymentAPI.DTOs;

// One portal user's own GitHub repo + Personal Access Token — every user
// configures their own instead of the whole portal sharing a single one.
public record UserGitHubCredentials(string Owner, string Repository, string? PersonalAccessToken)
{
    public bool TokenConfigured => !string.IsNullOrWhiteSpace(PersonalAccessToken);

    // Requires a token, not just Owner/Repository - a soft-signed-out
    // session (see SettingsService.SoftSignOutPatUserAsync) reports no
    // token while leaving Owner/Repository exactly as they were, and
    // this is what RequireGitHubSetup's blocking gate keys off. Without
    // the token check here, Owner/Repository surviving the soft delete
    // meant IsConfigured stayed true and the gate never reappeared at all.
    public bool IsConfigured => !string.IsNullOrWhiteSpace(Owner) && !string.IsNullOrWhiteSpace(Repository) && TokenConfigured;
}

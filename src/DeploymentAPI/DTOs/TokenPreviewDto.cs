namespace DeploymentAPI.DTOs;

public class TokenPreviewRequestDto
{
    public string PersonalAccessToken { get; set; } = string.Empty;
}

// What RequireGitHubSetup's two-step "Connect your repository" flow shows
// after step 1 (paste a token) and before step 2 (pick a repo) — who the
// token belongs to and every repo it can see, so step 2 never requires
// already knowing (and correctly typing) an exact repository URL.
public class TokenPreviewResponseDto
{
    public bool Success { get; set; }

    public string? Error { get; set; }

    public string? Username { get; set; }

    public string? AvatarUrl { get; set; }

    public List<AccountRepositoryDto> Repositories { get; set; } = new();

    // Set by SettingsController.PreviewMyGitHubToken (a local lookup, not
    // by GitHubApiService itself - this DTO's owner has no reason to know
    // about MFA). Lets RequireGitHubSetup show the code-entry step
    // immediately after preview, before ever attempting to save - the
    // save itself (SaveMyGitHub) independently re-checks and enforces
    // this regardless, so a client skipping preview can't bypass it.
    public bool MfaRequired { get; set; }
}

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
}

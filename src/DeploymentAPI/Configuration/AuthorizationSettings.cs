namespace DeploymentAPI.Configuration;

// Username allowlist for who may use this portal at all, split into two
// roles. AdminGitHubUsernames get full control; ViewerGitHubUsernames get
// read-only access. A GitHub account on neither list is rejected at login
// (see AuthService.ExchangeCodeForUserAsync) — unless both lists are empty,
// which is treated as "not configured yet" (bootstrap mode) and lets anyone
// in, since before any admin exists nobody could have logged in as one.
public class AuthorizationSettings
{
    public List<string> AdminGitHubUsernames { get; set; } = new();

    public List<string> ViewerGitHubUsernames { get; set; } = new();
}

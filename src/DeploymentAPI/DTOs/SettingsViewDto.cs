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

    public string SonarHostUrl { get; set; } = "https://sonarcloud.io";

    public string SonarOrganization { get; set; } = string.Empty;

    public string SonarProjectKey { get; set; } = string.Empty;

    public bool SonarTokenConfigured { get; set; }

    // Deployment Copilot (see GeminiService/AiToolsService/AiController) —
    // AiModel is a plain configuration value (a model NAME, e.g.
    // "gemini-2.0-flash"), not a secret, so it's safe to always return.
    // The Gemini API key itself is never in this DTO under any field name.
    public string AiProvider { get; set; } = "Google Gemini";

    public string AiModel { get; set; } = string.Empty;

    public bool AiApiKeyConfigured { get; set; }

    // Whether the CURRENT caller (this request's OAuth login or configured
    // Personal Access Token) has admin authority — computed per-request in
    // SettingsController.Get(), never derived from AdminGitHubUsernames on
    // the frontend, since that list itself is blanked out for non-admins.
    public bool IsAdminSession { get; set; }

    // Whether the CURRENT caller is specifically the one GitHub identity
    // Database Management is restricted to (see AdminGate.
    // DenyUnlessSuperAdminAsync) — deliberately separate from IsAdminSession,
    // since being a general admin is NOT sufficient for this one feature.
    // Frontend-side, this only controls whether the Database tile/nav entry
    // is shown; the backend enforces the real restriction on every endpoint.
    public bool IsSuperAdminSession { get; set; }
}

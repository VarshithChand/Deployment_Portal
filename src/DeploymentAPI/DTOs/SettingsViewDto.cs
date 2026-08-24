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

    // Stays ON AdminGitHubUsernames (unlike Remove, which deletes the
    // entry outright) but is treated as a normal Viewer everywhere until
    // unsuspended - see AdminGate.IsAdminOrBootstrap, which cross-checks
    // this list even for a session whose JWT already has the Admin role
    // claim baked in, so suspending someone takes effect on their very
    // next request instead of only at their next login.
    public List<string> SuspendedAdminGitHubUsernames { get; set; } = new();

    // SonarQube/SonarCloud are NOT here - each now has its own dedicated
    // status endpoint (SonarController.Status) since the split into two
    // independent credentials, matching the same pattern Docker Hub/GHCR/
    // Harbor/Nexus already use rather than this general settings blob.

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

    // Which admin-only pages (see SettingsService.GrantablePageKeys) the
    // CURRENT caller has been individually granted scoped access to via
    // Settings > page-level "Page Access" (see PageAdminGrants) - distinct
    // from full admin authority. The frontend uses this to decide whether
    // to still show/allow a normally admin-only tab (Sidebar.jsx's
    // ADMIN_ONLY_TABS) for someone who isn't a full admin but does have a
    // scoped grant for that one page - the backend's own AdminGate checks
    // already recognized these grants; this is what lets a grantee
    // actually reach the page in the first place.
    public List<string> GrantedPages { get; set; } = new();
}

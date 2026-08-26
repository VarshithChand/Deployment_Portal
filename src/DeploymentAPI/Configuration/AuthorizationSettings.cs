namespace DeploymentAPI.Configuration;

// Two allowlists, checked in parallel: AdminGitHubUsernames/
// ViewerGitHubUsernames (a GitHub OAuth login's username) predate email/
// password + Google login and are kept for continuity - an existing
// GitHub-OAuth admin's access doesn't change. AdminEmails/ViewerEmails are
// the email-based equivalent, the actual source of truth going forward
// since it's the one identifier every login method (email/password, Google,
// GitHub) can always resolve (see AuthService.ExchangeCodeForUserAsync's
// GitHub /user/emails resolution, added for the login-notification-email
// feature). An account matching neither list on either identifier is
// rejected at login - unless every list is empty, "not configured yet"
// (bootstrap mode), which lets anyone in since before any admin exists
// nobody could have logged in as one.
public class AuthorizationSettings
{
    public List<string> AdminGitHubUsernames { get; set; } = new();

    public List<string> ViewerGitHubUsernames { get; set; } = new();

    public List<string> AdminEmails { get; set; } = new();

    public List<string> ViewerEmails { get; set; } = new();

    // Email equivalent of SuspendedAdminGitHubUsernames (see AdminGate) -
    // stays on AdminEmails but treated as a Viewer until unsuspended.
    public List<string> SuspendedAdminEmails { get; set; } = new();

    // Replaces the old hardcoded SuperAdminLogin GitHub-username constant -
    // Database Management/Admin Allowlist/MFA-recovery-code issuance are
    // restricted to whichever single account holds this email (see
    // AdminGate.IsSuperAdminAsync, which also still recognizes the legacy
    // GitHub-username constant for continuity).
    public string? SuperAdminEmail { get; set; }
}

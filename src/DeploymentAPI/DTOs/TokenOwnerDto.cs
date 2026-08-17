namespace DeploymentAPI.DTOs;

// Who the configured Personal Access Token belongs to — shown in the top
// bar instead of "Set up GitHub Login" once a token is saved, so it's
// obvious whose credentials the app is acting with.
public class TokenOwnerDto
{
    public bool Configured { get; set; }

    public string Login { get; set; } = string.Empty;

    public string AvatarUrl { get; set; } = string.Empty;

    // Repo-admin access is exactly the permission GitHub itself uses to let
    // someone approve/reject deployments to a protected environment even
    // when they aren't one of that environment's named required reviewers —
    // so this drives whether the Approvals page/nav-tab is shown at all.
    public bool CanApprove { get; set; }

    // Repo-write ("push") access — the same permission level GitHub's own
    // Actions API requires to dispatch a workflow_dispatch run at all, so
    // triggering a deployment through this portal accepts it as an
    // alternative to being on the portal's own admin allowlist (see
    // AdminGate's allowRepoWrite). Admin implies push, so this is true for
    // repo admins too, not just push-only collaborators.
    public bool CanDeploy { get; set; }
}

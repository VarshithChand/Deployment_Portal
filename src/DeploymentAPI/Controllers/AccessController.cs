using System.Security.Claims;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Repository access management — invite/remove collaborators, assign
// permission levels, and note a branch's purpose or restrict who can
// push to it. Reads are scoped to whatever repo/token PortalIdentity
// resolved for this caller (see GitHubAuthService), no login required;
// every action that changes real GitHub state or the locally-stored branch
// notes runs through AdminGate, which is bootstrap-aware (see AdminGate/
// SettingsController).
[ApiController]
[Route("api/access")]
public class AccessController : ControllerBase
{
    private readonly GitHubApiService _github;
    private readonly SettingsService _settings;
    private readonly ActivityLogService _log;

    public AccessController(GitHubApiService github, SettingsService settings, ActivityLogService log)
    {
        _github = github;
        _settings = settings;
        _log = log;
    }

    // Lets the Access Levels/Invite pages hide Triage and Maintain up
    // front on a personal-account repo instead of only finding out via a
    // rejected request.
    [HttpGet("repo-info")]
    public async Task<IActionResult> RepoInfo()
    {
        return Ok(new { isOrganization = await _github.IsOrganizationOwnedAsync() });
    }

    // Active collaborators only — used by the Branches page's "restrict who
    // can push" picker, since a pending invite can't push yet regardless.
    [HttpGet("collaborators")]
    public async Task<IActionResult> Collaborators([FromQuery] bool force = false)
    {
        return Ok(await _github.GetCollaboratorsAsync(force));
    }

    // Active + pending combined — what the Access Levels page renders.
    [HttpGet("entries")]
    public async Task<IActionResult> Entries([FromQuery] bool force = false)
    {
        return Ok(await _github.GetAccessEntriesAsync(force));
    }

    // Invites a brand-new collaborator, or changes an existing one's level
    // (which GitHub only actually applies via a remove-then-reinvite —
    // see SetCollaboratorPermissionAsync). GitHub emails the invitee
    // automatically the moment this call succeeds — the portal doesn't
    // need its own notification step for that.
    [HttpPut("collaborators/{username}")]
    public async Task<IActionResult> InviteCollaborator(string username, InviteCollaboratorUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change repository access") is IActionResult denied)
            return denied;

        var permission = string.IsNullOrWhiteSpace(request.Permission) ? "push" : request.Permission;

        await _github.SetCollaboratorPermissionAsync(username, permission);

        _log.LogInfo("Access", $"Invited/updated collaborator '{username}' with '{permission}' access.");

        return Ok(await _github.GetAccessEntriesAsync(forceRefresh: true));
    }

    [HttpDelete("collaborators/{username}")]
    public async Task<IActionResult> RemoveCollaborator(string username)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change repository access") is IActionResult denied)
            return denied;

        await _github.RemoveCollaboratorAsync(username);

        _log.LogInfo("Access", $"Removed collaborator '{username}'.");

        return Ok(await _github.GetAccessEntriesAsync(forceRefresh: true));
    }

    // Access Levels page: give an existing collaborator access to a
    // *different* repository too — reuses the same invite call against a
    // different owner/repo, so it only works for repos the configured
    // token's account can actually administer.
    [HttpPut("collaborators/{username}/assign-repo")]
    public async Task<IActionResult> AssignToRepo(string username, AssignRepoDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change repository access") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(request.Owner) || string.IsNullOrWhiteSpace(request.Repository))
            return BadRequest(new { message = "Pick a repository to assign this user to." });

        var permission = string.IsNullOrWhiteSpace(request.Permission) ? "push" : request.Permission;

        await _github.InviteCollaboratorToRepoAsync(request.Owner, request.Repository, username, permission);

        _log.LogInfo("Access", $"Assigned '{username}' to {request.Owner}/{request.Repository} with '{permission}' access.");

        return Ok();
    }

    // Access Levels page: change a still-pending invitation's level.
    // GitHub also emails the invitee about this automatically.
    [HttpPut("invitations/{invitationId}")]
    public async Task<IActionResult> UpdateInvitation(long invitationId, InviteCollaboratorUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change repository access") is IActionResult denied)
            return denied;

        var permission = string.IsNullOrWhiteSpace(request.Permission) ? "push" : request.Permission;

        await _github.UpdateInvitationAsync(invitationId, permission);

        _log.LogInfo("Access", $"Updated pending invitation {invitationId} to '{permission}' access.");

        return Ok(await _github.GetAccessEntriesAsync(forceRefresh: true));
    }

    [HttpDelete("invitations/{invitationId}")]
    public async Task<IActionResult> RemoveInvitation(long invitationId)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change repository access") is IActionResult denied)
            return denied;

        await _github.RemoveInvitationAsync(invitationId);

        _log.LogInfo("Access", $"Cancelled pending invitation {invitationId}.");

        return Ok(await _github.GetAccessEntriesAsync(forceRefresh: true));
    }

    [HttpPost("branches")]
    public async Task<IActionResult> CreateBranch(CreateBranchDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change repository access") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.SourceBranch))
            return BadRequest(new { message = "A branch name and a source branch are both required." });

        var name = request.Name.Trim();

        await _github.CreateBranchAsync(name, request.SourceBranch);
        await _settings.SaveBranchCreatorAsync(name, CurrentLogin() ?? "unknown");

        _log.LogInfo("Access", $"Created branch '{name}' from '{request.SourceBranch}'.");

        return Ok(await _github.GetBranches(forceRefresh: true));
    }

    // The creator (recorded when the branch was made through this portal)
    // or an admin can delete a branch — either is sufficient, so the
    // creator check short-circuits the admin gate entirely rather than
    // being an additional requirement on top of it.
    [HttpDelete("branches/{branch}")]
    public async Task<IActionResult> DeleteBranch(string branch)
    {
        var creators = await _settings.GetBranchCreatorsAsync();
        var isCreator = creators.TryGetValue(branch, out var creator)
            && !string.IsNullOrEmpty(creator)
            && string.Equals(creator, CurrentLogin(), StringComparison.OrdinalIgnoreCase);

        if (!isCreator && await AdminGate.DenyUnlessAdminAsync(this, _settings, "change repository access") is IActionResult denied)
            return denied;

        await _github.DeleteBranchAsync(branch);
        await _settings.RemoveBranchCreatorAsync(branch);
        await _settings.SaveBranchPurposeAsync(branch, string.Empty);

        _log.LogInfo("Access", $"Deleted branch '{branch}' (by {(isCreator ? "its creator" : "an admin")}).");

        return Ok(await _github.GetBranches(forceRefresh: true));
    }

    [HttpGet("branches")]
    public async Task<IActionResult> Branches([FromQuery] bool force = false)
    {
        var branches = await _github.GetBranches(force);
        var purposes = await _settings.GetBranchPurposesAsync();
        var creators = await _settings.GetBranchCreatorsAsync();

        var result = new List<BranchAccessDto>();

        foreach (var branch in branches)
        {
            var (restricted, allowedUsers) = await _github.GetBranchRestrictionAsync(branch.Name, force);

            result.Add(new BranchAccessDto
            {
                Name = branch.Name,
                Purpose = purposes.TryGetValue(branch.Name, out var purpose) ? purpose : string.Empty,
                Restricted = restricted,
                AllowedUsers = allowedUsers,
                Creator = creators.TryGetValue(branch.Name, out var creator) ? creator : string.Empty
            });
        }

        return Ok(result);
    }

    [HttpPut("branches/{branch}/purpose")]
    public async Task<IActionResult> SaveBranchPurpose(string branch, BranchPurposeUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change repository access") is IActionResult denied)
            return denied;

        await _settings.SaveBranchPurposeAsync(branch, request.Purpose ?? string.Empty);

        return Ok();
    }

    [HttpPut("branches/{branch}/restrictions")]
    public async Task<IActionResult> SetBranchRestriction(string branch, BranchRestrictionUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change repository access") is IActionResult denied)
            return denied;

        if (request.Usernames == null || request.Usernames.Count == 0)
            return BadRequest(new { message = "Select at least one user to restrict pushes to." });

        await _github.SetBranchRestrictionAsync(branch, request.Usernames);

        _log.LogInfo("Access", $"Restricted pushes on '{branch}' to: {string.Join(", ", request.Usernames)}.");

        return Ok();
    }

    [HttpDelete("branches/{branch}/restrictions")]
    public async Task<IActionResult> RemoveBranchRestriction(string branch)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change repository access") is IActionResult denied)
            return denied;

        await _github.RemoveBranchRestrictionAsync(branch);

        _log.LogInfo("Access", $"Removed push restriction on '{branch}'.");

        return Ok();
    }

    // The only claim AuthService ever issues for the GitHub username is
    // ClaimTypes.Name — null when unauthenticated (PAT-only/anonymous mode),
    // which is a legitimate outcome, not an error, wherever this is used.
    private string? CurrentLogin() => User.FindFirst(ClaimTypes.Name)?.Value;
}

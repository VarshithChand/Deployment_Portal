using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Organization membership management - list/change-role/remove. Listing
// is open to any active member (everyone can see who's on the team);
// mutating actions require members.manage. Role change/removal both
// refuse to leave an organization with zero Admins (see
// MembershipService.ChangeRoleAsync/RemoveMemberAsync).
[ApiController]
[Route("api/organizations/{orgId:guid}/members")]
public class OrganizationMembersController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly MembershipService _membership;
    private readonly OrgAuthorizationService _orgAuth;
    private readonly AuditLogService _auditLog;

    public OrganizationMembersController(
        SettingsService settings, MembershipService membership, OrgAuthorizationService orgAuth, AuditLogService auditLog)
    {
        _settings = settings;
        _membership = membership;
        _orgAuth = orgAuth;
        _auditLog = auditLog;
    }

    private IActionResult? DenyIfOrganizationsDisabled() =>
        _settings.GetDatabaseConnectionString() == null
            ? StatusCode(503, new { message = "Organizations aren't available - no database is configured for this deployment." })
            : null;

    [HttpGet]
    public async Task<IActionResult> List(Guid orgId)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var membershipRow = await _membership.GetActiveMembershipAsync(orgId, userId!);

        if (membershipRow == null)
            return StatusCode(403, new { message = "You are not a member of that organization." });

        var members = await _membership.ListMembersAsync(orgId);

        // Cross-references each member's opaque user id (a GitHub login /
        // "google:"+sub / "usr_"+hex - see PortalUserAccount.Id) against
        // the existing per-account JSON blob for display purposes only
        // (name/email/avatar), the same "never for authorization" caveat
        // RequireAuth.ResolveDisplayLoginAsync's own comment already
        // documents. This is the one place organization_members data and
        // SettingsService's JSON-blob accounts are joined - membership
        // itself never depends on it.
        var result = new List<object>();

        foreach (var member in members)
        {
            var account = await _settings.GetUserByIdAsync(member.UserId);

            result.Add(new
            {
                id = member.Id,
                userId = member.UserId,
                displayName = account?.DisplayName,
                email = account?.Email,
                avatarUrl = string.IsNullOrWhiteSpace(account?.AvatarBase64) ? null : $"data:image/png;base64,{account.AvatarBase64}",
                roleKey = member.RoleKey,
                roleDisplayName = member.RoleDisplayName,
                joinedAtUtc = member.JoinedAtUtc
            });
        }

        return Ok(new { members = result });
    }

    [HttpPatch("{memberId:guid}")]
    public async Task<IActionResult> ChangeRole(Guid orgId, Guid memberId, ChangeMemberRoleRequestDto request)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "members.manage", "change a member's role");
        if (gateDenied != null) return gateDenied;

        var (success, error) = await _membership.ChangeRoleAsync(orgId, memberId, request.RoleKey ?? string.Empty);

        if (!success)
            return Ok(new { success = false, message = error });

        await _auditLog.LogAsync(
            orgId, userId!, "member.role_changed", "organization_member", memberId.ToString(),
            new { newRoleKey = request.RoleKey }, HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }

    [HttpDelete("{memberId:guid}")]
    public async Task<IActionResult> Remove(Guid orgId, Guid memberId)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "members.manage", "remove this member");
        if (gateDenied != null) return gateDenied;

        var (success, error) = await _membership.RemoveMemberAsync(orgId, memberId);

        if (!success)
            return Ok(new { success = false, message = error });

        await _auditLog.LogAsync(
            orgId, userId!, "member.removed", "organization_member", memberId.ToString(),
            metadata: null, ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }
}

using DeploymentAPI.Configuration;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace DeploymentAPI.Controllers;

// Org-scoped invitation management (send/list-pending/revoke) - all
// members.manage-gated. See InvitationService for the token generation/
// hashing/accept design. Accept itself lives on InvitationAcceptController
// below - it's not org-scoped in the URL (the org is resolved server-side
// from the token itself), and needs to be reachable by someone who isn't a
// member of the org yet.
[ApiController]
[Route("api/organizations/{orgId:guid}/invitations")]
public class InvitationsController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly InvitationService _invitations;
    private readonly OrganizationService _organizations;
    private readonly MembershipService _membership;
    private readonly OrgAuthorizationService _orgAuth;
    private readonly IEmailService _email;
    private readonly IOptionsMonitor<GitHubOAuthSettings> _oauthOptions;
    private readonly AuditLogService _auditLog;

    public InvitationsController(
        SettingsService settings,
        InvitationService invitations,
        OrganizationService organizations,
        MembershipService membership,
        OrgAuthorizationService orgAuth,
        IEmailService email,
        IOptionsMonitor<GitHubOAuthSettings> oauthOptions,
        AuditLogService auditLog)
    {
        _settings = settings;
        _invitations = invitations;
        _organizations = organizations;
        _membership = membership;
        _orgAuth = orgAuth;
        _email = email;
        _oauthOptions = oauthOptions;
        _auditLog = auditLog;
    }

    private IActionResult? DenyIfOrganizationsDisabled() =>
        _settings.GetDatabaseConnectionString() == null
            ? StatusCode(503, new { message = "Organizations aren't available - no database is configured for this deployment." })
            : null;

    [HttpPost]
    public async Task<IActionResult> Create(Guid orgId, SendInvitationRequestDto request)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "members.manage", "invite members to this organization");
        if (gateDenied != null) return gateDenied;

        var (success, error, rawToken) = await _invitations.CreateAsync(
            orgId, userId!, request.Email ?? string.Empty, request.RoleKey ?? "read");

        if (!success)
            return Ok(new { success = false, message = error });

        var organization = await _organizations.GetOrganizationAsync(orgId);
        var inviterDisplayLogin = await RequireAuth.ResolveDisplayLoginAsync(
            userId!, User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value, _settings);

        var frontendUrl = _oauthOptions.CurrentValue.FrontendUrl.TrimEnd('/');
        var acceptUrl = $"{frontendUrl}/?invite={Uri.EscapeDataString(rawToken!)}";
        var roleDisplayName = request.RoleKey switch
        {
            "admin" => "Admin",
            "contributor" => "Contributor",
            _ => "Read"
        };

        var sendResult = await _email.SendOrganizationInviteEmailAsync(
            request.Email!.Trim(), inviterDisplayLogin, organization?.Name ?? "this organization", roleDisplayName, acceptUrl);

        if (!sendResult.Success)
            return Ok(new { success = false, message = "The invitation was created but the email couldn't be sent. Try resending it." });

        await _auditLog.LogAsync(
            orgId, userId!, "invitation.sent", "invitation", null,
            new { email = request.Email, roleKey = request.RoleKey }, HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }

    [HttpGet]
    public async Task<IActionResult> ListPending(Guid orgId)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "members.manage", "view pending invitations");
        if (gateDenied != null) return gateDenied;

        var pending = await _invitations.ListPendingAsync(orgId);

        return Ok(new
        {
            invitations = pending.Select(i => new
            {
                id = i.Id,
                email = i.Email,
                roleKey = i.RoleKey,
                roleDisplayName = i.RoleDisplayName,
                createdAtUtc = i.CreatedAtUtc,
                expiresAtUtc = i.ExpiresAtUtc
            })
        });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Revoke(Guid orgId, Guid id)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "members.manage", "revoke this invitation");
        if (gateDenied != null) return gateDenied;

        var revoked = await _invitations.RevokeAsync(orgId, id);

        if (!revoked)
            return NotFound(new { message = "Invitation not found or already used." });

        await _auditLog.LogAsync(
            orgId, userId!, "invitation.revoked", "invitation", id.ToString(),
            metadata: null, ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }
}

// Not org-scoped in the URL (see this file's own header comment) -
// reachable by any authenticated user, resolving the org purely from the
// (hashed, single-use) token itself.
[ApiController]
[Route("api/invitations")]
public class InvitationAcceptController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly InvitationService _invitations;
    private readonly OrganizationService _organizations;
    private readonly AuditLogService _auditLog;

    public InvitationAcceptController(
        SettingsService settings, InvitationService invitations, OrganizationService organizations, AuditLogService auditLog)
    {
        _settings = settings;
        _invitations = invitations;
        _organizations = organizations;
        _auditLog = auditLog;
    }

    [HttpPost("accept")]
    public async Task<IActionResult> Accept(AcceptInvitationRequestDto request)
    {
        if (_settings.GetDatabaseConnectionString() == null)
            return StatusCode(503, new { message = "Organizations aren't available - no database is configured for this deployment." });

        if (User.Identity?.IsAuthenticated != true)
        {
            return Ok(new
            {
                success = false,
                code = "SIGN_IN_REQUIRED",
                message = "Sign in or create an account first, then open this invitation link again."
            });
        }

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var userEmail = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value;

        if (string.IsNullOrWhiteSpace(userEmail))
            return Ok(new { success = false, message = "Unable to verify your account's email address." });

        var result = await _invitations.AcceptAsync(request.Token ?? string.Empty, userId!, userEmail);

        if (!result.Success)
        {
            return Ok(new
            {
                success = false,
                code = result.WrongEmail ? "WRONG_EMAIL" : "INVALID_INVITATION",
                message = result.Error
            });
        }

        var organization = await _organizations.GetOrganizationAsync(result.OrganizationId!.Value);

        await _auditLog.LogAsync(
            result.OrganizationId, userId!, "invitation.accepted", "organization_member", userId,
            new { roleKey = result.RoleKey }, HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new
        {
            success = true,
            organizationId = result.OrganizationId,
            organizationName = organization?.Name,
            roleKey = result.RoleKey
        });
    }
}

using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Organization-scoped credentials (Phase 2 of the Organizations/Roles/
// Permissions feature) - see OrgCredentialService for the storage/
// encryption design. Separate credentials.read/write/delete permissions,
// exactly as the plan requires: a Contributor with only credentials.use
// (checked separately, at deploy time - see DeploymentController) can
// trigger a deployment through one of these without ever passing any of
// the three gates here.
[ApiController]
[Route("api/organizations/{orgId:guid}/credentials")]
public class OrganizationCredentialsController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly OrgCredentialService _credentials;
    private readonly MembershipService _membership;
    private readonly OrgAuthorizationService _orgAuth;
    private readonly AuditLogService _auditLog;

    public OrganizationCredentialsController(
        SettingsService settings,
        OrgCredentialService credentials,
        MembershipService membership,
        OrgAuthorizationService orgAuth,
        AuditLogService auditLog)
    {
        _settings = settings;
        _credentials = credentials;
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

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "credentials.read", "view this organization's credentials");
        if (gateDenied != null) return gateDenied;

        return Ok(new { credentials = await _credentials.ListAsync(orgId) });
    }

    [HttpPost]
    public async Task<IActionResult> Create(Guid orgId, SaveOrganizationCredentialRequestDto request)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "credentials.write", "add a credential to this organization");
        if (gateDenied != null) return gateDenied;

        var (success, error, credential) = await _credentials.CreateAsync(orgId, userId!, request);

        if (!success)
            return Ok(new { success = false, message = error });

        await _auditLog.LogAsync(
            orgId, userId!, "credential.created", "organization_credential", credential!.Id.ToString(),
            new { credential.Provider, credential.Name }, HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true, credential });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid orgId, Guid id, SaveOrganizationCredentialRequestDto request)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "credentials.write", "update this organization's credential");
        if (gateDenied != null) return gateDenied;

        var updated = await _credentials.UpdateAsync(orgId, id, request);

        if (!updated)
            return NotFound(new { message = "Credential not found." });

        await _auditLog.LogAsync(
            orgId, userId!, "credential.updated", "organization_credential", id.ToString(),
            new { request.Name }, HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid orgId, Guid id)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "credentials.delete", "delete this organization's credential");
        if (gateDenied != null) return gateDenied;

        var deleted = await _credentials.DeleteAsync(orgId, id);

        if (!deleted)
            return NotFound(new { message = "Credential not found." });

        await _auditLog.LogAsync(
            orgId, userId!, "credential.deleted", "organization_credential", id.ToString(),
            metadata: null, ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }
}

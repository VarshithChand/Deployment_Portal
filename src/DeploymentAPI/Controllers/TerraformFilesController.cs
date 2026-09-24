using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Org-scoped Terraform config file storage/editing - see
// TerraformFileService's own header comment: storage and editing only, no
// execution. terraform.read/write-gated, same shape as
// OrganizationCredentialsController (route/gate pattern), one permission
// pair rather than credentials' four since a .tf file isn't a secret.
[ApiController]
[Route("api/organizations/{orgId:guid}/terraform-files")]
public class TerraformFilesController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly TerraformFileService _files;
    private readonly MembershipService _membership;
    private readonly OrgAuthorizationService _orgAuth;
    private readonly AuditLogService _auditLog;

    public TerraformFilesController(
        SettingsService settings,
        TerraformFileService files,
        MembershipService membership,
        OrgAuthorizationService orgAuth,
        AuditLogService auditLog)
    {
        _settings = settings;
        _files = files;
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
            this, _membership, _orgAuth, userId!, orgId, "terraform.read", "view this organization's Terraform files");
        if (gateDenied != null) return gateDenied;

        return Ok(new { files = await _files.ListAsync(orgId) });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid orgId, Guid id)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "terraform.read", "view this organization's Terraform files");
        if (gateDenied != null) return gateDenied;

        var file = await _files.GetAsync(orgId, id);

        if (file == null)
            return NotFound(new { message = "File not found." });

        return Ok(file);
    }

    [HttpPost]
    public async Task<IActionResult> Create(Guid orgId, CreateTerraformFileRequestDto request)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "terraform.write", "create a Terraform file in this organization");
        if (gateDenied != null) return gateDenied;

        var (success, error, file) = await _files.CreateAsync(orgId, userId!, request.FileName, request.Content);

        if (!success)
            return Ok(new { success = false, message = error });

        await _auditLog.LogAsync(
            orgId, userId!, "terraform_file.created", "terraform_file", file!.Id.ToString(),
            new { file.FileName }, HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true, file });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid orgId, Guid id, UpdateTerraformFileRequestDto request)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "terraform.write", "edit this organization's Terraform files");
        if (gateDenied != null) return gateDenied;

        var updated = await _files.UpdateAsync(orgId, id, userId!, request.Content);

        if (!updated)
            return NotFound(new { message = "File not found." });

        await _auditLog.LogAsync(
            orgId, userId!, "terraform_file.updated", "terraform_file", id.ToString(),
            metadata: null, ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

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
            this, _membership, _orgAuth, userId!, orgId, "terraform.write", "delete this organization's Terraform files");
        if (gateDenied != null) return gateDenied;

        var deleted = await _files.DeleteAsync(orgId, id);

        if (!deleted)
            return NotFound(new { message = "File not found." });

        await _auditLog.LogAsync(
            orgId, userId!, "terraform_file.deleted", "terraform_file", id.ToString(),
            metadata: null, ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }
}

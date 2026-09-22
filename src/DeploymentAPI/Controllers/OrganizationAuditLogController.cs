using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Settings > Organizations > Audit Logs - read-only, audit_logs.view-gated
// (Admin only in the seeded matrix - see OrganizationSchema). See
// AuditLogService for the persisted, Postgres-backed store this reads from,
// distinct from the pre-existing in-memory ActivityLogService.
[ApiController]
[Route("api/organizations/{orgId:guid}/audit-logs")]
public class OrganizationAuditLogController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly AuditLogService _auditLog;
    private readonly MembershipService _membership;
    private readonly OrgAuthorizationService _orgAuth;

    public OrganizationAuditLogController(
        SettingsService settings, AuditLogService auditLog, MembershipService membership, OrgAuthorizationService orgAuth)
    {
        _settings = settings;
        _auditLog = auditLog;
        _membership = membership;
        _orgAuth = orgAuth;
    }

    [HttpGet]
    public async Task<IActionResult> List(Guid orgId)
    {
        if (_settings.GetDatabaseConnectionString() == null)
            return StatusCode(503, new { message = "Organizations aren't available - no database is configured for this deployment." });

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, orgId, "audit_logs.view", "view this organization's audit log");
        if (gateDenied != null) return gateDenied;

        var entries = await _auditLog.ListAsync(orgId);

        return Ok(new
        {
            entries = entries.Select(e => new
            {
                id = e.Id,
                actorUserId = e.ActorUserId,
                action = e.Action,
                targetType = e.TargetType,
                targetId = e.TargetId,
                metadata = e.Metadata,
                ipAddress = e.IpAddress,
                createdAtUtc = e.CreatedAtUtc
            })
        });
    }
}

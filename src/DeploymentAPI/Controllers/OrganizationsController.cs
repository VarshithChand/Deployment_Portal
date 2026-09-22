using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Phase 1 of the Organizations/Roles/Permissions feature - list/create/
// view/update organizations. Every action requires RequireAuth.
// RequireUserId (same "just be logged in" pattern every other account-
// scoped controller already uses); List/Create need nothing more (create
// makes YOU the Admin of a brand new org - nothing to authorize against
// yet). Get requires active membership (any role can read). Update
// requires the organization.manage permission via OrgAuthGate - this is
// the Phase 1 smoke test that OrgAuthorizationService/OrgAuthGate
// correctly grant Admins and deny Contributors/Read.
[ApiController]
[Route("api/organizations")]
public class OrganizationsController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly OrganizationService _organizations;
    private readonly MembershipService _membership;
    private readonly OrgAuthorizationService _orgAuth;
    private readonly AuditLogService _auditLog;

    public OrganizationsController(
        SettingsService settings,
        OrganizationService organizations,
        MembershipService membership,
        OrgAuthorizationService orgAuth,
        AuditLogService auditLog)
    {
        _settings = settings;
        _organizations = organizations;
        _membership = membership;
        _orgAuth = orgAuth;
        _auditLog = auditLog;
    }

    // Organizations are a Postgres-required feature (no local-JSON-file
    // fallback - see OrganizationSchema's own header comment) - every
    // action here checks this first and returns a clean 503 rather than
    // letting MembershipService/OrganizationService throw when no
    // DATABASE_URL is configured.
    private IActionResult? DenyIfOrganizationsDisabled() =>
        _settings.GetDatabaseConnectionString() == null
            ? StatusCode(503, new { message = "Organizations aren't available - no database is configured for this deployment." })
            : null;

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        // Safety net for an account that somehow reaches here without
        // having gone through a login path that already calls this (the
        // real hook points are AccountAuthController.IssueSessionAsync and
        // OAuthLoginFinisher.FinishAsync) - idempotent, cheap, makes this
        // endpoint self-healing rather than depending on every login path
        // never missing the call.
        await _organizations.EnsureOwnsPersonalOrganizationAsync(userId!, null);

        var organizations = await _organizations.GetMyOrganizationsAsync(userId!);
        return Ok(new { organizations });
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateOrganizationRequestDto request)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var (success, error, organization) = await _organizations.CreateOrganizationAsync(
            userId!, request.Name, request.Slug, request.Description);

        if (!success)
            return Ok(new { success = false, message = error });

        await _auditLog.LogAsync(
            organization!.Id, userId!, "organization.created", "organization", organization.Id.ToString(),
            new { organization.Name, organization.Slug }, HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true, organization });
    }

    // Not org-scoped - the matrix is identical for every org (only system
    // roles exist today). Any authenticated user can view it; it describes
    // the roles themselves, not any particular org's data. The guid
    // constraint on Get below means "roles-matrix" never matches that
    // route, so this sibling literal route is unambiguous.
    [HttpGet("roles-matrix")]
    public async Task<IActionResult> RolesMatrix()
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (_, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var matrix = await _organizations.GetRolePermissionMatrixAsync();

        return Ok(new
        {
            roles = matrix.Select(r => new { roleKey = r.RoleKey, roleDisplayName = r.RoleDisplayName, permissions = r.PermissionKeys })
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var membershipRow = await _membership.GetActiveMembershipAsync(id, userId!);

        if (membershipRow == null)
            return StatusCode(403, new { message = "You are not a member of that organization." });

        var organization = await _organizations.GetOrganizationAsync(id);

        if (organization == null)
            return NotFound(new { message = "Organization not found." });

        var permissions = await _orgAuth.ResolveAsync(userId!, id);

        return Ok(new OrganizationDetailDto
        {
            Id = organization.Id,
            Name = organization.Name,
            Slug = organization.Slug,
            Description = organization.Description,
            AccountType = organization.AccountType,
            RoleKey = membershipRow.RoleKey,
            CreatedAtUtc = organization.CreatedAtUtc,
            Permissions = permissions.OrderBy(p => p, StringComparer.Ordinal).ToList()
        });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateOrganizationRequestDto request)
    {
        var disabled = DenyIfOrganizationsDisabled();
        if (disabled != null) return disabled;

        var (userId, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var gateDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, id, "organization.manage", "update this organization");

        if (gateDenied != null) return gateDenied;

        var updated = await _organizations.UpdateOrganizationAsync(id, request.Name, request.Description);

        if (!updated)
            return NotFound(new { message = "Organization not found." });

        await _auditLog.LogAsync(
            id, userId!, "organization.updated", "organization", id.ToString(),
            new { request.Name, request.Description }, HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(new { success = true });
    }
}

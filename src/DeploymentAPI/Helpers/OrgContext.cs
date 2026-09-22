using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Helpers;

// Resolves "which organization is this request acting within" from the
// X-Organization-Id header - mirrors the existing X-Session-Id CSRF-header
// convention (see AdminGate.HasSessionHeader). Missing header or the
// literal "personal" is the zero-cost default path: no DB lookup at all,
// identical to how every existing per-user endpoint already behaves today
// (see RequireAuth.RequireUserId) - this is what keeps Phase 2+'s broadened
// org-permission enforcement from being able to regress Personal-mode
// behavior at all. A real GUID is validated against the caller's OWN
// organization_members rows before being honored - never trusted blindly
// (see the plan's tenant-isolation decision).
//
// This is for cross-cutting RESOURCE actions (deploy, org-scoped
// credentials) where the org is ambient request context, not part of the
// URL. Org-MANAGEMENT actions where the org id is already in the route
// (e.g. GET/PUT /api/organizations/{id}) resolve membership directly
// against that route id instead - see OrganizationsController.
public static class OrgContext
{
    public const string PersonalSentinel = "personal";

    // Pure - takes the raw header value, not HttpContext, specifically so
    // this classification rule is unit-testable without a live request at
    // all (see OrgAuthorizationService.ApplyOverrides' identical
    // reasoning). DeploymentController/CloudServicesController/
    // AzureAppServiceController currently duplicate this same three-way
    // check inline rather than calling it - a real, still-open dedup
    // opportunity flagged here rather than silently left unmentioned, not
    // retrofitted in this pass to avoid re-touching already-shipped,
    // already-verified controllers just for the sake of it.
    public static ParsedOrganizationHeader ParseHeader(string? header)
    {
        if (string.IsNullOrWhiteSpace(header) || string.Equals(header, PersonalSentinel, StringComparison.OrdinalIgnoreCase))
            return new ParsedOrganizationHeader(OrganizationHeaderKind.Personal, null);

        return Guid.TryParse(header, out var organizationId)
            ? new ParsedOrganizationHeader(OrganizationHeaderKind.Organization, organizationId)
            : new ParsedOrganizationHeader(OrganizationHeaderKind.Invalid, null);
    }

    public static async Task<(OrgContextResult? Context, IActionResult? Denied)> ResolveAsync(
        ControllerBase controller, MembershipService membership, string userId)
    {
        var parsed = ParseHeader(controller.Request.Headers["X-Organization-Id"].ToString());

        if (parsed.Kind == OrganizationHeaderKind.Personal)
            return (OrgContextResult.Personal(), null);

        if (parsed.Kind == OrganizationHeaderKind.Invalid)
            return (null, controller.StatusCode(400, new { message = "Invalid X-Organization-Id header." }));

        var row = await membership.GetActiveMembershipAsync(parsed.OrganizationId!.Value, userId);

        if (row == null)
            return (null, controller.StatusCode(403, new { message = "You are not a member of that organization." }));

        return (OrgContextResult.Organization(parsed.OrganizationId.Value, row), null);
    }
}

public enum OrganizationHeaderKind { Personal, Invalid, Organization }

public readonly record struct ParsedOrganizationHeader(OrganizationHeaderKind Kind, Guid? OrganizationId);

public class OrgContextResult
{
    public bool IsPersonal { get; private init; }

    public Guid? OrganizationId { get; private init; }

    public Guid? MembershipId { get; private init; }

    public string? RoleKey { get; private init; }

    public static OrgContextResult Personal() => new() { IsPersonal = true };

    public static OrgContextResult Organization(Guid organizationId, MembershipRow row) => new()
    {
        IsPersonal = false,
        OrganizationId = organizationId,
        MembershipId = row.Id,
        RoleKey = row.RoleKey
    };
}

namespace DeploymentAPI.DTOs;

// One row of "my organizations" (OrganizationsController.List) - includes
// the caller's own role in that org so the frontend switcher can show it
// without a second round trip. AccountType is "personal" | "organization"
// (see OrganizationSchema's CHECK constraint) - the frontend uses this to
// decide whether to even show a Members/Invite affordance for this org
// (a Personal org never has one).
public class OrganizationDto
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Slug { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string AccountType { get; set; } = string.Empty;

    public string RoleKey { get; set; } = string.Empty;

    public string RoleDisplayName { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; }
}

// The detail view (OrganizationsController.Get) - same fields as the list
// row plus the caller's full resolved permission set for this org, which
// is the Phase 1 smoke test for OrgAuthGate/OrgAuthorizationService: if
// this list is wrong, everything built on top of it is wrong too.
public class OrganizationDetailDto : OrganizationDto
{
    public List<string> Permissions { get; set; } = new();
}

public class CreateOrganizationRequestDto
{
    public string? Name { get; set; }

    // Optional - server generates one from Name when omitted (see
    // OrganizationService.GenerateUniqueSlugAsync).
    public string? Slug { get; set; }

    public string? Description { get; set; }
}

public class UpdateOrganizationRequestDto
{
    public string? Name { get; set; }

    public string? Description { get; set; }
}

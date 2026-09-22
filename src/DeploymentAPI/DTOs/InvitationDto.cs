namespace DeploymentAPI.DTOs;

public class SendInvitationRequestDto
{
    public string? Email { get; set; }

    // "admin" | "contributor" | "read" - see OrganizationSchema's seeded
    // system roles.
    public string? RoleKey { get; set; }
}

public class AcceptInvitationRequestDto
{
    public string? Token { get; set; }
}

public class ChangeMemberRoleRequestDto
{
    public string? RoleKey { get; set; }
}

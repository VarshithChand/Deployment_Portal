namespace DeploymentAPI.DTOs;

public class SignupRequestDto
{
    public string Email { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;

    public string? DisplayName { get; set; }

    // "personal" (default when omitted) | "organization" - see
    // AccountAuthController.SignUp. A Personal account needs nothing else
    // here (it gets its own synthetic Personal org automatically on first
    // login, same as every account - see OrganizationService.
    // EnsureOwnsPersonalOrganizationAsync); choosing "organization" also
    // requires OrganizationName and creates a REAL organization with this
    // account as its Admin, in addition to that same synthetic Personal org.
    public string? AccountType { get; set; }

    public string? OrganizationName { get; set; }
}

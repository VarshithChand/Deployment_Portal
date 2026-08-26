namespace DeploymentAPI.DTOs;

// Email equivalent of AdminUsernamesUpdateDto - see
// SettingsService.SaveAdminEmailsAsync.
public class AdminEmailsUpdateDto
{
    public List<string> AdminEmails { get; set; } = new();

    public List<string> ViewerEmails { get; set; } = new();
}

public class SuperAdminEmailUpdateDto
{
    public string Email { get; set; } = string.Empty;
}

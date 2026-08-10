namespace DeploymentAPI.DTOs;

public class CreateAuditLogRequest
{
    public string Actor { get; set; } = string.Empty;

    public string Action { get; set; } = string.Empty;

    public string Resource { get; set; } = string.Empty;

    public string Outcome { get; set; } = "Success";
}

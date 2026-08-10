namespace DeploymentAPI.DTOs;

public class AuditLogEntry
{
    public int Id { get; set; }

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    public string Actor { get; set; } = string.Empty;

    public string Action { get; set; } = string.Empty;

    public string Resource { get; set; } = string.Empty;

    // Success | Failure
    public string Outcome { get; set; } = "Success";
}

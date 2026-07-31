namespace DeploymentAPI.DTOs;

// Deliberately never carries the username/password half of the
// connection string - Host/Port/Database are enough to show "this is
// genuinely talking to a real database" on the Smoke Tests page without
// exposing a credential.
public class DatabaseHealthDto
{
    public bool Healthy { get; set; }

    public string Mode { get; set; } = "local-file";

    public double? ResponseTimeMs { get; set; }

    public string? Host { get; set; }

    public int? Port { get; set; }

    public string? Database { get; set; }

    public string? Error { get; set; }
}

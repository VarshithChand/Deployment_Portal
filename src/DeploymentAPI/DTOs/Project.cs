namespace DeploymentAPI.DTOs;

public class Project
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    // Planning | Active | OnHold | Completed
    public string Status { get; set; } = "Planning";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

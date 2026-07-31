namespace DeploymentAPI.DTOs;

public class WorkflowJobDto
{
    public string Name { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string? Conclusion { get; set; }

    public string HtmlUrl { get; set; } = string.Empty;
}

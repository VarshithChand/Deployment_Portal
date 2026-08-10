namespace DeploymentAPI.DTOs;

public class CreateTaskRequest
{
    public string Title { get; set; } = string.Empty;

    public string Assignee { get; set; } = string.Empty;

    public DateTime? DueDate { get; set; }
}

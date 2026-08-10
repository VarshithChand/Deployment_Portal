namespace DeploymentAPI.DTOs;

public class UpdateTaskRequest
{
    public string? Title { get; set; }

    public string? Assignee { get; set; }

    public string? Status { get; set; }

    public DateTime? DueDate { get; set; }
}

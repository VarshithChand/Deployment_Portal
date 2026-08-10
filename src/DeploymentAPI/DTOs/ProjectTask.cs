namespace DeploymentAPI.DTOs;

// Named ProjectTask, not Task, to avoid colliding with System.Threading.Tasks.Task.
public class ProjectTask
{
    public int Id { get; set; }

    public int ProjectId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string Assignee { get; set; } = string.Empty;

    // Todo | InProgress | Done
    public string Status { get; set; } = "Todo";

    public DateTime? DueDate { get; set; }
}

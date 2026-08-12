namespace DeploymentAPI.DTOs;

public class WorkflowDto
{
    public long Id { get; set; }

    // GitHub's own sequential per-workflow counter (the "#184" you see in
    // the Actions UI) - not this app's invention, straight from the
    // "run_number" field the runs API already returns.
    public long RunNumber { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Branch { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string Conclusion { get; set; } = string.Empty;

    public string TriggeredBy { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public string CommitMessage { get; set; } = string.Empty;

    public string CommitSha { get; set; } = string.Empty;

    public string HtmlUrl { get; set; } = string.Empty;
}
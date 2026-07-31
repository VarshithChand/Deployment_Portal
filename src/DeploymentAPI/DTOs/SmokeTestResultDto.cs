namespace DeploymentAPI.DTOs;

public class SmokeTestResultDto
{
    public long? RunId { get; set; }

    // "not_run" | "queued" | "in_progress" | "completed" | "error"
    public string Status { get; set; } = "not_run";

    // The overall run's conclusion once completed ("success"/"failure"/...),
    // or - only when Status is "error" - a friendly message describing why
    // triggering the workflow itself failed.
    public string? Conclusion { get; set; }

    public string? HtmlUrl { get; set; }

    public DateTime? CreatedAt { get; set; }

    public List<SmokeTestJobDto> Jobs { get; set; } = new();
}

public class SmokeTestJobDto
{
    public string Name { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string? Conclusion { get; set; }

    public string? HtmlUrl { get; set; }

    public DateTime? StartedAt { get; set; }

    public DateTime? CompletedAt { get; set; }
}

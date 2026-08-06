namespace DeploymentAPI.DTOs;

// One entry per non-successful job within a run — what History's row
// expansion shows so "what actually went wrong" doesn't require digging
// through raw logs on GitHub. Messages come from GitHub's own Check Run
// Annotations API (the same "::error::"-style messages GitHub's own UI
// highlights in red), not scraped log text.
public class WorkflowRunErrorDto
{
    public string JobName { get; set; } = string.Empty;

    public string? Conclusion { get; set; }

    public string? FailedStep { get; set; }

    public string HtmlUrl { get; set; } = string.Empty;

    public List<string> Messages { get; set; } = new();
}

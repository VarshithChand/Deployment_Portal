namespace DeploymentAPI.DTOs;

// CodeQL results for the Code Quality hub's CodeQL sub-page - deliberately
// no dedicated credential of its own (unlike Sonar): every page in this
// portal already requires a connected GitHub repo/token before it's
// reachable at all (see RequireGitHubSetup), so this simply reuses that
// same session token via GitHubApiService, the same way Artifacts/Analytics/
// History already do. Configured is always true here for that reason -
// Error covers the two real failure modes instead: code scanning isn't
// enabled for this repo (GitHub returns 404), or the token is missing the
// security_events/repo scope code-scanning/alerts needs (403).
public class CodeQlAlertDto
{
    public int Number { get; set; }
    public string RuleId { get; set; } = string.Empty;
    public string RuleDescription { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public int Line { get; set; }
    public string HtmlUrl { get; set; } = string.Empty;
    public DateTime? CreatedAt { get; set; }
}

public class CodeQlOverviewDto
{
    public bool Configured { get; set; } = true;
    public string? Error { get; set; }
    public int ErrorCount { get; set; }
    public int WarningCount { get; set; }
    public int NoteCount { get; set; }
    public List<CodeQlAlertDto> Alerts { get; set; } = new();
}

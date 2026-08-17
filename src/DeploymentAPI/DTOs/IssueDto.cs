namespace DeploymentAPI.DTOs;

public class CreateIssueRequestDto
{
    public string Title { get; set; } = string.Empty;

    public string? Body { get; set; }

    // Comma-separated in the request the same way this app already accepts
    // multi-value text fields elsewhere (e.g. the Admin Allowlist) - split
    // server-side rather than asking the frontend to send an array for
    // what's really just a handful of short labels.
    public string? Labels { get; set; }
}

public class IssueDto
{
    public int Number { get; set; }

    public string Title { get; set; } = string.Empty;

    public string HtmlUrl { get; set; } = string.Empty;
}

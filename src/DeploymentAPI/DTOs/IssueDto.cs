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

    public string? Assignees { get; set; }

    public int? Milestone { get; set; }

    // A ProjectsV2 GraphQL node ID (see GitHubApiService.GetProjectsAsync),
    // not a REST-style numeric ID - GitHub's classic Projects and
    // ProjectsV2 use entirely different ID schemes, and only the GraphQL
    // node ID works with the addProjectV2ItemById mutation this triggers.
    public string? ProjectId { get; set; }
}

public class IssueDto
{
    public int Number { get; set; }

    public string Title { get; set; } = string.Empty;

    public string HtmlUrl { get; set; } = string.Empty;

    // GraphQL node ID (GitHub's "global ID"), distinct from Number above
    // (REST's per-repo issue number) - never returned to the frontend
    // beyond this DTO's use as AddIssueToProjectAsync's input; there's no
    // reason for the browser to know or care about it.
    public string? NodeId { get; set; }

    // Set only when ProjectId was requested but adding the issue to that
    // project failed (most commonly: the connected token lacks the
    // "project" scope) - the issue itself was still created successfully
    // either way, this is purely informational so the caller isn't left
    // wondering why it didn't show up on the board.
    public string? ProjectWarning { get; set; }
}

public class MilestoneDto
{
    public int Number { get; set; }

    public string Title { get; set; } = string.Empty;
}

public class ProjectDto
{
    // GraphQL node ID - see CreateIssueRequestDto.ProjectId's own comment.
    public string Id { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public int Number { get; set; }
}

public class AssignableUserDto
{
    public string Login { get; set; } = string.Empty;

    public string AvatarUrl { get; set; } = string.Empty;
}

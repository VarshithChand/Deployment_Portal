namespace DeploymentAPI.DTOs;

public class UserRepoSummaryDto
{
    public string Owner { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public bool Private { get; set; }

    public int Stars { get; set; }

    public string DefaultBranch { get; set; } = string.Empty;

    public string HtmlUrl { get; set; } = string.Empty;

    public DateTime? UpdatedAt { get; set; }
}

public class UserRepositoriesPreviewDto
{
    public bool Found { get; set; }

    public string? Error { get; set; }

    public string Username { get; set; } = string.Empty;

    public List<UserRepoSummaryDto> Repositories { get; set; } = new();
}

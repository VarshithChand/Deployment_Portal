namespace DeploymentAPI.DTOs;

// AWS CodeCommit only - Azure DevOps' DTOs moved to AzureDevOpsDtos.cs (it
// grew from a single repos-browsing page into four: Branches/Pipelines/
// Build Artifacts/Package Feeds, so it earned its own file). CodeCommit has
// no DTOs of its own beyond what's below - it reuses this session's own
// UserAwsCredentials (the same one ECR/EC2/ECS/RDS/Lambda already use), so
// there's nothing new to store.

public class CodeCommitRepositoryDto
{
    public string Name { get; set; } = string.Empty;
    public string Id { get; set; } = string.Empty;
    public string DefaultBranch { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string CloneUrlHttp { get; set; } = string.Empty;
    public DateTime? LastModified { get; set; }
}

public class CodeCommitRepositoryListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<CodeCommitRepositoryDto> Repositories { get; set; } = new();
}

public class CodeCommitBranchListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<string> Branches { get; set; } = new();
}

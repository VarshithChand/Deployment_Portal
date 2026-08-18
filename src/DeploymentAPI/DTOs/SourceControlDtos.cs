namespace DeploymentAPI.DTOs;

// Azure Repos (Azure DevOps) - portal-wide, shared credential (Organization
// + Personal Access Token), same reasoning as Docker Hub/GHCR/GitLab
// Registry/JFrog/Harbor/Nexus in the Container Registry hub: one admin
// connects the org once, every visitor then browses the same repositories.
// Reuses UserPaasCredentials(Token, AccountId)'s existing generic shape
// (AccountId holds the organization name) rather than a new DTO, since
// it's the exact same (identifier, secret-token) pair those providers
// already use. Deliberately NOT the same credential as this app's existing
// session-scoped Azure App Registration (UserAzureCredentials, used for
// ACR/Web App status) - Azure DevOps' REST API authenticates with a PAT,
// not an AAD app-only token, a genuinely different auth system from Azure
// Resource Manager despite both being "Azure."
//
// AWS CodeCommit has no DTOs here at all - it reuses this session's own
// UserAwsCredentials (the same one ECR/EC2/EC S/RDS/Lambda already use),
// so there's nothing new to store.

public class AzureReposCredentialsUpdateDto
{
    public string Organization { get; set; } = string.Empty;
    public string Token { get; set; } = string.Empty;
}

public class AzureReposStatusDto
{
    public bool Configured { get; set; }
    public string Organization { get; set; } = string.Empty;
}

public class AzureReposRepositoryDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ProjectName { get; set; } = string.Empty;
    public string DefaultBranch { get; set; } = string.Empty;
    public string WebUrl { get; set; } = string.Empty;
    public long? SizeBytes { get; set; }
}

public class AzureReposRepositoryListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureReposRepositoryDto> Repositories { get; set; } = new();
}

public class AzureReposBranchDto
{
    public string Name { get; set; } = string.Empty;
    public string ObjectId { get; set; } = string.Empty;
}

public class AzureReposBranchListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureReposBranchDto> Branches { get; set; } = new();
}

// AWS CodeCommit
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

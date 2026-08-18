namespace DeploymentAPI.DTOs;

// Azure DevOps - session-scoped credential (Organization + Personal Access
// Token), same isolation as every other Source Control/Container Registry
// credential in this app (see SettingsService.SaveUserPaasCredentialsAsync).
// Reuses UserPaasCredentials(Token, AccountId)'s existing generic shape
// (AccountId holds the organization name) rather than a new DTO - it's the
// exact same (identifier, secret-token) pair those providers already use.
// Deliberately NOT the same credential as this app's existing session-scoped
// Azure App Registration (UserAzureCredentials, used for ACR/Web App status)
// - Azure DevOps' REST API authenticates with a PAT over plain HTTP Basic
// auth, not an AAD app-only token, a genuinely different auth system from
// Azure Resource Manager despite both being "Azure."
//
// One credential now powers four sidebar sub-pages (Branches/Pipelines/
// Build Artifacts/Package Feeds), not just repo browsing - previously named
// "Azure Repos" when it only covered the first of these.

public class AzureDevOpsCredentialsUpdateDto
{
    public string Organization { get; set; } = string.Empty;
    public string Token { get; set; } = string.Empty;
}

public class AzureDevOpsStatusDto
{
    public bool Configured { get; set; }
    public string Organization { get; set; } = string.Empty;
}

// Projects - Azure DevOps scopes Pipelines and (optionally) Feeds to one
// project at a time, unlike the org-wide Git repositories list below, so
// the Pipelines and Build Artifacts pages both start with a project picker
// built from this list.
public class AzureDevOpsProjectDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}

public class AzureDevOpsProjectListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureDevOpsProjectDto> Projects { get; set; } = new();
}

// Branches page - repositories (org-wide, no project picker needed - the
// list endpoint itself spans every project) -> branches (project-scoped,
// using the ProjectName already carried on each repository).
public class AzureDevOpsRepositoryDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ProjectName { get; set; } = string.Empty;
    public string DefaultBranch { get; set; } = string.Empty;
    public string WebUrl { get; set; } = string.Empty;
    public long? SizeBytes { get; set; }
}

public class AzureDevOpsRepositoryListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureDevOpsRepositoryDto> Repositories { get; set; } = new();
}

public class AzureDevOpsBranchDto
{
    public string Name { get; set; } = string.Empty;
    public string ObjectId { get; set; } = string.Empty;
}

public class AzureDevOpsBranchListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureDevOpsBranchDto> Branches { get; set; } = new();
}

// Pipelines page - project -> pipeline -> run history. View-only by explicit
// request (list pipelines and recent run status/result), no trigger action -
// a real "start a run" flow is a separate, bigger feature with its own
// confirmation/permission surface, same reasoning that kept ECR/ACR/Harbor
// etc. all read-only browsers rather than mutating actions.
public class AzureDevOpsPipelineDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Folder { get; set; } = string.Empty;
}

public class AzureDevOpsPipelineListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureDevOpsPipelineDto> Pipelines { get; set; } = new();
}

// State is "inProgress"/"completed"/"canceling"/"unknown"; Result is only
// populated once State is "completed" - "succeeded"/"failed"/"canceled"/
// "partiallySucceeded". Kept as plain strings (not an enum) since the
// frontend only ever displays them as a status pill, the same convention
// this app already uses for GitHub Actions run status elsewhere.
public class AzureDevOpsRunDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string? Result { get; set; }
    public DateTime? CreatedDate { get; set; }
    public DateTime? FinishedDate { get; set; }
    public string WebUrl { get; set; } = string.Empty;
}

public class AzureDevOpsRunListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureDevOpsRunDto> Runs { get; set; } = new();
}

// Build Artifacts page - project -> pipeline -> run -> artifacts. A
// pipeline run's ID is the same ID the classic Build API uses internally
// (Azure Pipelines runs on top of the Build service), so artifacts are
// fetched via .../build/builds/{runId}/artifacts?api-version=7.1 - the only
// endpoint that exposes them, there is no equivalent under the newer
// Pipelines API surface.
public class AzureDevOpsArtifactDto
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string DownloadUrl { get; set; } = string.Empty;
}

public class AzureDevOpsArtifactListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureDevOpsArtifactDto> Artifacts { get; set; } = new();
}

// Package Feeds page - feeds (org-wide, no project picker needed - same
// reasoning as repositories above) -> packages -> versions. Uses the
// separate feeds.dev.azure.com host, not dev.azure.com - Azure Artifacts'
// Feed Management/Packaging APIs are hosted independently of the rest of
// the Azure DevOps REST surface.
public class AzureDevOpsFeedDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public class AzureDevOpsFeedListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureDevOpsFeedDto> Feeds { get; set; } = new();
}

public class AzureDevOpsPackageDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ProtocolType { get; set; } = string.Empty;
}

public class AzureDevOpsPackageListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureDevOpsPackageDto> Packages { get; set; } = new();
}

public class AzureDevOpsPackageVersionDto
{
    public string Version { get; set; } = string.Empty;
    public bool IsLatest { get; set; }
    public DateTime? PublishDate { get; set; }
}

public class AzureDevOpsPackageVersionListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureDevOpsPackageVersionDto> Versions { get; set; } = new();
}

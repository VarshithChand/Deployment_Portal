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

// Create/delete a branch - session-scoped, self-service, same posture as
// RunPipelineAsync below (the calling session's own credential and its
// real permission on Azure DevOps' side is the auth boundary). Both are
// really just one Git ref update, batched the way Azure DevOps' own Refs
// API expects: create sets oldObjectId to all-zeros ("this ref doesn't
// exist yet") and newObjectId to the source commit to branch from; delete
// is the mirror image (oldObjectId is the branch's current commit,
// newObjectId is all-zeros) - the same old/new-object-id contract GitHub's
// own Git References API uses, not something invented for this app.
public class AzureDevOpsCreateBranchDto
{
    public string NewBranchName { get; set; } = string.Empty;
    public string SourceObjectId { get; set; } = string.Empty;
}

// Generic Success/Error/Message result for the Git mutating actions below
// (branch create/delete, PR approve/complete) - same shape as
// AzureDevOpsRunTriggerResultDto minus the run-specific RunId field, kept
// as its own type since "a git ref action succeeded" and "a pipeline run
// started" are different enough concepts to warrant not overloading one
// DTO with an unused field for whichever action didn't produce it.
public class AzureDevOpsGitActionResultDto
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public string? Message { get; set; }
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

// One pipeline's own repository link - the basic list endpoint above
// doesn't carry this (see GetPipelinesAsync's own comment), only the
// single-pipeline GET does. Resolved on demand right before showing a
// branch picker for that specific pipeline, not fetched for every
// pipeline up front.
public class AzureDevOpsPipelineDetailDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? RepositoryId { get; set; }
    public string? RepositoryName { get; set; }
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

// Triggering a new run - session-scoped, self-service, no AdminGate, same
// posture this app already uses for other real mutating actions against a
// visitor's own connected cloud credential (see CloudServiceManagementService.
// CreateEcrRepositoryAsync's own comment: the credential's real permission
// on the provider's own side is the auth boundary, not a portal-side gate).
// Shape mirrors CloudServiceActionResultDto (Success/Error/Message), plus
// the new run's ID so the frontend can refresh straight to it. Branch is
// optional on the request - blank runs against the pipeline's own
// configured default branch, same as leaving it out of the request body
// entirely would.
public class AzureDevOpsRunPipelineRequestDto
{
    public string? Branch { get; set; }
}

public class AzureDevOpsRunTriggerResultDto
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public string? Message { get; set; }
    public int? RunId { get; set; }
}

// Build Artifacts page - project -> pipeline -> latest run's artifacts
// directly (no separate "pick a run" step - see GetLatestArtifactsAsync's
// own comment on why). A pipeline run's ID is the same ID the classic
// Build API uses internally (Azure Pipelines runs on top of the Build
// service), so artifacts are fetched via
// .../build/builds/{runId}/artifacts?api-version=7.1 - the only endpoint
// that exposes them, there is no equivalent under the newer Pipelines API
// surface. Location is the artifact's own internal container/file path
// (Azure DevOps' "resource.data" field) - shown alongside DownloadUrl in
// the detail view since they answer two different questions ("where do I
// click to get this" vs. "where does Azure DevOps actually store it").
public class AzureDevOpsArtifactDto
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string DownloadUrl { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
}

public class AzureDevOpsArtifactListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public int? RunId { get; set; }
    public string? RunName { get; set; }
    public List<AzureDevOpsArtifactDto> Artifacts { get; set; } = new();
}

// Pull Requests page - project-wide (Azure DevOps' own list endpoint spans
// every repository in the project at once, so no separate repo picker is
// needed the way Pipelines/Build Artifacts need a pipeline picker).
// RepositoryId is carried per-PR since approve/complete are both
// repo-scoped routes on Azure DevOps' side even though the list itself
// isn't. LastMergeSourceCommitId is carried specifically so Complete can
// send it straight back without a second fetch - Azure DevOps' own
// complete call requires it to match the PR's current source commit
// (optimistic concurrency, the same reason CompletePullRequestAsync
// re-reads it fresh rather than trusting a stale value - see its own
// comment).
public class AzureDevOpsPullRequestDto
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string SourceBranch { get; set; } = string.Empty;
    public string TargetBranch { get; set; } = string.Empty;
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime? CreationDate { get; set; }
    public string RepositoryId { get; set; } = string.Empty;
    public string RepositoryName { get; set; } = string.Empty;
    public string WebUrl { get; set; } = string.Empty;
}

public class AzureDevOpsPullRequestListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<AzureDevOpsPullRequestDto> PullRequests { get; set; } = new();
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

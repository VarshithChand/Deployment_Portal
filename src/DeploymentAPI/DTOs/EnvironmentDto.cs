namespace DeploymentAPI.DTOs;

// One admin-configured deployment target — "Production", "Staging", etc.
// Tied to a CD/release workflow (there's no GitHub Environment/Deployment
// record backing this; it's a portal-level concept) so its latest commit
// and artifacts can be resolved from that workflow's most recent run.
public class EnvironmentDefinitionDto
{
    public string Name { get; set; } = string.Empty;

    public string WorkflowName { get; set; } = string.Empty;

    // "aws" | "azure" | "render" | "cloudflare" | "netlify" | "vercel" |
    // "none" — "none" until an admin explicitly sets one, or until
    // DeploymentTargetDetector finds real evidence in WorkflowName's own
    // YAML (see EnvironmentsController.BuildSummaryAsync). Netlify/Vercel
    // are never auto-detected (DeploymentTargetDetector only recognizes
    // aws/azure/render/cloudflare evidence) - admin-picked or hand-typed
    // only.
    public string CloudProvider { get; set; } = "none";

    // AWS target — only meaningful when CloudProvider == "aws".
    public string? AwsRegion { get; set; }

    public string? EcsCluster { get; set; }

    public string? EcsService { get; set; }

    public string? EcrRepository { get; set; }

    // Azure target — only meaningful when CloudProvider == "azure".
    public string? AzureSubscriptionId { get; set; }

    public string? AzureResourceGroup { get; set; }

    public string? AzureWebAppName { get; set; }

    // Render target — only meaningful when CloudProvider == "render".
    public string? RenderServiceId { get; set; }

    // Cloudflare target — only meaningful when CloudProvider == "cloudflare".
    public string? CloudflareAccountId { get; set; }

    public string? CloudflareProjectName { get; set; }

    // Netlify target — only meaningful when CloudProvider == "netlify".
    public string? NetlifySiteId { get; set; }

    // Vercel target — only meaningful when CloudProvider == "vercel".
    public string? VercelProjectId { get; set; }
}

public class EnvironmentDefinitionsUpdateDto
{
    public List<EnvironmentDefinitionDto> Environments { get; set; } = new();
}

// A definition plus its latest resolved deployment (from WorkflowName's
// most recent run) — what the Dashboard card and the Environments list show.
public class EnvironmentSummaryDto : EnvironmentDefinitionDto
{
    public long? LatestRunId { get; set; }

    public string? CommitSha { get; set; }

    public string? CommitMessage { get; set; }

    public string? Branch { get; set; }

    public string? Status { get; set; }

    public string? Conclusion { get; set; }

    public DateTime? DeployedAt { get; set; }

    public string? HtmlUrl { get; set; }

    // True when CloudProvider/its target fields above came from
    // DeploymentTargetDetector reading the workflow's own YAML rather than
    // from an explicit admin save - lets the frontend show "(detected from
    // pipeline)" instead of implying someone configured it by hand.
    public bool AutoDetected { get; set; }

    // Same evidence lines DetectTarget already returns to the admin editor
    // - carried through here too so the Dashboard/Environments views can
    // show WHY a target was auto-detected, not just that it was.
    public List<string> DetectionEvidence { get; set; } = new();
}

public class EnvironmentArtifactDto
{
    public long Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public long Size { get; set; }

    public bool Expired { get; set; }

    public DateTime CreatedAt { get; set; }

    public string DownloadUrl { get; set; } = string.Empty;
}

// What the Environment detail view loads on open — everything the summary
// has, plus the artifacts GitHub Actions attached to that same run.
public class EnvironmentDetailDto : EnvironmentSummaryDto
{
    public List<EnvironmentArtifactDto> Artifacts { get; set; } = new();
}

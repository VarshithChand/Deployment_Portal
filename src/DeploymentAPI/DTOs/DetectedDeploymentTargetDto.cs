namespace DeploymentAPI.DTOs;

// What DeploymentTargetDetector found by actually reading a CD workflow's
// YAML — the real answer to "what is this pipeline deploying to," rather
// than whatever an admin remembered to type into Settings > Environments.
public class DetectedDeploymentTargetDto
{
    public string CloudProvider { get; set; } = "none";

    public string? AwsRegion { get; set; }

    public string? EcsCluster { get; set; }

    public string? EcsService { get; set; }

    public string? EcrRepository { get; set; }

    public string? AzureResourceGroup { get; set; }

    public string? AzureWebAppName { get; set; }

    // Render — extracted from a deploy-hook URL (api.render.com/deploy/srv-...)
    // or a "service-id"/"--service-id" value passed to a Render deploy step.
    public string? RenderServiceId { get; set; }

    // Cloudflare — extracted from cloudflare/wrangler-action's or
    // cloudflare/pages-action's "with:" block, or a raw wrangler CLI call's
    // --project-name flag.
    public string? CloudflareAccountId { get; set; }

    public string? CloudflareProjectName { get; set; }

    // Human-readable lines naming exactly which step/pattern produced each
    // field above — shown to the admin so "auto-detected" isn't a black box.
    public List<string> Evidence { get; set; } = new();
}

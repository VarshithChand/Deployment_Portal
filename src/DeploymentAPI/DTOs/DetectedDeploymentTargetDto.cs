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

    // Human-readable lines naming exactly which step/pattern produced each
    // field above — shown to the admin so "auto-detected" isn't a black box.
    public List<string> Evidence { get; set; } = new();
}

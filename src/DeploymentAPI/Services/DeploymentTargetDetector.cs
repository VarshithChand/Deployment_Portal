using System.Text.RegularExpressions;
using DeploymentAPI.DTOs;
using YamlDotNet.Serialization;

namespace DeploymentAPI.Services;

// Reads a CD workflow's actual YAML to answer "what is this really
// deploying to" instead of trusting an admin to have typed the ECS
// cluster/service or Azure Web App name into Settings > Environments by
// hand. Two passes: a structured one over known marketplace deploy actions
// (aws-actions/amazon-ecs-deploy-task-definition, azure/webapps-deploy),
// then a text pass over raw `run:` steps for teams that call the AWS/Azure
// CLI directly instead. Either pass can fill in fields the other missed;
// first match wins per field so the most specific evidence (a real action's
// `with:` block) isn't overwritten by a looser text match.
public static class DeploymentTargetDetector
{
    public static DetectedDeploymentTargetDto Detect(string yamlText)
    {
        var result = new DetectedDeploymentTargetDto();

        try
        {
            var deserializer = new DeserializerBuilder().Build();
            var root = deserializer.Deserialize<Dictionary<object, object>>(yamlText);

            if (root != null && root.TryGetValue("jobs", out var jobsObj) && jobsObj is IDictionary<object, object> jobs)
            {
                foreach (var jobEntry in jobs.Values)
                {
                    if (jobEntry is not IDictionary<object, object> job)
                        continue;

                    if (!job.TryGetValue("steps", out var stepsObj) || stepsObj is not IEnumerable<object> steps)
                        continue;

                    foreach (var stepObj in steps)
                    {
                        if (stepObj is IDictionary<object, object> step)
                            InspectStep(step, result);
                    }
                }
            }
        }
        catch
        {
            // Malformed/unusual YAML (a template this app can't fully
            // resolve, an unexpected shape) shouldn't block the rest of the
            // app - the raw-text pass below still has a chance to find
            // something, and finding nothing is a valid, harmless outcome.
        }

        DetectFromRawText(yamlText, result);

        if (result.CloudProvider == "none" && (result.EcsCluster != null || result.EcrRepository != null))
            result.CloudProvider = "aws";

        if (result.CloudProvider == "none" && (result.AzureWebAppName != null || result.AzureResourceGroup != null))
            result.CloudProvider = "azure";

        return result;
    }

    private static void InspectStep(IDictionary<object, object> step, DetectedDeploymentTargetDto result)
    {
        var uses = step.TryGetValue("uses", out var u) ? u?.ToString() ?? string.Empty : string.Empty;
        var with = step.TryGetValue("with", out var w) ? w as IDictionary<object, object> : null;

        if (uses.Contains("amazon-ecs-deploy-task-definition", StringComparison.OrdinalIgnoreCase))
        {
            result.CloudProvider = "aws";
            result.EcsCluster ??= GetWithValue(with, "cluster");
            result.EcsService ??= GetWithValue(with, "service");
            result.Evidence.Add($"ECS deploy action (cluster={result.EcsCluster ?? "?"}, service={result.EcsService ?? "?"})");
        }

        if (uses.Contains("configure-aws-credentials", StringComparison.OrdinalIgnoreCase))
        {
            var region = GetWithValue(with, "aws-region");

            if (region != null)
            {
                result.AwsRegion ??= region;
                result.Evidence.Add($"AWS region from configure-aws-credentials ({region})");
            }
        }

        if (uses.Contains("amazon-ecr-login", StringComparison.OrdinalIgnoreCase) && result.CloudProvider == "none")
        {
            result.CloudProvider = "aws";
        }

        if (uses.Contains("azure/webapps-deploy", StringComparison.OrdinalIgnoreCase))
        {
            result.CloudProvider = "azure";
            result.AzureWebAppName ??= GetWithValue(with, "app-name");
            result.Evidence.Add($"Azure Web App deploy action (app-name={result.AzureWebAppName ?? "?"})");
        }

        if (uses.Contains("azure/login", StringComparison.OrdinalIgnoreCase) && result.CloudProvider == "none")
        {
            result.CloudProvider = "azure";
        }
    }

    private static string? GetWithValue(IDictionary<object, object>? with, string key) =>
        with != null && with.TryGetValue(key, out var value) ? value?.ToString() : null;

    private static void DetectFromRawText(string yamlText, DetectedDeploymentTargetDto result)
    {
        var ecsCommand = ExtractCommandWindow(yamlText, @"aws\s+ecs\s+update-service");

        if (ecsCommand != null)
        {
            var cluster = ExtractFlag(ecsCommand, "--cluster");
            var service = ExtractFlag(ecsCommand, "--service");

            if (cluster != null || service != null)
            {
                result.CloudProvider = "aws";
                result.EcsCluster ??= cluster;
                result.EcsService ??= service;
                result.Evidence.Add($"aws ecs update-service CLI call (cluster={cluster ?? "?"}, service={service ?? "?"})");
            }
        }

        // <account-id>.dkr.ecr.<region>.amazonaws.com/<repository>[:tag]
        var ecrImage = Regex.Match(yamlText, @"\d{6,}\.dkr\.ecr\.([\w-]+)\.amazonaws\.com/([\w./-]+)");

        if (ecrImage.Success)
        {
            if (result.CloudProvider == "none")
                result.CloudProvider = "aws";

            result.AwsRegion ??= ecrImage.Groups[1].Value;
            result.EcrRepository ??= ecrImage.Groups[2].Value.Split(':')[0];
            result.Evidence.Add($"ECR image reference ({ecrImage.Value.Split(':')[0]})");
        }

        var azCommand = ExtractCommandWindow(yamlText, @"az\s+webapp\s+\S+");

        if (azCommand != null)
        {
            var appName = ExtractFlag(azCommand, "--name") ?? ExtractFlag(azCommand, "-n");
            var resourceGroup = ExtractFlag(azCommand, "--resource-group") ?? ExtractFlag(azCommand, "-g");

            if (appName != null || resourceGroup != null)
            {
                result.CloudProvider = "azure";
                result.AzureWebAppName ??= appName;
                result.AzureResourceGroup ??= resourceGroup;
                result.Evidence.Add($"az webapp CLI call (name={appName ?? "?"}, resource-group={resourceGroup ?? "?"})");
            }
        }
    }

    // A CLI invocation's own line plus a few that follow, covering the
    // common `command \` line-continuation style — bounded so a flag
    // belonging to some later, unrelated command can't get pulled in.
    private static string? ExtractCommandWindow(string text, string commandPattern)
    {
        var start = Regex.Match(text, commandPattern);

        if (!start.Success)
            return null;

        var windowEnd = Math.Min(start.Index + 500, text.Length);
        return text[start.Index..windowEnd];
    }

    // Flags can appear in any order on a real CLI invocation - each is
    // searched for independently rather than assuming a fixed sequence.
    private static string? ExtractFlag(string commandText, string flag)
    {
        var match = Regex.Match(commandText, $@"{Regex.Escape(flag)}[\s=]+(\S+)");
        return match.Success ? match.Groups[1].Value.Trim('"', '\'', '\\') : null;
    }
}

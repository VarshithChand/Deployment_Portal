using System.Text.RegularExpressions;
using DeploymentAPI.DTOs;
using YamlDotNet.Serialization;

namespace DeploymentAPI.Services;

// Reads a CD workflow's actual YAML to answer "what is this really
// deploying to" instead of trusting an admin to have typed the ECS
// cluster/service, Azure Web App name, Render service, or Cloudflare
// project into Settings > Environments by hand. Two passes: a structured
// one over known marketplace deploy actions (aws-actions/amazon-ecs-
// deploy-task-definition, azure/webapps-deploy, render-deploy, cloudflare/
// wrangler-action, cloudflare/pages-action), then a text pass over raw
// `run:` steps for teams that call the AWS/Azure CLI, a Render deploy-hook
// URL, or the wrangler CLI directly instead. Either pass can fill in fields
// the other missed; first match wins per field so the most specific
// evidence (a real action's `with:` block) isn't overwritten by a looser
// text match.
//
// One real limitation this can never work around: a deploy with NO
// workflow step at all - Render's own git-integration auto-deploy, or a
// developer running `wrangler deploy`/`npx wrangler deploy` from their own
// machine - leaves nothing in this repo's YAML to find. Detection can only
// ever be as complete as the pipeline actually is.
public static class DeploymentTargetDetector
{
    // Every Regex.Match call below gets this explicit timeout (SonarCloud
    // S6444) — the patterns are simple and non-backtracking by design, but
    // an explicit bound means a workflow YAML crafted to trigger
    // catastrophic backtracking fails fast instead of hanging the request.
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromSeconds(2);

    public static DetectedDeploymentTargetDto Detect(string yamlText)
    {
        var result = new DetectedDeploymentTargetDto();

        try
        {
            var deserializer = new DeserializerBuilder().Build();
            var root = deserializer.Deserialize<Dictionary<object, object>>(yamlText);

            InspectJobs(root, result);
        }
        catch
        {
            // Malformed/unusual YAML (a template this app can't fully
            // resolve, an unexpected shape) shouldn't block the rest of the
            // app - the raw-text pass below still has a chance to find
            // something, and finding nothing is a valid, harmless outcome.
        }

        DetectFromRawText(yamlText, result);
        ApplyProviderFallback(result);

        return result;
    }

    private static void InspectJobs(Dictionary<object, object>? root, DetectedDeploymentTargetDto result)
    {
        if (root == null || !root.TryGetValue("jobs", out var jobsObj) || jobsObj is not IDictionary<object, object> jobs)
            return;

        foreach (var jobEntry in jobs.Values)
            InspectJob(jobEntry, result);
    }

    private static void InspectJob(object jobEntry, DetectedDeploymentTargetDto result)
    {
        if (jobEntry is not IDictionary<object, object> job)
            return;

        if (!job.TryGetValue("steps", out var stepsObj) || stepsObj is not IEnumerable<object> steps)
            return;

        foreach (var stepObj in steps)
        {
            if (stepObj is IDictionary<object, object> step)
                InspectStep(step, result);
        }
    }

    // Field-by-field: an ECS deploy action seen after an ECR image ref
    // shouldn't clobber the provider that field-level detection above
    // already pinned down more specifically - this only fills in "none".
    private static void ApplyProviderFallback(DetectedDeploymentTargetDto result)
    {
        if (result.CloudProvider == "none" && (result.EcsCluster != null || result.EcrRepository != null))
            result.CloudProvider = "aws";

        if (result.CloudProvider == "none" && (result.AzureWebAppName != null || result.AzureResourceGroup != null))
            result.CloudProvider = "azure";

        if (result.CloudProvider == "none" && result.RenderServiceId != null)
            result.CloudProvider = "render";

        if (result.CloudProvider == "none" && (result.CloudflareProjectName != null || result.CloudflareAccountId != null))
            result.CloudProvider = "cloudflare";
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

        // No official "render/deploy-action" exists - render-deploy (by
        // JorgeLNJunior) is the community action teams actually use, taking
        // a "service-id" input the same way the official cloud actions above
        // take theirs.
        if (uses.Contains("render-deploy", StringComparison.OrdinalIgnoreCase))
        {
            result.CloudProvider = "render";
            result.RenderServiceId ??= GetWithValue(with, "service-id") ?? GetWithValue(with, "serviceId");
            result.Evidence.Add($"Render deploy action (service-id={result.RenderServiceId ?? "?"})");
        }

        if (uses.Contains("cloudflare/wrangler-action", StringComparison.OrdinalIgnoreCase))
        {
            result.CloudProvider = "cloudflare";
            result.CloudflareAccountId ??= GetWithValue(with, "accountId");
            result.Evidence.Add("Cloudflare wrangler-action" + (result.CloudflareAccountId != null ? $" (accountId={result.CloudflareAccountId})" : string.Empty));
        }

        if (uses.Contains("cloudflare/pages-action", StringComparison.OrdinalIgnoreCase))
        {
            result.CloudProvider = "cloudflare";
            result.CloudflareAccountId ??= GetWithValue(with, "accountId");
            result.CloudflareProjectName ??= GetWithValue(with, "projectName");
            result.Evidence.Add($"Cloudflare Pages deploy action (project={result.CloudflareProjectName ?? "?"})");
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
        var ecrImage = Regex.Match(
            yamlText, @"\d{6,}\.dkr\.ecr\.([\w-]+)\.amazonaws\.com/([\w./-]+)", RegexOptions.None, RegexTimeout);

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

        // A Render deploy hook is just a URL a workflow curls/wgets to
        // trigger a deploy - the only "evidence" a hook-based Render deploy
        // ever leaves in a workflow file, since Render's own git integration
        // (auto-deploy on push) leaves none at all. srv-... is Render's own
        // service ID format.
        var renderHook = Regex.Match(
            yamlText, @"api\.render\.com/deploy/(srv-[\w-]+)", RegexOptions.None, RegexTimeout);

        if (renderHook.Success)
        {
            result.CloudProvider = "render";
            result.RenderServiceId ??= renderHook.Groups[1].Value;
            result.Evidence.Add($"Render deploy-hook URL (service={result.RenderServiceId})");
        }

        // wrangler is Cloudflare's own CLI - "wrangler deploy" (Workers) or
        // "wrangler pages deploy" (Pages), optionally naming the project.
        var wranglerCommand = ExtractCommandWindow(yamlText, @"wrangler\s+(deploy|pages\s+deploy|publish)");

        if (wranglerCommand != null)
        {
            var projectName = ExtractFlag(wranglerCommand, "--project-name");

            result.CloudProvider = "cloudflare";
            result.CloudflareProjectName ??= projectName;
            result.Evidence.Add("wrangler CLI deploy call" + (projectName != null ? $" (project={projectName})" : string.Empty));
        }
    }

    // A CLI invocation's own line plus a few that follow, covering the
    // common `command \` line-continuation style — bounded so a flag
    // belonging to some later, unrelated command can't get pulled in.
    private static string? ExtractCommandWindow(string text, string commandPattern)
    {
        var start = Regex.Match(text, commandPattern, RegexOptions.None, RegexTimeout);

        if (!start.Success)
            return null;

        var windowEnd = Math.Min(start.Index + 500, text.Length);
        return text[start.Index..windowEnd];
    }

    // Flags can appear in any order on a real CLI invocation - each is
    // searched for independently rather than assuming a fixed sequence.
    private static string? ExtractFlag(string commandText, string flag)
    {
        var match = Regex.Match(commandText, $@"{Regex.Escape(flag)}[\s=]+(\S+)", RegexOptions.None, RegexTimeout);
        return match.Success ? match.Groups[1].Value.Trim('"', '\'', '\\') : null;
    }
}

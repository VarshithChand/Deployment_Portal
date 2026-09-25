using System.Collections.Concurrent;
using System.ComponentModel;
using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Real terraform plan/apply execution against the calling user's own
// uploaded .tf files and saved Azure Service Principal - the deliberately
// higher-risk sibling of TerraformFileService's "storage and editing only"
// stance (see that class's header comment). This one genuinely creates,
// changes, or destroys real Azure resources when Apply runs.
//
// State persistence: this service does NOT manage terraform state itself -
// it relies entirely on whatever remote backend the user's own .tf files
// declare (e.g. an azurerm backend block pointing at Azure Storage). This
// matters specifically because this app's container disk is wiped on every
// restart/redeploy (see SettingsService's own header comment on why
// portal_settings moved to Postgres for the same reason) - a LOCAL
// terraform.tfstate written here would be silently lost the next time this
// container restarts, and the next plan would think every resource is
// missing and try to recreate it. A remote backend sidesteps that entirely
// (state lives in Azure, not in this container), which is why Plan requires
// nothing from this class beyond "run terraform in a temp directory."
//
// Plan/Apply are two separate HTTP requests (HTTP is stateless), but a real
// terraform apply must apply the EXACT plan a user was shown, not a
// re-derived one - so a successful Plan keeps its working directory (with
// the saved binary "tfplan" file) around in memory, keyed by a one-time
// planId, until Apply consumes it or it expires unclaimed.
public class TerraformExecutionService
{
    private readonly SettingsService _settings;
    private readonly ActivityLogService _log;

    // One live plan per (user, project) - a fresh Plan call discards any
    // previous unclaimed one for that same project rather than accumulating
    // temp directories, but leaves other projects' own in-flight plans
    // alone. Static (not per-request) since this service is registered
    // scoped but the in-flight plan needs to survive across the Plan and
    // Apply requests, which are two separate HTTP calls (and, realistically,
    // two separate DI scopes).
    private static readonly ConcurrentDictionary<string, PlanRecord> Plans = new();

    private static readonly TimeSpan PlanExpiry = TimeSpan.FromMinutes(20);
    private static readonly TimeSpan ProcessTimeout = TimeSpan.FromMinutes(8);

    private sealed record PlanRecord(string PlanId, string UserId, Guid ProjectId, string WorkDir, string SummaryLine, DateTime CreatedAtUtc);

    public TerraformExecutionService(SettingsService settings, ActivityLogService log)
    {
        _settings = settings;
        _log = log;
    }

    public async Task<(bool Success, string? Error, string? PlanId, string? Output, string? SummaryLine)> PlanAsync(string userId, Guid projectId)
    {
        var creds = await _settings.GetUserTerraformCredentialsAsync(userId);

        if (!creds.IsConfigured)
            return (false, "Azure Service Principal credentials aren't configured yet.", null, null, null);

        var files = await _settings.GetAllProjectFilesAsync(userId, projectId);

        if (files.Count == 0)
            return (false, "No Terraform files are stored in this project yet - upload your .tf files first.", null, null, null);

        DiscardExistingPlan(userId, projectId);

        var workDir = Path.Combine(Path.GetTempPath(), "tf-plan-" + Guid.NewGuid().ToString("N"));

        try
        {
            Directory.CreateDirectory(workDir);

            foreach (var file in files)
            {
                var fullPath = Path.Combine(workDir, file.FileName.Replace('/', Path.DirectorySeparatorChar));
                Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
                await File.WriteAllTextAsync(fullPath, file.Content);
            }

            var env = BuildEnv(creds);

            var initResult = await RunTerraformAsync(workDir, new[] { "init", "-input=false", "-no-color" }, env);

            if (!initResult.Success)
            {
                CleanupDir(workDir);
                return (false, "terraform init failed:\n\n" + initResult.Output, null, null, null);
            }

            var planResult = await RunTerraformAsync(
                workDir, new[] { "plan", "-input=false", "-no-color", "-out=tfplan" }, env);

            if (!planResult.Success)
            {
                CleanupDir(workDir);
                return (false, "terraform plan failed:\n\n" + planResult.Output, null, null, null);
            }

            var summaryLine = ExtractSummaryLine(planResult.Output) ?? "No changes.";
            var planId = Guid.NewGuid().ToString("N");

            Plans[planId] = new PlanRecord(planId, userId, projectId, workDir, summaryLine, DateTime.UtcNow);

            _log.LogInfo("Terraform", "A plan was generated for a user's personal Terraform files.");

            return (true, null, planId, planResult.Output, summaryLine);
        }
        catch (Win32Exception)
        {
            CleanupDir(workDir);
            return (false, "The terraform CLI isn't available on this server.", null, null, null);
        }
        catch (Exception ex)
        {
            CleanupDir(workDir);
            _log.LogError("Terraform", $"Plan failed: {ex.Message}");
            return (false, "Unable to run terraform plan right now.", null, null, null);
        }
    }

    // confirmationText must match the plan's own summary line EXACTLY (see
    // TerraformController's own comment) - this is what makes "type to
    // confirm" mean something concrete rather than a generic "yes" that
    // proves nothing about whether the plan was actually read.
    public async Task<(bool Success, string? Error, string? Output)> ApplyAsync(string userId, Guid projectId, string? planId, string? confirmationText)
    {
        if (string.IsNullOrWhiteSpace(planId) || !Plans.TryGetValue(planId, out var record)
            || record.UserId != userId || record.ProjectId != projectId)
        {
            return (false, "That plan wasn't found - it may have already been applied or expired. Run Plan again.", null);
        }

        if (DateTime.UtcNow - record.CreatedAtUtc > PlanExpiry)
        {
            Plans.TryRemove(planId, out _);
            CleanupDir(record.WorkDir);
            return (false, "That plan has expired - run Plan again before applying.", null);
        }

        if (!string.Equals((confirmationText ?? string.Empty).Trim(), record.SummaryLine.Trim(), StringComparison.Ordinal))
            return (false, "Confirmation text didn't match the plan summary exactly.", null);

        var creds = await _settings.GetUserTerraformCredentialsAsync(userId);

        if (!creds.IsConfigured)
            return (false, "Azure Service Principal credentials aren't configured.", null);

        try
        {
            var env = BuildEnv(creds);

            var applyResult = await RunTerraformAsync(
                record.WorkDir, new[] { "apply", "-input=false", "-no-color", "-auto-approve", "tfplan" }, env);

            _log.LogInfo("Terraform", applyResult.Success
                ? "A user applied their personal Terraform plan."
                : "A user's personal Terraform apply failed.");

            return applyResult.Success
                ? (true, null, applyResult.Output)
                : (false, "terraform apply failed:\n\n" + applyResult.Output, applyResult.Output);
        }
        catch (Win32Exception)
        {
            return (false, "The terraform CLI isn't available on this server.", null);
        }
        catch (Exception ex)
        {
            _log.LogError("Terraform", $"Apply failed: {ex.Message}");
            return (false, "Unable to run terraform apply right now.", null);
        }
        finally
        {
            // Whether apply succeeded or failed, this specific saved plan
            // is spent - a failed apply leaves real infrastructure in a
            // possibly-changed state, so the honest next step is always a
            // fresh Plan against current reality, never a retry of the same
            // stale plan file.
            Plans.TryRemove(planId, out _);
            CleanupDir(record.WorkDir);
        }
    }

    private static void DiscardExistingPlan(string userId, Guid projectId)
    {
        foreach (var kvp in Plans.ToArray())
        {
            if (kvp.Value.UserId != userId || kvp.Value.ProjectId != projectId) continue;

            if (Plans.TryRemove(kvp.Key, out var record))
                CleanupDir(record.WorkDir);
        }
    }

    private static void CleanupDir(string dir)
    {
        try
        {
            if (Directory.Exists(dir))
                Directory.Delete(dir, recursive: true);
        }
        catch
        {
            // Best-effort - a leftover temp dir is a disk-space nuisance,
            // never a correctness or security issue (no secrets are written
            // to disk here, only .tf text and terraform's own plan binary).
        }
    }

    private static Dictionary<string, string?> BuildEnv(UserTerraformCredentials creds) => new()
    {
        ["ARM_CLIENT_ID"] = creds.ClientId,
        ["ARM_CLIENT_SECRET"] = creds.ClientSecret,
        ["ARM_TENANT_ID"] = creds.TenantId,
        ["ARM_SUBSCRIPTION_ID"] = creds.SubscriptionId ?? "",
        // Suppresses terraform's interactive-input assumptions and
        // usage-data prompts - standard for any non-interactive/CI runner.
        ["TF_IN_AUTOMATION"] = "1",
        ["TF_INPUT"] = "0",
        // Reused across requests for as long as this container stays up
        // (wiped on restart, same as everything else on local disk here) -
        // pure speed optimization so the 2nd+ plan in a container's
        // lifetime doesn't re-download provider binaries from scratch.
        ["TF_PLUGIN_CACHE_DIR"] = Path.Combine(Path.GetTempPath(), ".terraform.d", "plugin-cache")
    };

    private static readonly Regex SummaryPattern = new(
        @"Plan:\s*\d+\s*to add,\s*\d+\s*to change,\s*\d+\s*to destroy\.", RegexOptions.Compiled);

    private static string? ExtractSummaryLine(string output)
    {
        var match = SummaryPattern.Match(output);

        if (match.Success) return match.Value;

        return output.Contains("No changes.", StringComparison.Ordinal) ? "No changes." : null;
    }

    private static async Task<(bool Success, string Output)> RunTerraformAsync(
        string workDir, string[] arguments, Dictionary<string, string?> env)
    {
        Directory.CreateDirectory(env["TF_PLUGIN_CACHE_DIR"]!);

        var psi = new ProcessStartInfo
        {
            FileName = "terraform",
            WorkingDirectory = workDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        foreach (var arg in arguments)
            psi.ArgumentList.Add(arg);

        foreach (var (envKey, envValue) in env)
            psi.Environment[envKey] = envValue;

        using var process = new Process { StartInfo = psi };

        var stdout = new StringBuilder();

        process.OutputDataReceived += (_, e) => { if (e.Data != null) stdout.AppendLine(e.Data); };
        process.ErrorDataReceived += (_, e) => { if (e.Data != null) stdout.AppendLine(e.Data); };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        using var cts = new CancellationTokenSource(ProcessTimeout);

        try
        {
            await process.WaitForExitAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            try { process.Kill(entireProcessTree: true); } catch { /* best-effort */ }
            return (false, stdout + "\n\n(Timed out waiting for terraform to finish.)");
        }

        return (process.ExitCode == 0, stdout.ToString());
    }
}

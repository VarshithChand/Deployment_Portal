using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Personal (non-org) Terraform page - a standalone top-level sidebar page,
// not nested under Settings/Organizations and not tied to picking an
// organization first (see TerraformFilesController for that org-scoped
// sibling, which stays storage/editing-only). Every file/credential here
// belongs to the calling user alone (RequireAuth.RequireUserId is the only
// scoping - no roles/permissions needed, unlike the org version).
//
// File storage/editing (credentials, files/*) is low-risk, same shape as
// every other per-user credential section in this app. Plan/Apply are
// deliberately different: they run the real terraform CLI against the
// calling user's real Azure subscription (see TerraformExecutionService's
// own header comment for the state-backend reasoning behind why that's
// safe on this container's ephemeral disk), so both are PIN-gated the same
// way saving the credentials themselves is - reading the decrypted client
// secret to build the terraform environment is exactly the kind of action
// CredentialGate exists for.
[ApiController]
[Route("api/terraform")]
public class TerraformController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly SessionActivityService _activity;
    private readonly TerraformExecutionService _execution;
    private readonly AiAssistantServiceResolver _aiResolver;
    private readonly ActivityLogService _log;

    public TerraformController(
        SettingsService settings,
        SessionActivityService activity,
        TerraformExecutionService execution,
        AiAssistantServiceResolver aiResolver,
        ActivityLogService log)
    {
        _settings = settings;
        _activity = activity;
        _execution = execution;
        _aiResolver = aiResolver;
        _log = log;
    }

    [HttpGet("credentials")]
    public async Task<IActionResult> GetCredentials()
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var creds = await _settings.GetUserTerraformCredentialsAsync(key!);

        return Ok(new
        {
            Configured = creds.IsConfigured,
            creds.TenantId,
            creds.ClientId,
            creds.SubscriptionId
        });
    }

    [HttpPost("credentials")]
    public async Task<IActionResult> SaveCredentials(TerraformCredentialsUpdateDto request)
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "terraform") is IActionResult gateDenied)
            return gateDenied;

        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        // A blank field keeps whatever's already saved - see SettingsController.SaveMyAzure.
        var existing = await _settings.GetUserTerraformCredentialsAsync(key!);

        var hasTenant = !string.IsNullOrWhiteSpace(request.TenantId) || !string.IsNullOrWhiteSpace(existing.TenantId);
        var hasClient = !string.IsNullOrWhiteSpace(request.ClientId) || !string.IsNullOrWhiteSpace(existing.ClientId);
        var hasSecret = !string.IsNullOrWhiteSpace(request.ClientSecret) || !string.IsNullOrWhiteSpace(existing.ClientSecret);

        if (!hasTenant || !hasClient || !hasSecret)
            return BadRequest(new { message = "Tenant ID, client ID, and client secret are required." });

        await _settings.SaveUserTerraformCredentialsAsync(key!, request);

        return Ok(new { Configured = true });
    }

    [HttpDelete("credentials")]
    public async Task<IActionResult> ClearCredentials()
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "terraform") is IActionResult gateDenied)
            return gateDenied;

        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        await _settings.ClearUserTerraformCredentialsAsync(key!);
        _activity.RevokeCredentialUnlock(key!, "terraform");

        return Ok();
    }

    [HttpGet("files")]
    public async Task<IActionResult> ListFiles()
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        return Ok(new { files = await _settings.ListUserTerraformFilesAsync(key!) });
    }

    // {*fileName} (catch-all) rather than {fileName} - a stored name can now
    // contain "/" (see TerraformFileNaming.ValidateRelativePath), which a
    // plain route parameter would otherwise split into extra path segments.
    [HttpGet("files/{*fileName}")]
    public async Task<IActionResult> GetFile(string fileName)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var file = await _settings.GetUserTerraformFileAsync(key!, fileName);

        if (file == null)
            return NotFound(new { message = "File not found." });

        return Ok(file);
    }

    // Bulk upload - the "pick multiple .tf files (or a whole folder) from my
    // local Terraform project" flow. Upsert-by-path (see
    // UploadUserTerraformFilesAsync's own comment), so re-uploading the same
    // folder after local edits just refreshes what's stored rather than
    // erroring on "already exists".
    [HttpPost("files")]
    public async Task<IActionResult> UploadFiles(UploadTerraformFilesRequestDto request)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        if (request.Files.Count == 0)
            return BadRequest(new { message = "No files were provided." });

        var results = await _settings.UploadUserTerraformFilesAsync(key!, request.Files);

        return Ok(new
        {
            accepted = results.Where(r => r.Accepted).Select(r => r.FileName).ToList(),
            rejected = results.Where(r => !r.Accepted).Select(r => new { fileName = r.FileName, error = r.Error }).ToList()
        });
    }

    [HttpPut("files/{*fileName}")]
    public async Task<IActionResult> UpdateFile(string fileName, UpdateTerraformFileContentDto request)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var updated = await _settings.UpdateUserTerraformFileAsync(key!, fileName, request.Content);

        if (!updated)
            return NotFound(new { message = "File not found." });

        return Ok(new { success = true });
    }

    [HttpDelete("files/{*fileName}")]
    public async Task<IActionResult> DeleteFile(string fileName)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var deleted = await _settings.DeleteUserTerraformFileAsync(key!, fileName);

        if (!deleted)
            return NotFound(new { message = "File not found." });

        return Ok(new { success = true });
    }

    // Read-only: feeds every stored file's content to the already-configured
    // AI Assistant (Settings > Credentials > AI Assistant - same Gemini/Groq
    // credential Deployment Copilot uses) and asks for a plain-English
    // explanation. No tools, no Azure calls, no terraform - this never
    // touches your subscription, it only reads text you already uploaded.
    [HttpPost("explain")]
    public async Task<IActionResult> Explain()
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var files = await _settings.GetAllUserTerraformFilesAsync(key!);

        if (files.Count == 0)
            return Ok(new { success = false, message = "No Terraform files are stored yet - upload your .tf files first." });

        var creds = await _settings.GetAiAssistantCredentialsAsync();

        if (!creds.IsConfigured)
        {
            return Ok(new
            {
                success = false,
                message = "The AI Assistant isn't configured yet. Add an API key and model in Settings → Credentials → AI Assistant."
            });
        }

        var combined = string.Join(
            "\n\n",
            files.Select(f => $"# File: {f.FileName}\n```hcl\n{f.Content}\n```"));

        const string systemInstruction =
            "You are explaining a set of Terraform (.tf) configuration files to the person who owns " +
            "them, inside a deployment portal's Terraform page. Summarize in plain English: what Azure " +
            "resources these files define, how they relate to each other, what providers/backend they " +
            "use, and anything that stands out (hardcoded values, missing variables, anything that looks " +
            "risky). Be concise but specific - name actual resource names/types from the files, don't " +
            "speak generically. You are not running terraform and have no live Azure state - you're " +
            "reading static text only.";

        var history = new List<AiChatMessageDto>
        {
            new() { Role = "user", Content = "Here are my Terraform files:\n\n" + combined }
        };

        var result = await _aiResolver.Resolve(creds.Provider).ChatAsync(
            systemInstruction,
            history,
            new List<AiToolDefinition>(),
            (_, _) => Task.FromResult(string.Empty),
            creds.ApiKey!,
            creds.Model);

        if (!result.Success)
            return Ok(new { success = false, message = result.Error ?? "Unable to explain these files right now." });

        return Ok(new { success = true, explanation = result.Reply });
    }

    // Real execution - see TerraformExecutionService's own header comment
    // for the full reasoning (state backend requirement, plan/apply
    // separation, etc). PIN-gated: this decrypts and uses the real client
    // secret to talk to Azure.
    [HttpPost("plan")]
    public async Task<IActionResult> Plan()
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "terraform") is IActionResult gateDenied)
            return gateDenied;

        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var (success, error, planId, output, summaryLine) = await _execution.PlanAsync(key!);

        if (!success)
            return Ok(new { success = false, message = error });

        return Ok(new { success = true, planId, output, summaryLine });
    }

    [HttpPost("apply")]
    public async Task<IActionResult> Apply(TerraformApplyRequestDto request)
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "terraform") is IActionResult gateDenied)
            return gateDenied;

        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var (success, error, output) = await _execution.ApplyAsync(key!, request.PlanId, request.ConfirmationText);

        var actor = await AdminGate.ResolveCallerLoginAsync(this) ?? $"session {key![..Math.Min(8, key.Length)]}";
        _log.LogInfo("Terraform", $"{actor} {(success ? "applied" : "attempted to apply")} their personal Terraform plan.");

        if (!success)
            return Ok(new { success = false, message = error });

        return Ok(new { success = true, output });
    }
}

using System.Text.RegularExpressions;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Personal (non-org) Terraform page - a standalone top-level sidebar page,
// not nested under Settings/Organizations and not tied to picking an
// organization first (see TerraformFilesController for that org-scoped
// sibling, which stays storage/editing-only). Every project/file/
// credential here belongs to the calling user alone (RequireAuth.
// RequireUserId is the only scoping - no roles/permissions needed, unlike
// the org version).
//
// Each uploaded folder is its own PROJECT (own file tree, own Explain/
// Preview/Plan/Apply) - see SettingsService's ListUserTerraformProjectsAsync
// and friends for why that replaced one flat file list per user. Project
// file CRUD is low-risk, same shape as every other per-user credential
// section in this app. Preview is a static, no-Azure-calls "fake plan" (see
// TerraformResourceExtractor); Plan/Apply are the real thing, and PIN-gated
// the same way saving the credentials themselves is - reading the decrypted
// client secret to build the terraform environment is exactly the kind of
// action CredentialGate exists for.
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

    [HttpGet("projects")]
    public async Task<IActionResult> ListProjects()
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        return Ok(new { projects = await _settings.ListUserTerraformProjectsAsync(key!) });
    }

    // Creates a new project from an upload - "pick a folder, it becomes its
    // own project" (see CreateTerraformProjectRequestDto). Redirect-to-the-
    // new-project's-page is a frontend concern; this just returns the
    // created project (with its ProjectId) plus the same per-file accept/
    // reject detail UploadFiles below returns.
    [HttpPost("projects")]
    public async Task<IActionResult> CreateProject(CreateTerraformProjectRequestDto request)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var (success, error, project, fileResults) =
            await _settings.CreateUserTerraformProjectAsync(key!, request.Name, request.Files);

        if (!success)
            return Ok(new { success = false, message = error });

        return Ok(new
        {
            success = true,
            project,
            accepted = fileResults.Where(r => r.Accepted).Select(r => r.FileName).ToList(),
            rejected = fileResults.Where(r => !r.Accepted).Select(r => new { fileName = r.FileName, error = r.Error }).ToList()
        });
    }

    [HttpGet("projects/{projectId:guid}")]
    public async Task<IActionResult> GetProject(Guid projectId)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var project = await _settings.GetUserTerraformProjectAsync(key!, projectId);

        if (project == null)
            return NotFound(new { message = "Project not found." });

        return Ok(project);
    }

    [HttpDelete("projects/{projectId:guid}")]
    public async Task<IActionResult> DeleteProject(Guid projectId)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var deleted = await _settings.DeleteUserTerraformProjectAsync(key!, projectId);

        if (!deleted)
            return NotFound(new { message = "Project not found." });

        return Ok(new { success = true });
    }

    // Add/refresh files within an EXISTING project - the same picker as
    // project creation, just scoped to one already-created project (e.g.
    // re-syncing after local edits, or adding files that were missed the
    // first time).
    [HttpPost("projects/{projectId:guid}/files")]
    public async Task<IActionResult> UploadFiles(Guid projectId, UploadTerraformFilesRequestDto request)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        if (request.Files.Count == 0)
            return BadRequest(new { message = "No files were provided." });

        var results = await _settings.UploadFilesToProjectAsync(key!, projectId, request.Files);

        if (results == null)
            return NotFound(new { message = "Project not found." });

        return Ok(new
        {
            accepted = results.Where(r => r.Accepted).Select(r => r.FileName).ToList(),
            rejected = results.Where(r => !r.Accepted).Select(r => new { fileName = r.FileName, error = r.Error }).ToList()
        });
    }

    // {*fileName} (catch-all) rather than {fileName} - a stored path can
    // contain "/" (see TerraformFileNaming.ValidateRelativePath), which a
    // plain route parameter would otherwise split into extra path segments.
    [HttpGet("projects/{projectId:guid}/files/{*fileName}")]
    public async Task<IActionResult> GetFile(Guid projectId, string fileName)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var file = await _settings.GetProjectFileAsync(key!, projectId, fileName);

        if (file == null)
            return NotFound(new { message = "File not found." });

        return Ok(file);
    }

    [HttpPut("projects/{projectId:guid}/files/{*fileName}")]
    public async Task<IActionResult> UpdateFile(Guid projectId, string fileName, UpdateTerraformFileContentDto request)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var updated = await _settings.UpdateProjectFileAsync(key!, projectId, fileName, request.Content);

        if (!updated)
            return NotFound(new { message = "File not found." });

        return Ok(new { success = true });
    }

    [HttpDelete("projects/{projectId:guid}/files/{*fileName}")]
    public async Task<IActionResult> DeleteFile(Guid projectId, string fileName)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var deleted = await _settings.DeleteProjectFileAsync(key!, projectId, fileName);

        if (!deleted)
            return NotFound(new { message = "File not found." });

        return Ok(new { success = true });
    }

    // Read-only: feeds every stored file's content to the already-configured
    // AI Assistant (Settings > Credentials > AI Assistant - same Gemini/Groq
    // credential Deployment Copilot uses) and asks for a plain-English
    // explanation. No tools, no Azure calls, no terraform - this never
    // touches your subscription, it only reads text you already uploaded.
    [HttpPost("projects/{projectId:guid}/explain")]
    public async Task<IActionResult> Explain(Guid projectId)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var files = await _settings.GetAllProjectFilesAsync(key!, projectId);

        if (files.Count == 0)
            return Ok(new { success = false, message = "No Terraform files are stored in this project yet - upload your .tf files first." });

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
            "reading static text only.\n\n" + MarkdownFormattingConstraint;

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

    // The "fake plan" - deterministic resource extraction (see
    // TerraformResourceExtractor's own header comment: regex over stored
    // text, not a real parse, never terraform, never Azure) plus an
    // optional AI narrative built from that same extracted list. Safe to
    // call with no Terraform credentials configured at all, and safe to
    // call as often as you like - nothing here is rate-limited by risk the
    // way real Plan/Apply are, because nothing here can change anything.
    [HttpPost("projects/{projectId:guid}/preview")]
    public async Task<IActionResult> Preview(Guid projectId)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var files = await _settings.GetAllProjectFilesAsync(key!, projectId);

        if (files.Count == 0)
            return Ok(new { success = false, message = "No Terraform files are stored in this project yet - upload your .tf files first." });

        var resources = TerraformResourceExtractor.Extract(files);

        string? narrative = null;

        var creds = await _settings.GetAiAssistantCredentialsAsync();

        if (creds.IsConfigured && resources.Count > 0)
        {
            var resourceList = string.Join("\n", resources.Select(DescribeResourceForAi));

            const string systemInstruction =
                "You are previewing what a Terraform configuration would create, for someone about to " +
                "decide whether to run a real terraform plan against their Azure subscription. You are " +
                "given a plain list of resource blocks already extracted from their files: type, local " +
                "name, declared \"name\" attribute where it's a literal string, and - critically - how " +
                "many actual Azure resources that ONE block creates. A block using for_each/count creates " +
                "one resource PER ENTRY, not one resource total - when the line gives you an instance " +
                "count and list of instance names, that IS the real count and names to report (e.g. \"3 " +
                "Windows Web Apps: billing-app, reporting-app, ops-app\"), not \"1\". When a line says the " +
                "instance count could not be resolved, say plainly that it uses for_each/count so the " +
                "real number depends on a variable this preview couldn't read - never guess a number. " +
                "Write a short, concrete summary of what would be created, grouped sensibly, in plain " +
                "English. Do not invent resources beyond this list, and do not claim to know the actual " +
                "value of any name shown as unresolved - say it depends on a variable instead. You have " +
                "no live Azure state and are not running terraform.\n\n" + MarkdownFormattingConstraint;

            var history = new List<AiChatMessageDto>
            {
                new() { Role = "user", Content = "Extracted resources:\n" + resourceList }
            };

            var result = await _aiResolver.Resolve(creds.Provider).ChatAsync(
                systemInstruction,
                history,
                new List<AiToolDefinition>(),
                (_, _) => Task.FromResult(string.Empty),
                creds.ApiKey!,
                creds.Model);

            if (result.Success)
                narrative = result.Reply;
        }

        return Ok(new { success = true, resources, narrative });
    }

    // The frontend renders every AI reply through CopilotMarkdown.jsx - a
    // deliberately minimal, safety-by-construction renderer (real React
    // elements, never dangerouslySetInnerHTML) that only understands
    // # headings, -/* bullets, 1. numbered lists, **bold**, and `code`.
    // Without this constraint the model tends to reach for a markdown
    // table (very natural for "type | count | name" data) or raw <br>
    // tags for line breaks - neither of which that renderer understands,
    // so they show up as literal pipe/dash/HTML text instead of formatting.
    private const string MarkdownFormattingConstraint =
        "Formatting: your reply is rendered by a minimal markdown renderer that ONLY understands " +
        "# headings, - bullet lists, 1. numbered lists, **bold**, and `inline code` - plain paragraphs " +
        "otherwise. Do NOT use markdown tables (| ... |), do NOT use raw HTML tags like <br> or <table>, " +
        "and do NOT rely on any other markdown syntax - use nested bullet lists instead of a table when " +
        "you need to present structured, multi-field information.";

    private static string DescribeResourceForAi(ProjectResourceSummaryDto r)
    {
        var line = $"- {r.ResourceType} \"{r.LocalName}\" (file: {r.FileName})";

        if (!r.HasForEachOrCount)
        {
            return line + (r.DeclaredName != null
                ? $" -> 1 instance, name = \"{r.DeclaredName}\""
                : " -> 1 instance, name is not a literal string (variable/expression)");
        }

        if (r.InstanceCount == null)
            return line + " -> uses for_each/count; instance count could not be resolved from an uploaded .tfvars file";

        return r.InstanceNames is { Count: > 0 }
            ? line + $" -> {r.InstanceCount} instances: {string.Join(", ", r.InstanceNames)}"
            : line + $" -> {r.InstanceCount} instances";
    }

    // Discovers "add a new X" spots already driving a real for_each/count in
    // this project (see TerraformResourceExtractor.BuildAddTargets) - a new
    // web app, function app, etc, without hand-editing HCL. Read-only, no
    // Azure calls.
    [HttpGet("projects/{projectId:guid}/add-targets")]
    public async Task<IActionResult> GetAddTargets(Guid projectId)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var files = await _settings.GetAllProjectFilesAsync(key!, projectId);

        return Ok(new { targets = TerraformResourceExtractor.BuildAddTargets(files) });
    }

    // Inserts a new entry into an existing add target's tfvars variable
    // (TerraformTfvarsEditor.InsertEntry) - re-resolves the target fresh
    // from the CURRENT files rather than trusting whatever the frontend
    // cached, so a target that's stopped existing (the file was deleted or
    // edited since the picker was shown) is caught here, not silently
    // written to the wrong place.
    [HttpPost("projects/{projectId:guid}/add-instance")]
    public async Task<IActionResult> AddInstance(Guid projectId, AddResourceInstanceRequestDto request)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var name = request.Name?.Trim();

        if (string.IsNullOrWhiteSpace(request.VariableName) || string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "A target and a name are required." });

        if (!Regex.IsMatch(name, @"^[A-Za-z0-9._-]+$"))
            return BadRequest(new { message = "Name must contain only letters, numbers, dots, dashes, or underscores." });

        var pathPattern = new Regex(@"^[A-Za-z0-9._/-]+$");
        var appsettingsFile = request.AppsettingsFile?.Trim();
        var connectionstringsFile = request.ConnectionstringsFile?.Trim();

        if (!string.IsNullOrEmpty(appsettingsFile) && !pathPattern.IsMatch(appsettingsFile))
            return BadRequest(new { message = "Appsettings file can only contain letters, numbers, dots, dashes, underscores, or slashes." });

        if (!string.IsNullOrEmpty(connectionstringsFile) && !pathPattern.IsMatch(connectionstringsFile))
            return BadRequest(new { message = "Connection strings file can only contain letters, numbers, dots, dashes, underscores, or slashes." });

        var files = await _settings.GetAllProjectFilesAsync(key!, projectId);
        var target = TerraformResourceExtractor.BuildAddTargets(files)
            .FirstOrDefault(t => t.VariableName == request.VariableName);

        if (target == null)
        {
            return Ok(new
            {
                success = false,
                message = "That target isn't available in this project anymore - refresh and try again."
            });
        }

        var file = files.FirstOrDefault(f => string.Equals(f.FileName, target.FileName, StringComparison.OrdinalIgnoreCase));

        if (file == null)
            return Ok(new { success = false, message = $"{target.FileName} wasn't found." });

        // Web-app-only attributes (see AddResourceInstanceRequestDto's own
        // comment) - every other kind still gets the plain "name" = {}/",".
        var attributes = new List<string>();
        if (!string.IsNullOrEmpty(appsettingsFile)) attributes.Add($"appsettings_file = \"{appsettingsFile}\"");
        if (!string.IsNullOrEmpty(connectionstringsFile)) attributes.Add($"connectionstrings_file = \"{connectionstringsFile}\"");

        var entryText = target.Shape != "Map"
            ? $"\"{name}\","
            : attributes.Count > 0
                ? $"\"{name}\" = {{ {string.Join(", ", attributes)} }}"
                : $"\"{name}\" = {{}}";

        var (success, error, updatedContent) = TerraformTfvarsEditor.InsertEntry(file.Content, target.VariableName, entryText);

        if (!success)
            return Ok(new { success = false, message = error });

        await _settings.UpdateProjectFileAsync(key!, projectId, target.FileName, updatedContent);

        return Ok(new { success = true });
    }

    // Every individual instance across every add target (see
    // TerraformResourceExtractor.BuildResourceInstances) - the "Resources"
    // tab's own list. Read-only, no Azure calls.
    [HttpGet("projects/{projectId:guid}/resource-instances")]
    public async Task<IActionResult> GetResourceInstances(Guid projectId)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var files = await _settings.GetAllProjectFilesAsync(key!, projectId);

        return Ok(new { instances = TerraformResourceExtractor.BuildResourceInstances(files) });
    }

    // Renames one existing instance's map key/list value in place
    // (TerraformTfvarsEditor.RenameEntry) - re-resolves both the target AND
    // the specific instance fresh from the CURRENT files first, same
    // "don't trust what the frontend cached" reasoning as AddInstance above.
    [HttpPost("projects/{projectId:guid}/rename-instance")]
    public async Task<IActionResult> RenameInstance(Guid projectId, RenameResourceInstanceRequestDto request)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var newKey = request.NewKey?.Trim();

        if (string.IsNullOrWhiteSpace(request.VariableName) || string.IsNullOrWhiteSpace(request.OldKey) || string.IsNullOrWhiteSpace(newKey))
            return BadRequest(new { message = "A target, its current name, and a new name are required." });

        if (!Regex.IsMatch(newKey, @"^[A-Za-z0-9._-]+$"))
            return BadRequest(new { message = "Name must contain only letters, numbers, dots, dashes, or underscores." });

        var files = await _settings.GetAllProjectFilesAsync(key!, projectId);

        var instance = TerraformResourceExtractor.BuildResourceInstances(files)
            .FirstOrDefault(i => i.VariableName == request.VariableName && i.Key == request.OldKey);

        if (instance == null)
        {
            return Ok(new
            {
                success = false,
                message = "That instance isn't available in this project anymore - refresh and try again."
            });
        }

        var file = files.FirstOrDefault(f => string.Equals(f.FileName, instance.FileName, StringComparison.OrdinalIgnoreCase));

        if (file == null)
            return Ok(new { success = false, message = $"{instance.FileName} wasn't found." });

        var (success, error, updatedContent) = TerraformTfvarsEditor.RenameEntry(
            file.Content, instance.VariableName, instance.Shape, instance.Key, newKey);

        if (!success)
            return Ok(new { success = false, message = error });

        await _settings.UpdateProjectFileAsync(key!, projectId, instance.FileName, updatedContent);

        return Ok(new { success = true });
    }

    // The "no existing target fits" path - deliberately NOT fully wired
    // (see GenerateNewTemplateRequestDto's own comment): appends a starter
    // resource + module block to main.tf, a matching variable declaration
    // to variables.tf, and one starter entry to terraform.tfvars. A
    // starting point to review and connect (Resource Group id, Plan id,
    // etc), same as the existing "Insert starter code" template picker in
    // the file editor - not an attempt to fully automate wiring a new
    // Resource Group/Plan/module set, which would need this app to
    // understand far more about the specific project's own conventions
    // than a static text scan safely can.
    [HttpPost("projects/{projectId:guid}/generate-template")]
    public async Task<IActionResult> GenerateTemplate(Guid projectId, GenerateNewTemplateRequestDto request)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var name = request.Name?.Trim();

        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(request.Kind))
            return BadRequest(new { message = "A kind and a name are required." });

        if (!Regex.IsMatch(name, @"^[A-Za-z0-9._-]+$"))
            return BadRequest(new { message = "Name must contain only letters, numbers, dots, dashes, or underscores." });

        var template = TerraformNewResourceTemplates.Build(request.Kind, name);

        if (template == null)
            return BadRequest(new { message = "Unknown kind." });

        var files = await _settings.GetAllProjectFilesAsync(key!, projectId);

        // Upsert (not update-only) - a project might not already have a
        // separate variables.tf/terraform.tfvars (e.g. a project built
        // entirely from starter-template inserts so far), and this should
        // create them rather than silently drop the template's content.
        string AppendOrCreate(string fileName, string block)
        {
            var existing = files.FirstOrDefault(f => string.Equals(f.FileName, fileName, StringComparison.OrdinalIgnoreCase));
            return existing == null ? block + "\n" : existing.Content.TrimEnd() + "\n\n" + block + "\n";
        }

        var uploads = new List<TerraformFileUploadEntryDto>
        {
            new() { FileName = "main.tf", Content = AppendOrCreate("main.tf", template.MainTfBlock) },
            new() { FileName = "variables.tf", Content = AppendOrCreate("variables.tf", template.VariableBlock) },
            new() { FileName = "terraform.tfvars", Content = AppendOrCreate("terraform.tfvars", template.TfvarsBlock) }
        };

        var results = await _settings.UploadFilesToProjectAsync(key!, projectId, uploads);

        if (results == null)
            return NotFound(new { message = "Project not found." });

        return Ok(new
        {
            success = true,
            updatedFiles = results.Where(r => r.Accepted).Select(r => r.FileName).ToList()
        });
    }

    // Real execution - see TerraformExecutionService's own header comment
    // for the full reasoning (state backend requirement, plan/apply
    // separation, etc). PIN-gated: this decrypts and uses the real client
    // secret to talk to Azure.
    [HttpPost("projects/{projectId:guid}/plan")]
    public async Task<IActionResult> Plan(Guid projectId)
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "terraform") is IActionResult gateDenied)
            return gateDenied;

        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var (success, error, planId, output, summaryLine) = await _execution.PlanAsync(key!, projectId);

        if (!success)
            return Ok(new { success = false, message = error });

        return Ok(new { success = true, planId, output, summaryLine });
    }

    [HttpPost("projects/{projectId:guid}/apply")]
    public async Task<IActionResult> Apply(Guid projectId, TerraformApplyRequestDto request)
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "terraform") is IActionResult gateDenied)
            return gateDenied;

        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var (success, error, output) = await _execution.ApplyAsync(key!, projectId, request.PlanId, request.ConfirmationText);

        var actor = await AdminGate.ResolveCallerLoginAsync(this) ?? $"session {key![..Math.Min(8, key.Length)]}";
        _log.LogInfo("Terraform", $"{actor} {(success ? "applied" : "attempted to apply")} a personal Terraform plan.");

        if (!success)
            return Ok(new { success = false, message = error });

        return Ok(new { success = true, output });
    }
}

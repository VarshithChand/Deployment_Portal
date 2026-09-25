using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Personal (non-org) Terraform page - a standalone top-level sidebar page,
// not nested under Settings/Organizations and not tied to picking an
// organization first (see TerraformFilesController for that org-scoped
// sibling). Deliberately STORAGE AND EDITING ONLY, same reasoning as
// TerraformFileService's own header comment: no terraform binary, no
// plan/apply, no state, no execution of any kind. Every file/credential
// here belongs to the calling user alone (RequireAuth.RequireUserId is the
// only scoping - no roles/permissions needed, unlike the org version, since
// nothing here is ever shared with anyone else).
[ApiController]
[Route("api/terraform")]
public class TerraformController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly SessionActivityService _activity;

    public TerraformController(SettingsService settings, SessionActivityService activity)
    {
        _settings = settings;
        _activity = activity;
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

    [HttpGet("files/{fileName}")]
    public async Task<IActionResult> GetFile(string fileName)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var file = await _settings.GetUserTerraformFileAsync(key!, fileName);

        if (file == null)
            return NotFound(new { message = "File not found." });

        return Ok(file);
    }

    // Bulk upload - the "pick multiple .tf files from my local Terraform
    // folder" flow. Upsert-by-filename (see UploadUserTerraformFilesAsync's
    // own comment), so re-uploading the same folder after local edits just
    // refreshes what's stored rather than erroring on "already exists".
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

    [HttpPut("files/{fileName}")]
    public async Task<IActionResult> UpdateFile(string fileName, UpdateTerraformFileContentDto request)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var updated = await _settings.UpdateUserTerraformFileAsync(key!, fileName, request.Content);

        if (!updated)
            return NotFound(new { message = "File not found." });

        return Ok(new { success = true });
    }

    [HttpDelete("files/{fileName}")]
    public async Task<IActionResult> DeleteFile(string fileName)
    {
        var (key, denied) = RequireAuth.RequireUserId(this);
        if (denied != null) return denied;

        var deleted = await _settings.DeleteUserTerraformFileAsync(key!, fileName);

        if (!deleted)
            return NotFound(new { message = "File not found." });

        return Ok(new { success = true });
    }
}

using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Backs the Services page's "Security" tab's API Keys panel — persisted
// through SettingsService (see SettingsService.GetApiKeysAsync) rather
// than an in-memory store, so keys survive a redeploy/restart the same
// way every other admin-managed setting in this app already does.
[ApiController]
[Route("api/security/api-keys")]
public class SecurityApiKeysController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly SessionActivityService _activity;

    public SecurityApiKeysController(SettingsService settings, SessionActivityService activity)
    {
        _settings = settings;
        _activity = activity;
    }

    // Everyone's keys, every owner — the Services > Security admin panel.
    // Previously had no gate at all: any visitor who knew this route could
    // see every PAT user's key name/owner/creation date, well past what
    // the Services page being admin-only client-side implied was
    // protected. Page-scoped ("services") same as the rest of that page.
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view API keys", "services") is IActionResult denied)
            return denied;

        var keys = await _settings.GetApiKeysAsync();

        // One batched lookup instead of one GitHub API call per key -
        // GetPatUsersAsync already resolves every PAT user's real GitHub
        // identity, so this just matches each key's OwnerKey against that
        // same list rather than resolving anything itself.
        var patUsers = await _settings.GetPatUsersAsync();

        var dtos = keys
            .OrderBy(k => k.Id)
            .Select(k => ToDto(k, patUsers))
            .ToList();

        return Ok(dtos);
    }

    // Returns the raw key exactly once — see SettingsService.CreateApiKeyAsync.
    [HttpPost]
    public async Task<IActionResult> Create(CreateApiKeyRequest request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "create an API key", "services") is IActionResult denied)
            return denied;

        var (ownerKey, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

        return Ok(await CreateForOwnerAsync(request, ownerKey!));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Revoke(int id)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "revoke an API key", "services") is IActionResult denied)
            return denied;

        return await _settings.RevokeApiKeyAsync(id) ? NoContent() : NotFound();
    }

    // Self-service, no admin gate — every visitor already manages their
    // own GitHub/AWS/Azure/GCP credentials with no admin required (see
    // SettingsController's /me/* endpoints), same pattern here: a PAT
    // user's own API key(s), scoped strictly to their own PortalIdentity
    // key so they can never see or touch anyone else's. Reachable from
    // Settings > Credentials rather than the admin-only Services page.
    [HttpGet("mine")]
    public async Task<IActionResult> GetMine()
    {
        var (callerKey, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

        var patUsers = await _settings.GetPatUsersAsync();

        var dtos = (await _settings.GetApiKeysAsync())
            .Where(k => k.OwnerKey == callerKey)
            .OrderBy(k => k.Id)
            .Select(k => ToDto(k, patUsers))
            .ToList();

        return Ok(dtos);
    }

    [HttpPost("mine")]
    public async Task<IActionResult> CreateMine(CreateApiKeyRequest request)
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "apikey") is IActionResult locked)
            return locked;

        // Always succeeds here - DenyUnlessUnlockedAsync above already
        // requires an authenticated caller.
        var (callerKey, _) = RequireAuth.RequireUserId(this);
        return Ok(await CreateForOwnerAsync(request, callerKey!));
    }

    [HttpDelete("mine/{id}")]
    public async Task<IActionResult> RevokeMine(int id)
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "apikey") is IActionResult locked)
            return locked;

        // Always succeeds here - DenyUnlessUnlockedAsync above already
        // requires an authenticated caller.
        var (callerKey, _) = RequireAuth.RequireUserId(this);
        var owns = (await _settings.GetApiKeysAsync()).Any(k => k.Id == id && k.OwnerKey == callerKey);

        if (!owns)
            return NotFound();

        return await _settings.RevokeApiKeyAsync(id) ? NoContent() : NotFound();
    }

    private async Task<CreatedApiKeyDto> CreateForOwnerAsync(CreateApiKeyRequest request, string ownerKey)
    {
        var (entry, rawKey) = await _settings.CreateApiKeyAsync(request.Name, ownerKey);

        var patUsers = await _settings.GetPatUsersAsync();
        var dto = ToDto(entry, patUsers);

        return new CreatedApiKeyDto
        {
            Id = dto.Id,
            Name = dto.Name,
            Prefix = dto.Prefix,
            CreatedAt = dto.CreatedAt,
            Revoked = dto.Revoked,
            OwnerLogin = dto.OwnerLogin,
            Key = rawKey
        };
    }

    private static ApiKeyDto ToDto(ApiKey key, List<PatUserSummaryDto> patUsers)
    {
        var owner = patUsers.FirstOrDefault(u => u.Key == key.OwnerKey);

        return new ApiKeyDto
        {
            Id = key.Id,
            Name = key.Name,
            Prefix = key.Prefix,
            CreatedAt = key.CreatedAt,
            Revoked = key.Revoked,
            OwnerLogin = owner?.PatOwnerLogin ?? "Unknown owner"
        };
    }
}

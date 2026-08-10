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

    public SecurityApiKeysController(SettingsService settings)
    {
        _settings = settings;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
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
        var ownerKey = PortalIdentity.GetOrCreateKey(HttpContext);
        var (entry, rawKey) = await _settings.CreateApiKeyAsync(request.Name, ownerKey);

        var patUsers = await _settings.GetPatUsersAsync();
        var dto = ToDto(entry, patUsers);

        return Ok(new CreatedApiKeyDto
        {
            Id = dto.Id,
            Name = dto.Name,
            Prefix = dto.Prefix,
            CreatedAt = dto.CreatedAt,
            Revoked = dto.Revoked,
            OwnerKey = dto.OwnerKey,
            OwnerLogin = dto.OwnerLogin,
            Key = rawKey
        });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Revoke(int id)
    {
        return await _settings.RevokeApiKeyAsync(id) ? NoContent() : NotFound();
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
            OwnerKey = key.OwnerKey,
            OwnerLogin = owner?.PatOwnerLogin ?? "Unknown owner"
        };
    }
}

using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Backs the Services page's "Security (SecurityAPI)" tab's API Keys
// panel — see ApiKeyStore for why this lives in DeploymentAPI itself
// rather than a separate origin.
[ApiController]
[Route("api/security/api-keys")]
public class SecurityApiKeysController : ControllerBase
{
    private readonly ApiKeyStore _keys;
    private readonly SettingsService _settings;

    public SecurityApiKeysController(ApiKeyStore keys, SettingsService settings)
    {
        _keys = keys;
        _settings = settings;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var keys = _keys.GetAll();

        // One batched lookup instead of one GitHub API call per key -
        // GetPatUsersAsync already resolves every PAT user's real GitHub
        // identity, so this just matches each key's OwnerKey against that
        // same list rather than resolving anything itself.
        var patUsers = await _settings.GetPatUsersAsync();

        foreach (var key in keys)
        {
            var owner = patUsers.FirstOrDefault(u => u.Key == key.OwnerKey);
            if (owner != null) key.OwnerLogin = owner.PatOwnerLogin;
        }

        return Ok(keys);
    }

    // Returns the raw key exactly once — see ApiKeyStore.Create.
    [HttpPost]
    public IActionResult Create(CreateApiKeyRequest request)
    {
        var ownerKey = PortalIdentity.GetOrCreateKey(HttpContext);
        return Ok(_keys.Create(request, ownerKey));
    }

    [HttpDelete("{id}")]
    public IActionResult Revoke(int id)
    {
        return _keys.Revoke(id) ? NoContent() : NotFound();
    }
}

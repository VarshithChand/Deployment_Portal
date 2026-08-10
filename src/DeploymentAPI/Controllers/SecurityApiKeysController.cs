using DeploymentAPI.DTOs;
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

    public SecurityApiKeysController(ApiKeyStore keys)
    {
        _keys = keys;
    }

    [HttpGet]
    public IActionResult GetAll()
    {
        return Ok(_keys.GetAll());
    }

    // Returns the raw key exactly once — see ApiKeyStore.Create.
    [HttpPost]
    public IActionResult Create(CreateApiKeyRequest request)
    {
        return Ok(_keys.Create(request));
    }

    [HttpDelete("{id}")]
    public IActionResult Revoke(int id)
    {
        return _keys.Revoke(id) ? NoContent() : NotFound();
    }
}

using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Settings > External APIs — admin-only end to end, same as Sonar/Smoke
// Tests: this saves a portal-wide URL list and makes the server itself
// issue outbound requests to whatever's in it, exactly the kind of action
// the admin allowlist exists to gate. No class-level [Authorize]:
// bootstrap mode needs the same unauthenticated-first-configure path
// every other admin-gated controller allows — see AdminGate.
[ApiController]
[Route("api/externalhealth")]
public class ExternalHealthController : ControllerBase
{
    private const int MaxUrlsPerCheck = 200;

    private readonly ExternalHealthCheckService _checker;
    private readonly SettingsService _settings;

    public ExternalHealthController(ExternalHealthCheckService checker, SettingsService settings)
    {
        _checker = checker;
        _settings = settings;
    }

    [HttpGet("endpoints")]
    public async Task<IActionResult> GetEndpoints()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view external API endpoints") is IActionResult denied)
            return denied;

        return Ok(new { endpointsText = await _settings.GetExternalHealthEndpointsAsync() });
    }

    [HttpPost("endpoints")]
    public async Task<IActionResult> SaveEndpoints(ExternalHealthEndpointsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change external API endpoints") is IActionResult denied)
            return denied;

        var saved = await _settings.SaveExternalHealthEndpointsAsync(request.EndpointsText);

        return Ok(new { endpointsText = saved });
    }

    [HttpPost("check")]
    public async Task<IActionResult> Check(ExternalHealthCheckRequestDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "check external API health") is IActionResult denied)
            return denied;

        var urls = (request.Urls ?? new List<string>())
            .Where(u => !string.IsNullOrWhiteSpace(u))
            .ToList();

        if (urls.Count == 0)
            return BadRequest(new { message = "No URLs to check." });

        if (urls.Count > MaxUrlsPerCheck)
            return BadRequest(new { message = $"Too many URLs at once (max {MaxUrlsPerCheck})." });

        return Ok(await _checker.CheckAllAsync(urls));
    }
}

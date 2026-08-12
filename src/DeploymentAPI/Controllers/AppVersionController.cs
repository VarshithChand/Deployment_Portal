using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Forces a refresh for every visitor after a new frontend build is
// deployed, since Cloudflare Workers (this app's static host) has no
// server-push mechanism of its own — the frontend polls GET here (see
// utils/appCacheManager.js / AppUpdateMonitor.jsx) and prompts a reload
// once the server's counter is ahead of what it last saw. Anonymous GET on
// purpose: even a visitor stuck at the pre-login "connect your repo" gate
// should get prompted onto the latest build. The increment itself is
// admin-gated — anyone bumping this forces literally every open tab across
// every visitor to reload.
[ApiController]
[Route("api/appversion")]
public class AppVersionController : ControllerBase
{
    private readonly SettingsService _settings;

    public AppVersionController(SettingsService settings)
    {
        _settings = settings;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        return Ok(new { version = await _settings.GetAppVersionAsync() });
    }

    [HttpPost("clear-cache")]
    public async Task<IActionResult> ClearCache()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "force a refresh for all users") is IActionResult denied)
            return denied;

        var version = await _settings.IncrementAppVersionAsync();

        return Ok(new { success = true, version });
    }
}

using DeploymentAPI.DTOs;
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
    private readonly SessionActivityService _activity;

    public AppVersionController(SettingsService settings, SessionActivityService activity)
    {
        _settings = settings;
        _activity = activity;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        return Ok(new { version = await _settings.GetAppVersionAsync() });
    }

    // Every session's frontend reports its own build-time commit/version
    // once per app load (see deployment-ui/utils/buildInfo.js) - open to
    // any session, same as this whole controller's GET above, since
    // Application Support's "User Versions" view (admin-only to READ) is
    // meant to cover every visitor, not just admins. Nothing here is a
    // secret - just the same public build stamp already visible in the
    // browser's own JS bundle.
    [HttpPost("frontend-heartbeat")]
    public IActionResult FrontendHeartbeat([FromBody] FrontendHeartbeatRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Commit))
            return BadRequest(new { message = "commit is required." });

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        _activity.RecordFrontendBuild(key, request.Commit, request.Version, request.Environment);

        return Ok();
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

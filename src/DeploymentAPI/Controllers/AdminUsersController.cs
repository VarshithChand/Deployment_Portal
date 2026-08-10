using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Backs the Services page's "Users (AdminAPI)" tab — the real PAT users
// list (same data/gate as SettingsController's own pat-users endpoint,
// used by Settings > Sidebar Access), not a separate fake user store.
// There's no "create/edit a user" here because a PAT user isn't an
// account this portal manages directly - it exists only because someone
// configured a Personal Access Token in Settings > GitHub. What IS
// admin-manageable is what happens to that session from here on: force
// it to sign out right now, or block it outright (see
// SettingsService.BlockPatUserAsync) so it's rejected even with a still-
// valid token.
[ApiController]
[Route("api/admin/users")]
public class AdminUsersController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly SessionActivityService _activity;

    public AdminUsersController(SettingsService settings, SessionActivityService activity)
    {
        _settings = settings;
        _activity = activity;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view PAT users") is IActionResult denied)
            return denied;

        var users = await _settings.GetPatUsersAsync();

        foreach (var user in users)
        {
            user.LastActiveUtc = _activity.GetLastSeen(user.Key);
            user.Device = DeviceInfo.Describe(_activity.GetLastUserAgent(user.Key));
            user.IpAddress = _activity.GetLastIpAddress(user.Key);
        }

        return Ok(users);
    }

    // A soft delete (see SettingsService.SoftSignOutPatUserAsync) - their
    // saved token/repo are left alone, just reported as absent, which
    // puts RequireGitHubSetup's PAT popup back in front of them next time
    // they try to do anything. This persists (unlike a plain force-logout)
    // - it survives even if they weren't actively browsing when this ran,
    // and undoes itself the moment they reconnect a token. Also bumps the
    // force-logout signal so an already-open tab reloads into that popup
    // right away instead of only discovering it on its next action.
    [HttpPost("{key}/logout")]
    public async Task<IActionResult> ForceLogout(string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "sign out a PAT user") is IActionResult denied)
            return denied;

        await _settings.SoftSignOutPatUserAsync(key);
        _activity.ForceLogout(key);

        return Ok();
    }

    // No force-logout bump here (unlike ForceLogout above) - the block-
    // check middleware in Program.cs already 403s every request from this
    // key from this point on, including its own polling of
    // GET /api/auth/session-epoch, and GlobalLogoutMonitor treats that
    // 403 itself as the "show the blocked overlay" signal. A forced
    // reload would just fight with that smooth in-place transition for no
    // benefit.
    [HttpPost("{key}/block")]
    public async Task<IActionResult> Block(string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "block a PAT user") is IActionResult denied)
            return denied;

        await _settings.BlockPatUserAsync(key);
        return Ok();
    }

    [HttpPost("{key}/unblock")]
    public async Task<IActionResult> Unblock(string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "unblock a PAT user") is IActionResult denied)
            return denied;

        await _settings.UnblockPatUserAsync(key);
        return Ok();
    }
}

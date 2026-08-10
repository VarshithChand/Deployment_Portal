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
            user.LastActiveUtc = _activity.GetLastSeen(user.Key);

        return Ok(users);
    }

    // Ends that one session immediately - see GlobalLogoutMonitor's
    // mySessionForceLogoutEpoch handling for how the browser on the other
    // end notices and signs itself out within one poll interval.
    [HttpPost("{key}/logout")]
    public async Task<IActionResult> ForceLogout(string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "sign out a PAT user") is IActionResult denied)
            return denied;

        _activity.ForceLogout(key);
        return Ok();
    }

    // Also forces an immediate sign-out (see above) so the blocked
    // session doesn't sit there erroring out on its next request instead
    // of getting a clean "you've been signed out."
    [HttpPost("{key}/block")]
    public async Task<IActionResult> Block(string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "block a PAT user") is IActionResult denied)
            return denied;

        await _settings.BlockPatUserAsync(key);
        _activity.ForceLogout(key);

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

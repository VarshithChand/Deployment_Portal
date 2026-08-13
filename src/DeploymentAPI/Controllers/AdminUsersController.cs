using System.Linq;
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
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view PAT users", "services") is IActionResult denied)
            return denied;

        var users = await _settings.GetPatUsersAsync();

        foreach (var user in users)
        {
            // Every per-key lookup below needs the REAL session key
            // (SessionActivityService is keyed by it too) - the swap to a
            // non-replayable row ID happens last, only in the value that
            // actually reaches the response.
            user.LastActiveUtc = _activity.GetLastSeen(user.Key);
            user.Device = DeviceInfo.Describe(_activity.GetLastUserAgent(user.Key));
            user.IpAddress = _activity.GetLastIpAddress(user.Key);
            user.UsedEndpoints = _activity.GetUsedEndpoints(user.Key);

            var frontendBuild = _activity.GetFrontendBuild(user.Key);
            user.FrontendCommit = frontendBuild?.Commit;
            user.FrontendVersion = frontendBuild?.Version;
            user.FrontendEnvironment = frontendBuild?.Environment;
            user.FrontendLastSeenUtc = frontendBuild?.ReportedAtUtc;

            user.Key = await _settings.ComputeSessionRowIdAsync(user.Key);
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
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "sign out a PAT user", "services") is IActionResult denied)
            return denied;

        if (await ResolveRealKeyAsync(key) is not string realKey)
            return NotFound(new { message = "That user's session no longer exists." });

        await _settings.SoftSignOutPatUserAsync(realKey);
        _activity.ForceLogout(realKey);

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
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "block a PAT user", "services") is IActionResult denied)
            return denied;

        if (await ResolveRealKeyAsync(key) is not string realKey)
            return NotFound(new { message = "That user's session no longer exists." });

        await _settings.BlockPatUserAsync(realKey);
        return Ok();
    }

    [HttpPost("{key}/unblock")]
    public async Task<IActionResult> Unblock(string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "unblock a PAT user", "services") is IActionResult denied)
            return denied;

        if (await ResolveRealKeyAsync(key) is not string realKey)
            return NotFound(new { message = "That user's session no longer exists." });

        await _settings.UnblockPatUserAsync(realKey);
        return Ok();
    }

    // Recovers an account whose authenticator device is lost/unavailable -
    // a full MFA removal for that login (see
    // SettingsService.ResetMfaForLoginAsync), same as the user disabling
    // it themselves would do, just reached without their old code since
    // that's the entire point. They must fully re-enroll afterward if
    // they still want MFA protecting their account.
    [HttpPost("{key}/reset-mfa")]
    public async Task<IActionResult> ResetMfa(string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "reset a PAT user's MFA", "services") is IActionResult denied)
            return denied;

        if (await ResolveRealKeyAsync(key) is not string realKey)
            return NotFound(new { message = "That user's session no longer exists." });

        var login = await _settings.ResolveCurrentLoginForKeyAsync(realKey);

        if (login == null)
            return NotFound(new { message = "Unable to resolve that session's GitHub identity right now." });

        await _settings.ResetMfaForLoginAsync(login);

        return Ok();
    }

    // Issues a single-use recovery code for a user who's locked out (lost
    // their authenticator device) but doesn't need a full MFA reset - the
    // super-admin relays this code to them out-of-band (phone/chat), and
    // they use it exactly like any recovery code (see
    // VerifyMfaRecoveryCodeAsync). Deliberately narrower than reset-mfa
    // above (general-admin-gated, still available) - this one is
    // super-admin-only, since generating a working credential on someone
    // else's behalf is a step up from removing their existing enrollment.
    [HttpPost("{key}/mfa/recovery-code")]
    public async Task<IActionResult> GenerateMfaRecoveryCode(string key)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "generate an MFA recovery code") is IActionResult denied)
            return denied;

        if (await ResolveRealKeyAsync(key) is not string realKey)
            return NotFound(new { message = "That user's session no longer exists." });

        var login = await _settings.ResolveCurrentLoginForKeyAsync(realKey);

        if (login == null)
            return NotFound(new { message = "Unable to resolve that session's GitHub identity right now." });

        var code = await _settings.GenerateAdminRecoveryCodeAsync(login);

        if (code == null)
            return BadRequest(new { message = "This user hasn't enabled MFA yet." });

        return Ok(new { code });
    }

    // A real delete (see SettingsService.DeletePatUserAsync) - removes
    // this session's row entirely rather than just soft-signing it out.
    // Also forces an immediate sign-out for the same reason ForceLogout
    // above does, so a live tab doesn't keep working against credentials
    // that no longer exist.
    [HttpDelete("{key}")]
    public async Task<IActionResult> Delete(string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "delete a PAT user", "services") is IActionResult denied)
            return denied;

        if (await ResolveRealKeyAsync(key) is not string realKey)
            return NotFound(new { message = "That user's session no longer exists." });

        await _settings.DeletePatUserAsync(realKey);
        _activity.ForceLogout(realKey);

        return Ok();
    }

    // key here is a non-reversible row ID (see SettingsService.
    // ComputeSessionRowIdAsync), not the real PortalIdentity session key -
    // every mutating action above needs the real key back before it can
    // act, since that's what SettingsService/SessionActivityService are
    // actually keyed by.
    private async Task<string?> ResolveRealKeyAsync(string rowId) =>
        await _settings.ResolveSessionKeyFromRowIdAsync(rowId);

    // Cleans up rows that predate SaveUserGitHubCredentialsAsync's one-
    // session-per-PAT check (added after this list already had repeat
    // rows for the same GitHub account, e.g. one person's Chrome and Edge
    // sessions each stuck around as their own permanent-looking entry) -
    // that check only stops NEW duplicates at save time, it doesn't
    // retroactively merge ones already sitting here. Per real GitHub
    // identity, keeps whichever key was active most recently and deletes
    // the rest via DeletePatUserAsync; unresolvable tokens ("Unknown...")
    // are left alone since there's no real identity to group them by.
    [HttpPost("dedupe")]
    public async Task<IActionResult> RemoveDuplicates()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "remove duplicate PAT users", "services") is IActionResult denied)
            return denied;

        var users = await _settings.GetPatUsersAsync();

        var groups = users
            .Where(u => !u.PatOwnerLogin.StartsWith("Unknown", StringComparison.Ordinal))
            .GroupBy(u => u.PatOwnerLogin);

        var removedCount = 0;

        foreach (var group in groups)
        {
            if (group.Count() <= 1)
                continue;

            var keep = group
                .OrderByDescending(u => _activity.GetLastSeen(u.Key) ?? DateTime.MinValue)
                .First();

            foreach (var duplicate in group.Where(u => u.Key != keep.Key))
            {
                await _settings.DeletePatUserAsync(duplicate.Key);
                removedCount++;
            }
        }

        return Ok(new { removedCount });
    }
}

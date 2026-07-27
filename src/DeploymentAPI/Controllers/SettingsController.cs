using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// No class-level [Authorize] here on purpose: every mutating action below
// already runs through AdminGate.DenyUnlessAdminAsync, which is bootstrap-
// aware (an anonymous caller may configure settings only while the admin
// allowlist is still empty — see AdminGate). A blanket [Authorize] would sit
// in front of that check and block the very bootstrap flow it exists for,
// since nobody could log in before any admin/OAuth app has been configured.
// Get() is likewise intentionally anonymous — the frontend calls it before
// login even happens, to decide whether to show a "Login with GitHub"
// button at all — and it's already safe: see SettingsViewDto, secrets are
// never echoed back, only whether one has been saved.
[ApiController]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly GitHubApiService _github;

    public SettingsController(SettingsService settings, GitHubApiService github)
    {
        _settings = settings;
        _github = github;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var view = await _settings.GetViewAsync();

        // The admin allowlist is only needed by an admin editing it, or
        // during bootstrap when it's empty anyway — showing the real
        // usernames to an anonymous/non-admin visitor once configured is
        // pure reconnaissance value (exactly who to target to gain admin
        // access here) for no functional benefit, since they can't act on
        // it either way.
        if (!AdminGate.IsAdminOrBootstrap(this, view))
        {
            view.AdminGitHubUsernames = new List<string>();
        }

        return Ok(view);
    }

    [HttpGet("github/preview")]
    public async Task<IActionResult> PreviewGitHub([FromQuery] string owner, [FromQuery] string repository)
    {
        if (string.IsNullOrWhiteSpace(owner) || string.IsNullOrWhiteSpace(repository))
            return BadRequest("owner and repository are required.");

        return Ok(await _github.PreviewRepositoryAsync(owner, repository));
    }

    // Changing credentials or the admin allowlist is restricted to admins —
    // without this, any anonymous visitor could overwrite the GitHub PAT,
    // point the OAuth app at their own client, or add their own GitHub
    // username to the admin list. The one exception is a fresh, unconfigured
    // instance (no admin designated yet): the first person to visit Settings
    // has to be able to configure it without a login that, before any admin
    // exists, nobody could have obtained. See AdminGate for the shared rule.

    [HttpPost("github")]
    public async Task<IActionResult> SaveGitHub(GitHubSettingsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        return Ok(await _settings.SaveGitHubAsync(request));
    }

    [HttpPost("docker")]
    public async Task<IActionResult> SaveDocker(DockerSettingsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        return Ok(await _settings.SaveDockerAsync(request));
    }

    [HttpPost("github-oauth")]
    public async Task<IActionResult> SaveGitHubOAuth(GitHubOAuthUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        return Ok(await _settings.SaveGitHubOAuthAsync(request));
    }

    [HttpPost("admins")]
    public async Task<IActionResult> SaveAdmins(AdminUsernamesUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        return Ok(await _settings.SaveAdminUsernamesAsync(request));
    }

    [HttpDelete("{section}")]
    public async Task<IActionResult> Clear(string section)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        try
        {
            return Ok(await _settings.ClearAsync(section));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }
}

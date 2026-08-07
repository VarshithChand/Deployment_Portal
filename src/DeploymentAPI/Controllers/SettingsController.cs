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

        var isAdmin = AdminGate.IsAdminOrBootstrap(this, view)
            || await AdminGate.IsAdminViaPersonalAccessTokenAsync(this, view);

        view.IsAdminSession = isAdmin;

        // The admin allowlist is only needed by an admin editing it, or
        // during bootstrap when it's empty anyway — showing the real
        // usernames to an anonymous/non-admin visitor once configured is
        // pure reconnaissance value (exactly who to target to gain admin
        // access here) for no functional benefit, since they can't act on
        // it either way.
        if (!isAdmin)
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

    // Dashboard's "Public Repository Lookup" — typing a bare GitHub
    // username instead of a full repo URL, listing every public repo
    // that username owns so the caller can pick one.
    [HttpGet("github/preview-user")]
    public async Task<IActionResult> PreviewGitHubUser([FromQuery] string username)
    {
        if (string.IsNullOrWhiteSpace(username))
            return BadRequest("username is required.");

        return Ok(await _github.PreviewUserRepositoriesAsync(username));
    }

    // Every visitor manages their own GitHub repo + token — no AdminGate,
    // no [Authorize], no GitHub OAuth login required at all. PortalIdentity
    // resolves who's asking: a real GitHub login if one exists, otherwise
    // an anonymous per-browser session cookie it creates on the spot. That's
    // what lets this work immediately for anyone, isolated from every other
    // visitor, without anyone needing to set up (or complete) an OAuth App.

    [HttpGet("me/github")]
    public async Task<IActionResult> GetMyGitHub()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGitHubCredentialsAsync(key);

        return Ok(new
        {
            GitHubOwner = creds.Owner,
            GitHubRepository = creds.Repository,
            GitHubTokenConfigured = creds.TokenConfigured,
            IsConfigured = creds.IsConfigured
        });
    }

    [HttpPost("me/github")]
    public async Task<IActionResult> SaveMyGitHub(GitHubSettingsUpdateDto request)
    {
        // Owner/Repository end up interpolated into dozens of GitHub API
        // URLs across this app's lifetime, not just this one request -
        // rejecting anything outside a real GitHub name's character set
        // here means every one of those later uses is safe from a crafted
        // value redirecting a request onto an unintended API path.
        if (!GitHubNameValidator.IsValid(request.Owner) || !GitHubNameValidator.IsValid(request.Repository))
            return BadRequest(new { message = "Owner and repository must be valid GitHub names (letters, numbers, hyphens, underscores, periods only)." });

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.SaveUserGitHubCredentialsAsync(key, request);

        return Ok(new
        {
            GitHubOwner = creds.Owner,
            GitHubRepository = creds.Repository,
            GitHubTokenConfigured = creds.TokenConfigured,
            IsConfigured = creds.IsConfigured
        });
    }

    [HttpDelete("me/github")]
    public async Task<IActionResult> ClearMyGitHubToken()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserGitHubTokenAsync(key);
        return Ok();
    }

    // Same per-visitor isolation as GitHub above, for the Environments
    // detail view's live AWS ECS/ECR lookup — the credentials never leave
    // this browser's own session slot.
    [HttpGet("me/aws")]
    public async Task<IActionResult> GetMyAws()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(new { Configured = creds.IsConfigured, Region = creds.Region });
    }

    [HttpPost("me/aws")]
    public async Task<IActionResult> SaveMyAws(AwsCredentialsUpdateDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);

        // A blank field keeps whatever's already saved (see
        // SaveUserAwsCredentialsAsync) - only reject if the access key or
        // secret would still be missing after that merge.
        var existing = await _settings.GetUserAwsCredentialsAsync(key);

        var hasAccessKey = !string.IsNullOrWhiteSpace(request.AccessKeyId) || !string.IsNullOrWhiteSpace(existing.AccessKeyId);
        var hasSecret = !string.IsNullOrWhiteSpace(request.SecretAccessKey) || !string.IsNullOrWhiteSpace(existing.SecretAccessKey);

        if (!hasAccessKey || !hasSecret)
            return BadRequest(new { message = "Access key ID and secret access key are required." });

        await _settings.SaveUserAwsCredentialsAsync(key, request);

        return Ok(new { Configured = true });
    }

    [HttpDelete("me/aws")]
    public async Task<IActionResult> ClearMyAws()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserAwsCredentialsAsync(key);
        return Ok();
    }

    // Same per-visitor isolation, for the Environments detail view's live
    // Azure Web App lookup.
    [HttpGet("me/azure")]
    public async Task<IActionResult> GetMyAzure()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(new { Configured = creds.IsConfigured });
    }

    [HttpPost("me/azure")]
    public async Task<IActionResult> SaveMyAzure(AzureCredentialsUpdateDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);

        // A blank field keeps whatever's already saved - see SaveMyAws above.
        var existing = await _settings.GetUserAzureCredentialsAsync(key);

        var hasTenant = !string.IsNullOrWhiteSpace(request.TenantId) || !string.IsNullOrWhiteSpace(existing.TenantId);
        var hasClient = !string.IsNullOrWhiteSpace(request.ClientId) || !string.IsNullOrWhiteSpace(existing.ClientId);
        var hasSecret = !string.IsNullOrWhiteSpace(request.ClientSecret) || !string.IsNullOrWhiteSpace(existing.ClientSecret);

        if (!hasTenant || !hasClient || !hasSecret)
            return BadRequest(new { message = "Tenant ID, client ID, and client secret are required." });

        await _settings.SaveUserAzureCredentialsAsync(key, request);

        return Ok(new { Configured = true });
    }

    [HttpDelete("me/azure")]
    public async Task<IActionResult> ClearMyAzure()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserAzureCredentialsAsync(key);
        return Ok();
    }

    // Same per-visitor isolation, for GCP — stored for future use, nothing
    // in this portal reads it yet.
    [HttpGet("me/gcp")]
    public async Task<IActionResult> GetMyGcp()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        return Ok(new { Configured = creds.IsConfigured, ProjectId = creds.ProjectId });
    }

    [HttpPost("me/gcp")]
    public async Task<IActionResult> SaveMyGcp(GcpCredentialsUpdateDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);

        // A blank field keeps whatever's already saved - see SaveMyAws above.
        var existing = await _settings.GetUserGcpCredentialsAsync(key);

        var hasProjectId = !string.IsNullOrWhiteSpace(request.ProjectId) || !string.IsNullOrWhiteSpace(existing.ProjectId);
        var hasKey = !string.IsNullOrWhiteSpace(request.ServiceAccountKeyJson) || !string.IsNullOrWhiteSpace(existing.ServiceAccountKeyJson);

        if (!hasProjectId || !hasKey)
            return BadRequest(new { message = "Project ID and service account key are required." });

        await _settings.SaveUserGcpCredentialsAsync(key, request);

        return Ok(new { Configured = true });
    }

    [HttpDelete("me/gcp")]
    public async Task<IActionResult> ClearMyGcp()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserGcpCredentialsAsync(key);
        return Ok();
    }

    // Changing shared, portal-wide credentials or the admin allowlist is
    // restricted to admins — without this, any anonymous visitor could
    // point the Docker registry at their own account, point the OAuth app
    // at their own client, or add their own GitHub username to the admin
    // list. The one exception is a fresh, unconfigured instance (no admin
    // designated yet): the first person to visit Settings has to be able
    // to configure it without a login that, before any admin exists,
    // nobody could have obtained. See AdminGate for the shared rule.

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

    [HttpPost("sonar")]
    public async Task<IActionResult> SaveSonar(SonarSettingsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        return Ok(await _settings.SaveSonarAsync(request));
    }

    [HttpPost("admins")]
    public async Task<IActionResult> SaveAdmins(AdminUsernamesUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        return Ok(await _settings.SaveAdminUsernamesAsync(request));
    }

    // Read is anonymous — every visitor's own Sidebar needs to know which of
    // ITS OWN tabs to grey out or remove. Restrictions are per PAT user
    // (see SettingsService), so this always resolves to the caller's own
    // key — nobody can read (or infer) what's restricted for anyone else
    // through this endpoint.
    [HttpGet("sidebar")]
    public async Task<IActionResult> GetSidebarAccess()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        return Ok(await _settings.GetSidebarAccessAsync(key));
    }

    // Admin-only picker: every browser/device that has configured a PAT,
    // so the admin can choose one to restrict. See Settings > Sidebar
    // Access, which lists these before showing the per-tab editor for
    // whichever one is selected.
    [HttpGet("sidebar/users")]
    public async Task<IActionResult> GetPatUsers()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view PAT users") is IActionResult denied)
            return denied;

        return Ok(await _settings.GetPatUsersAsync());
    }

    [HttpGet("sidebar/user")]
    public async Task<IActionResult> GetUserSidebarAccess([FromQuery] string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view sidebar access") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(key))
            return BadRequest("key is required.");

        return Ok(await _settings.GetSidebarAccessAsync(key));
    }

    [HttpPost("sidebar/user")]
    public async Task<IActionResult> SaveUserSidebarAccess([FromQuery] string key, SidebarAccessUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change sidebar access") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(key))
            return BadRequest("key is required.");

        return Ok(await _settings.SaveSidebarAccessAsync(key, request.States));
    }

    [HttpDelete("sidebar/user")]
    public async Task<IActionResult> ClearUserSidebarAccess([FromQuery] string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change sidebar access") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(key))
            return BadRequest("key is required.");

        await _settings.ClearSidebarAccessAsync(key);
        return Ok(await _settings.GetSidebarAccessAsync(key));
    }

    [HttpDelete("{section}")]
    public async Task<IActionResult> Clear(string section)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        try
        {
            if (section == "all")
            {
                var key = PortalIdentity.GetOrCreateKey(HttpContext);
                return Ok(await _settings.ClearAllAsync(key));
            }

            return Ok(await _settings.ClearAsync(section));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }
}

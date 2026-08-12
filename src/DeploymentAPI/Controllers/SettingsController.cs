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
    private readonly CloudStatusService _cloud;
    private readonly GitHubAuthService _githubAuth;

    public SettingsController(SettingsService settings, GitHubApiService github, CloudStatusService cloud, GitHubAuthService githubAuth)
    {
        _settings = settings;
        _github = github;
        _cloud = cloud;
        _githubAuth = githubAuth;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var view = await _settings.GetViewAsync();

        var isAdmin = AdminGate.IsAdminOrBootstrap(this, view)
            || await AdminGate.IsAdminViaPersonalAccessTokenAsync(this, view);

        view.IsAdminSession = isAdmin;
        view.IsSuperAdminSession = await AdminGate.IsSuperAdminAsync(this);

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
            IsConfigured = creds.IsConfigured,
            WasSignedOut = await _settings.IsPatUserSignedOutAsync(key)
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

    // Read-only confirmation of whose token this actually is - GitHubAuthService
    // is loaded fresh per request (see the middleware in Program.cs), so
    // calling this right after SaveMyGitHub (a separate request) picks up
    // whatever was just saved. Not folded into GetMyGitHub itself: that one's
    // called on every page load, and this costs a real GitHub API call each
    // time, worth paying only when RequireGitHubSetup actually wants to show it.
    [HttpGet("me/github/username")]
    public async Task<IActionResult> GetMyGitHubUsername()
    {
        var username = await _githubAuth.GetAuthenticatedLoginAsync();
        return Ok(new { Username = username });
    }

    // Step 1 of RequireGitHubSetup's "Connect your repository" flow -
    // previews a token that hasn't been saved anywhere yet (whose it is,
    // every repo it can see) so step 2 can offer "pick a repo" instead of
    // requiring an exact URL already known. No AdminGate: previewing your
    // own not-yet-saved token needs no more permission than saving it does.
    [HttpPost("me/github/preview")]
    public async Task<IActionResult> PreviewMyGitHubToken(TokenPreviewRequestDto request)
    {
        var result = await _github.PreviewTokenAsync(request.PersonalAccessToken);
        return Ok(result);
    }

    // Same per-visitor isolation as GitHub above, for the Environments
    // detail view's live AWS ECS/ECR lookup — the credentials never leave
    // this browser's own session slot.
    [HttpGet("me/aws")]
    public async Task<IActionResult> GetMyAws()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        // Only asks AWS "who are you" when there's actually a credential to
        // ask about - the common case (AWS never configured at all) stays a
        // single cheap local read, no outbound call.
        var identityLabel = creds.IsConfigured
            ? await _cloud.GetCallerIdentityLabelAsync(creds)
            : null;

        return Ok(new
        {
            Configured = creds.IsConfigured,
            Region = creds.Region,
            MfaEnrolled = creds.MfaEnrolled,
            MfaSessionActive = creds.HasValidSession,
            MfaSessionExpiresAtUtc = creds.ExpiresAtUtc,
            IsSsoSession = creds.IsSsoSession,
            SsoAccountName = creds.SsoAccountName,
            SsoRoleName = creds.SsoRoleName,
            RequiresSsoSignIn = creds.RequiresSsoSignIn,
            IdentityLabel = identityLabel
        });
    }

    // Dashboard's "AWS Services" container - EC2/VPC/S3/Lambda/Route53/SNS
    // across the whole account this session's credentials can see, not
    // just the one cluster/service an Environment happens to be wired to
    // (see EnvironmentsController.GetCloudStatus for that narrower view).
    [HttpGet("me/aws/resources")]
    public async Task<IActionResult> GetMyAwsResources([FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _cloud.GetAwsResourceInventoryAsync(creds, region));
    }

    // Cloud Services page's per-service detail click-through - richer than
    // the account-wide inventory above (running vs stopped instance
    // counts), so it's its own call rather than folded into GetMyAwsResources.
    [HttpGet("me/aws/ec2-detail")]
    public async Task<IActionResult> GetMyAwsEc2Detail([FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _cloud.GetEc2DetailAsync(creds, region));
    }

    // Same reasoning as ec2-detail above - per-cluster/per-service task
    // counts aren't something the account-wide inventory's generic tag
    // scan can answer, only a real ECS API call can.
    [HttpGet("me/aws/ecs-detail")]
    public async Task<IActionResult> GetMyAwsEcsDetail([FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _cloud.GetEcsDetailAsync(creds, region));
    }

    // AWS has no username/password sign-in API - the access key/secret is
    // the real "login," and when MfaSerialNumber+MfaCode are both present
    // this verifies that second factor via STS GetSessionToken before
    // saving anything, exactly like a real login would reject a wrong MFA
    // code rather than silently storing bad credentials.
    [HttpPost("me/aws")]
    public async Task<IActionResult> SaveMyAws(AwsCredentialsUpdateDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);

        // A blank field keeps whatever's already saved (see
        // SaveUserAwsCredentialsAsync) - only reject if the access key or
        // secret would still be missing after that merge.
        var existing = await _settings.GetUserAwsCredentialsAsync(key);

        var effectiveAccessKey = string.IsNullOrWhiteSpace(request.AccessKeyId) ? existing.AccessKeyId : request.AccessKeyId;
        var effectiveSecret = string.IsNullOrWhiteSpace(request.SecretAccessKey) ? existing.SecretAccessKey : request.SecretAccessKey;
        var effectiveRegion = string.IsNullOrWhiteSpace(request.Region) ? existing.Region : request.Region;

        if (string.IsNullOrWhiteSpace(effectiveAccessKey) || string.IsNullOrWhiteSpace(effectiveSecret))
            return BadRequest(new { message = "Access key ID and secret access key are required." });

        AwsSessionCredentials? session = null;

        if (!string.IsNullOrWhiteSpace(request.MfaCode))
        {
            var mfaSerial = string.IsNullOrWhiteSpace(request.MfaSerialNumber) ? existing.MfaSerialNumber : request.MfaSerialNumber;

            if (string.IsNullOrWhiteSpace(mfaSerial))
                return BadRequest(new { message = "An MFA device serial number is required to verify a code." });

            if (string.IsNullOrWhiteSpace(effectiveRegion))
                return BadRequest(new { message = "A region is required to verify an MFA code." });

            var verification = await _cloud.GetSessionTokenAsync(effectiveAccessKey, effectiveSecret, effectiveRegion, mfaSerial, request.MfaCode);

            if (!verification.Success)
                return BadRequest(new { message = verification.Error ?? "MFA verification failed." });

            session = verification.Session;
        }

        await _settings.SaveUserAwsCredentialsAsync(key, request, session);

        return Ok(new { Configured = true, MfaSessionActive = session != null });
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

        var identityLabel = creds.IsConfigured
            ? await _cloud.GetAzureIdentityLabelAsync(creds)
            : null;

        return Ok(new { Configured = creds.IsConfigured, IdentityLabel = identityLabel });
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

        // No live API call needed here, unlike AWS/Azure - a GCP service
        // account's own JSON key already carries its email address as a
        // field (client_email), so "who is this" is just a local parse of
        // what's already stored, not a network round trip.
        var identityLabel = ExtractGcpServiceAccountEmail(creds.ServiceAccountKeyJson);

        return Ok(new { Configured = creds.IsConfigured, ProjectId = creds.ProjectId, IdentityLabel = identityLabel });
    }

    private static string? ExtractGcpServiceAccountEmail(string? serviceAccountKeyJson)
    {
        if (string.IsNullOrWhiteSpace(serviceAccountKeyJson))
            return null;

        try
        {
            var parsed = Newtonsoft.Json.Linq.JObject.Parse(serviceAccountKeyJson);
            return parsed["client_email"]?.ToString();
        }
        catch
        {
            // Malformed/partial JSON (still being pasted, or genuinely
            // invalid) just means no label yet, not an error the caller
            // needs to see - the form itself still shows "Saved".
            return null;
        }
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

    // Screen-lock PIN — self-service like every credential above, no
    // AdminGate needed. Backs PeriodicSignOutMonitor's lock screen: set
    // one here and the 10-minute idle prompt locks instead of wiping
    // GitHub/AWS/Azure/GCP; leave it unset and the old wipe-everything
    // behavior stays exactly as it was.
    [HttpGet("me/pin")]
    public async Task<IActionResult> GetMyPin()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        return Ok(new { Configured = await _settings.HasPinAsync(key) });
    }

    [HttpPost("me/pin")]
    public async Task<IActionResult> SaveMyPin(SecurityPinUpdateDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Pin) || request.Pin.Length < 4 || request.Pin.Length > 8 || !request.Pin.All(char.IsDigit))
            return BadRequest(new { message = "PIN must be 4 to 8 digits." });

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.SetPinAsync(key, request.Pin);

        return Ok(new { Configured = true });
    }

    [HttpDelete("me/pin")]
    public async Task<IActionResult> ClearMyPin()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearPinAsync(key);
        return Ok();
    }

    // No rate limiting beyond the lockout the frontend itself enforces
    // (PinLockScreen falls back to a full data wipe after too many wrong
    // attempts) - a 4-8 digit PIN protecting local UI state, not an
    // account, doesn't carry the same brute-force stakes a real
    // authentication endpoint would.
    [HttpPost("me/pin/verify")]
    public async Task<IActionResult> VerifyMyPin(SecurityPinUpdateDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var valid = await _settings.VerifyPinAsync(key, request.Pin ?? string.Empty);

        return Ok(new { Valid = valid });
    }

    // "Clear All Data" for a non-admin - resets only the caller's own
    // credentials (GitHub, AWS, Azure, GCP). No AdminGate here, same
    // reasoning as every /me/* endpoint above: nobody needs admin rights
    // to reset data that's already scoped to their own session. Clearing
    // the shared, portal-wide sections (Docker/OAuth/Sonar) stays behind
    // Clear("all") below, which does require admin.
    [HttpDelete("me/all")]
    public async Task<IActionResult> ClearMyAll()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        return Ok(await _settings.ClearMyCredentialsAsync(key));
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

    // Scoped admin grants — a GitHub login can be handed admin authority for
    // just ONE page's actions (see AdminGate's pageKey param) instead of the
    // full allowlist. Managing these three endpoints always requires FULL
    // admin (no pageKey passed here): a page-scoped grantee must never be
    // able to grant further access, to themselves or anyone else, or the
    // scoping would be meaningless.
    [HttpGet("page-admin-grants")]
    public async Task<IActionResult> GetPageAdminGrants()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view page-scoped admin access") is IActionResult denied)
            return denied;

        return Ok(await _settings.GetPageAdminGrantsAsync());
    }

    [HttpPost("page-admin-grants/{pageKey}")]
    public async Task<IActionResult> GrantPageAdmin(string pageKey, PageAdminGrantDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "grant page-scoped admin access") is IActionResult denied)
            return denied;

        if (!SettingsService.GrantablePageKeys.Contains(pageKey))
            return BadRequest(new { message = $"'{pageKey}' isn't a grantable page." });

        if (string.IsNullOrWhiteSpace(request.Login))
            return BadRequest(new { message = "A GitHub login is required." });

        return Ok(await _settings.GrantPageAdminAsync(pageKey, request.Login.Trim()));
    }

    [HttpDelete("page-admin-grants/{pageKey}/{login}")]
    public async Task<IActionResult> RevokePageAdmin(string pageKey, string login)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "revoke page-scoped admin access") is IActionResult denied)
            return denied;

        return Ok(await _settings.RevokePageAdminAsync(pageKey, login));
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

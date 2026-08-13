using System.Security.Claims;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// One consolidated read for everything the app shell needs before it can
// render anything. Before this, app startup fired up to 8 separate
// requests: GET /api/auth/me, GET /api/settings, GET
// /api/settings/me/github (fetched redundantly 3 times - once each from
// AuthContext, RequireGitHubSetup, and TopBar, none of them aware the
// others already had it), GET /api/settings/me/aws, GET
// /api/settings/me/pin, and conditionally GET /api/github/token-owner.
// This composes the exact same underlying SettingsService/CloudStatusService/
// GitHubApiService calls those endpoints already used - no duplicated
// business logic, no new data-exposure surface, every field here is
// exactly what its standalone endpoint already returned.
//
// Deliberately NOT included:
//   - Sidebar access (GET /api/settings/sidebar) - NavigationContext's own
//     fetch, mounted a level above AuthProvider in the provider tree.
//     It's already a single, cheap, non-duplicated request; folding it in
//     would mean restructuring that provider nesting for a call that
//     isn't actually a problem.
//   - Anything periodic/polling (rate limit, session epoch, app version,
//     PR count, activity feed) - these keep their own independent
//     intervals via usePolling, unchanged. Session-epoch in particular is
//     a security mechanism (force-logout detection); collapsing it into a
//     one-time bootstrap call would weaken it, not just save a request.
//   - Anything Dashboard-page-specific (repository/branches/artifacts/
//     workflows, account-repositories + bulk run status, AWS resource
//     inventory, environments) - these stay lazy-loaded by the components
//     that actually need them. They only appear to be "startup calls"
//     because Dashboard happens to be the default landing tab; opening a
//     different tab first would never trigger them at all.
[ApiController]
[Route("api/bootstrap")]
public class BootstrapController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly CloudStatusService _cloud;
    private readonly GitHubApiService _github;

    public BootstrapController(SettingsService settings, CloudStatusService cloud, GitHubApiService github)
    {
        _settings = settings;
        _cloud = cloud;
        _github = github;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);

        var settingsView = await _settings.GetViewAsync();

        var isAdmin = AdminGate.IsAdminOrBootstrap(this, settingsView)
            || await AdminGate.IsAdminViaPersonalAccessTokenAsync(this, settingsView);

        settingsView.IsAdminSession = isAdmin;
        settingsView.IsSuperAdminSession = await AdminGate.IsSuperAdminAsync(this);

        // Same reconnaissance-value reasoning as SettingsController.Get -
        // only an admin (or bootstrap mode) gets the real allowlist.
        if (!isAdmin)
            settingsView.AdminGitHubUsernames = new List<string>();

        // These four are independent of each other and of the isAdmin
        // resolution above - each just reads the same settings blob
        // GetViewAsync already pulled in (and cached for this request, see
        // SettingsService.ReadRootAsync), so running them concurrently
        // costs nothing extra and the cache is already warm by the time
        // they start (no risk of a race populating it twice).
        var githubCredsTask = _settings.GetUserGitHubCredentialsAsync(key);
        var awsCredsTask = _settings.GetUserAwsCredentialsAsync(key);
        var azureCredsTask = _settings.GetUserAzureCredentialsAsync(key);
        var gcpCredsTask = _settings.GetUserGcpCredentialsAsync(key);
        var pinConfiguredTask = _settings.HasPinAsync(key);
        var wasSignedOutTask = _settings.IsPatUserSignedOutAsync(key);
        var mfaNudgeSkipsTask = _settings.GetMfaNudgeSkipCountAsync(key);

        await Task.WhenAll(
            githubCredsTask, awsCredsTask, azureCredsTask, gcpCredsTask,
            pinConfiguredTask, wasSignedOutTask, mfaNudgeSkipsTask);

        var githubCreds = githubCredsTask.Result;
        var awsCreds = awsCredsTask.Result;
        var azureCreds = azureCredsTask.Result;
        var gcpCreds = gcpCredsTask.Result;
        var pinConfigured = pinConfiguredTask.Result;
        var wasSignedOut = wasSignedOutTask.Result;
        var mfaNudgeSkips = mfaNudgeSkipsTask.Result;

        // Both of these are real outbound calls (AWS STS, GitHub's own
        // API) and independent of each other - only run when their own
        // credential is actually configured (same guards the standalone
        // GetMyAws/token-owner endpoints already used), and run together
        // rather than one after the other when both happen to apply.
        var identityLabelTask = awsCreds.IsConfigured
            ? _cloud.GetCallerIdentityLabelAsync(awsCreds)
            : Task.FromResult<string?>(null);

        async Task<TokenOwnerDto?> GetTokenOwnerIfConfiguredAsync() =>
            githubCreds.TokenConfigured ? await _github.GetTokenOwnerAsync() : null;

        var tokenOwnerTask = GetTokenOwnerIfConfiguredAsync();

        await Task.WhenAll(identityLabelTask, tokenOwnerTask);

        var identityLabel = identityLabelTask.Result;
        var tokenOwner = tokenOwnerTask.Result;

        // tokenOwner.Login (just resolved above) is already the live,
        // confirmed GitHub identity behind this session's token - reusing
        // it here means checking MFA status costs no extra GitHub call.
        var mfaEnabled = tokenOwner != null && await _settings.IsMfaEnabledAsync(tokenOwner.Login);
        var mfaRequiredByAdmin = tokenOwner != null && await _settings.IsMfaRequiredByAdminAsync(tokenOwner.Login);
        var hasCloudCredential = awsCreds.IsConfigured || azureCreds.IsConfigured || gcpCreds.IsConfigured;

        var mfaNudgeShow = githubCreds.IsConfigured && !mfaEnabled;

        // Mandatory either because this session has a cloud credential
        // saved (Round 18's original trigger) OR because a super-admin
        // explicitly flagged this identity as required (Admin Access'
        // "Require MFA" - see AdminUsersController.RequireMfa) - either
        // reason escalates the same nudge into the same full-screen block
        // once the 2-skip budget is spent, MfaEnforcementGate doesn't
        // need to know or care which one applied.
        var mfaNudgeMandatory = mfaNudgeShow && (hasCloudCredential || mfaRequiredByAdmin);

        var authenticated = User.Identity?.IsAuthenticated == true;

        return Ok(new BootstrapResponseDto
        {
            Auth = new BootstrapAuthDto
            {
                Authenticated = authenticated,
                Login = authenticated ? User.Identity!.Name : null,
                Role = authenticated ? User.FindFirst(ClaimTypes.Role)?.Value : null
            },
            Settings = settingsView,
            GitHub = new BootstrapGitHubDto
            {
                Owner = githubCreds.Owner,
                Repository = githubCreds.Repository,
                TokenConfigured = githubCreds.TokenConfigured,
                IsConfigured = githubCreds.IsConfigured,
                WasSignedOut = wasSignedOut,
                PreviousOwner = githubCreds.PreviousOwner,
                PreviousRepository = githubCreds.PreviousRepository
            },
            Aws = new BootstrapAwsDto
            {
                Configured = awsCreds.IsConfigured,
                Region = awsCreds.Region,
                MfaEnrolled = awsCreds.MfaEnrolled,
                MfaSessionActive = awsCreds.HasValidSession,
                MfaSessionExpiresAtUtc = awsCreds.ExpiresAtUtc,
                IsSsoSession = awsCreds.IsSsoSession,
                SsoAccountName = awsCreds.SsoAccountName,
                SsoRoleName = awsCreds.SsoRoleName,
                RequiresSsoSignIn = awsCreds.RequiresSsoSignIn,
                IdentityLabel = identityLabel
            },
            Pin = new BootstrapPinDto { Configured = pinConfigured },
            TokenOwner = tokenOwner,
            MfaNudge = new BootstrapMfaNudgeDto
            {
                Show = mfaNudgeShow,
                Mandatory = mfaNudgeMandatory,
                SkipsUsed = mfaNudgeSkips,
                Blocked = mfaNudgeMandatory && mfaNudgeSkips >= 2
            }
        });
    }
}

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
    private readonly IAiAssistantService _ai;
    private readonly IEmailService _email;
    private readonly SessionActivityService _activity;
    private readonly NotificationService _notifications;

    public SettingsController(SettingsService settings, GitHubApiService github, CloudStatusService cloud, GitHubAuthService githubAuth, IAiAssistantService ai, IEmailService email, SessionActivityService activity, NotificationService notifications)
    {
        _settings = settings;
        _github = github;
        _cloud = cloud;
        _githubAuth = githubAuth;
        _ai = ai;
        _email = email;
        _activity = activity;
        _notifications = notifications;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var view = await _settings.GetViewAsync();

        view.IsAdminSession = AdminGate.IsAdminOrBootstrap(this, view);
        view.IsSuperAdminSession = await AdminGate.IsSuperAdminAsync(this);

        // Same resolution BootstrapController.Get() uses for its own copy
        // of this field - kept in sync so whichever endpoint a given
        // frontend call happens to hit, the answer is identical.
        var callerLogin = await AdminGate.ResolveCallerLoginAsync(this);
        view.GrantedPages = await _settings.GetGrantedPagesForLoginAsync(callerLogin);

        // The admin allowlist is only needed by an admin editing it, or
        // during bootstrap when it's empty anyway — showing the real
        // usernames to an anonymous/non-admin visitor once configured is
        // pure reconnaissance value (exactly who to target to gain admin
        // access here) for no functional benefit, since they can't act on
        // it either way.
        if (!view.IsAdminSession)
        {
            view.AdminGitHubUsernames = new List<string>();
            view.AdminEmails = new List<string>();
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

    // Every account manages its own GitHub repo + token — no AdminGate, no
    // page grant needed, just being logged in (any of the 3 login methods).
    // RequireAuth resolves who's asking, isolated from every other account -
    // this is deliberately a separate concept from login itself (see
    // PortalIdentity.cs's own header comment): which GitHub repo/token an
    // account points at for real API calls has nothing to do with which of
    // email/password, Google, or GitHub OAuth it used to sign in.

    [HttpGet("me/github")]
    public async Task<IActionResult> GetMyGitHub()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGitHubCredentialsAsync(key);

        return Ok(new
        {
            GitHubOwner = creds.Owner,
            GitHubRepository = creds.Repository,
            GitHubTokenConfigured = creds.TokenConfigured,
            IsConfigured = creds.IsConfigured,
            WasSignedOut = await _settings.IsPatUserSignedOutAsync(key),
            PreviousOwner = creds.PreviousOwner,
            PreviousRepository = creds.PreviousRepository
        });
    }

    [HttpPost("me/github")]
    public async Task<IActionResult> SaveMyGitHub(GitHubSettingsUpdateDto request)
    {
        // Owner/Repository end up interpolated into dozens of GitHub API
        // URLs across this app's lifetime, not just this one request -
        // rejecting anything outside a real GitHub name's character set
        // here means every one of those later uses is safe from a crafted
        // value redirecting a request onto an unintended API path. Blank is
        // explicitly allowed through (not validated) - RequireGitHubSetup
        // now saves a token with no repo chosen yet, picked later from the
        // Dashboard's own picker; only a non-blank, malformed value is
        // rejected here.
        if ((!string.IsNullOrEmpty(request.Owner) && !GitHubNameValidator.IsValid(request.Owner))
            || (!string.IsNullOrEmpty(request.Repository) && !GitHubNameValidator.IsValid(request.Repository)))
            return BadRequest(new { message = "Owner and repository must be valid GitHub names (letters, numbers, hyphens, underscores, periods only)." });

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

        // Only gated while a working connection already exists - this same
        // endpoint is also what RequireGitHubSetup's first-time/reconnect-
        // after-sign-out flow calls, and that flow has no PIN-entry UI of
        // its own. A session with nothing configured yet has nothing worth
        // protecting here; once IsConfigured is true, replacing it (someone
        // repointing your pipeline at a different repo/token) is exactly
        // what this gate exists for.
        var existing = await _settings.GetUserGitHubCredentialsAsync(key);

        if (existing.IsConfigured
            && await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "github") is IActionResult denied)
        {
            return denied;
        }

        // MFA enforcement - the actual gate (PreviewMyGitHubToken's
        // MfaRequired flag is only a heads-up for the UI; this is what
        // stops a token from ever being persisted without it). Keyed by
        // the token's own resolved GitHub login, not this session's key -
        // MFA belongs to the person, same reasoning as Round 14's
        // cross-session credential migration. Nothing is saved below
        // until this passes, so a wrong/missing code leaves this session
        // exactly where it was - no partial state to clean up.
        if (!string.IsNullOrWhiteSpace(request.PersonalAccessToken)
            && await MfaGate.DenyUnlessVerifiedAsync(this, _settings, _notifications, request.PersonalAccessToken.Trim(), request.MfaCode, request.RecoveryCode) is IActionResult mfaDenied)
        {
            return mfaDenied;
        }

        var result = await _settings.SaveUserGitHubCredentialsAsync(key, request);

        if (!result.Success)
            return Conflict(new { message = result.ConflictMessage, code = "ALREADY_CONNECTED_ELSEWHERE" });

        var creds = result.Credentials!;

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
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "github") is IActionResult denied)
            return denied;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        await _settings.ClearUserGitHubTokenAsync(key);
        _activity.RevokeCredentialUnlock(key, "github");

        return Ok();
    }

    // Self-service equivalent of AdminUsersController's "Sign Out" action -
    // same SoftSignOutPatUserAsync, just applied to the CALLER's own key
    // instead of an admin-chosen one. Deliberately not gated behind
    // CredentialGate's PIN check the way ClearMyGitHubToken above is -
    // signing yourself out is the safe, reversible action (nothing is
    // deleted; typing the same token back in immediately undoes it), not
    // the one that needs a PIN in front of it. Used by Settings' Danger
    // Zone (replacing a destructive full wipe for non-admins) and by
    // PeriodicSignOutMonitor's 30-minute true-idle timeout.
    [HttpPost("me/github/signout")]
    public async Task<IActionResult> SignOutMyGitHub()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        await _settings.SoftSignOutPatUserAsync(key);

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

        // A local lookup only (no extra GitHub call) - lets the frontend
        // show the MFA code-entry step right after preview, before it
        // ever attempts to save. SaveMyGitHub below independently
        // re-checks and enforces this regardless, so skipping preview
        // entirely can't bypass it.
        if (result.Success && !string.IsNullOrWhiteSpace(result.Username))
            result.MfaRequired = await _settings.IsMfaEnabledAsync(result.Username);

        return Ok(result);
    }

    // Same per-visitor isolation as GitHub above, for the Environments
    // detail view's live AWS ECS/ECR lookup — the credentials never leave
    // this browser's own session slot.
    [HttpGet("me/aws")]
    public async Task<IActionResult> GetMyAws()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
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
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _cloud.GetAwsResourceInventoryAsync(creds, region));
    }

    // Cloud Services page's per-service detail click-through - richer than
    // the account-wide inventory above (running vs stopped instance
    // counts), so it's its own call rather than folded into GetMyAwsResources.
    [HttpGet("me/aws/ec2-detail")]
    public async Task<IActionResult> GetMyAwsEc2Detail([FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _cloud.GetEc2DetailAsync(creds, region));
    }

    // Same reasoning as ec2-detail above - per-cluster/per-service task
    // counts aren't something the account-wide inventory's generic tag
    // scan can answer, only a real ECS API call can.
    [HttpGet("me/aws/ecs-detail")]
    public async Task<IActionResult> GetMyAwsEcsDetail([FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
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
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "aws") is IActionResult denied)
            return denied;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

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
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "aws") is IActionResult denied)
            return denied;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        await _settings.ClearUserAwsCredentialsAsync(key);
        _activity.RevokeCredentialUnlock(key, "aws");

        return Ok();
    }

    // Same per-visitor isolation, for the Environments detail view's live
    // Azure Web App lookup.
    [HttpGet("me/azure")]
    public async Task<IActionResult> GetMyAzure()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        var identityLabel = creds.IsConfigured
            ? await _cloud.GetAzureIdentityLabelAsync(creds)
            : null;

        return Ok(new { Configured = creds.IsConfigured, IdentityLabel = identityLabel, SubscriptionId = creds.SubscriptionId });
    }

    // Cloud Services' Azure sub-page - the Azure equivalent of
    // me/aws/resources above. No region query param needed here - unlike
    // an AWS access key, ARM's generic resource-listing endpoint is
    // already subscription-wide (see GetAzureResourceInventoryAsync).
    [HttpGet("me/azure/resources")]
    public async Task<IActionResult> GetMyAzureResources()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _cloud.GetAzureResourceInventoryAsync(creds));
    }

    [HttpPost("me/azure")]
    public async Task<IActionResult> SaveMyAzure(AzureCredentialsUpdateDto request)
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "azure") is IActionResult denied)
            return denied;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

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
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "azure") is IActionResult denied)
            return denied;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        await _settings.ClearUserAzureCredentialsAsync(key);
        _activity.RevokeCredentialUnlock(key, "azure");

        return Ok();
    }

    // Same per-visitor isolation, for GCP — stored for future use, nothing
    // in this portal reads it yet.
    [HttpGet("me/gcp")]
    public async Task<IActionResult> GetMyGcp()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        // No live API call needed here, unlike AWS/Azure - a GCP service
        // account's own JSON key already carries its email address as a
        // field (client_email), so "who is this" is just a local parse of
        // what's already stored, not a network round trip.
        var identityLabel = ExtractGcpServiceAccountEmail(creds.ServiceAccountKeyJson);

        return Ok(new { Configured = creds.IsConfigured, ProjectId = creds.ProjectId, IdentityLabel = identityLabel, Location = creds.Location });
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
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "gcp") is IActionResult denied)
            return denied;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

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
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "gcp") is IActionResult denied)
            return denied;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        await _settings.ClearUserGcpCredentialsAsync(key);
        _activity.RevokeCredentialUnlock(key, "gcp");

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
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        return Ok(new { Configured = await _settings.HasPinAsync(key) });
    }

    // Shared by SaveMyPin and ClearMyPin below - both require a fresh MFA
    // code before taking effect when this session's GitHub identity has
    // MFA enabled (a no-op otherwise, so either action works exactly as it
    // always did for a session with no MFA). Neither offers a recovery-
    // code fallback here by design (see SecurityPinSection.jsx) - setting/
    // changing/removing the PIN isn't the "lost my phone" last-resort path
    // Disable MFA is, so a live code is required outright.
    private async Task<IActionResult?> DenyUnlessPinActionVerifiedAsync(string? code)
    {
        var login = await _githubAuth.GetAuthenticatedLoginAsync();

        if (string.IsNullOrWhiteSpace(login))
            return null;

        return await MfaGate.DenyUnlessCodeVerifiedAsync(this, _settings, _notifications, login, code, null);
    }

    [HttpPost("me/pin")]
    public async Task<IActionResult> SaveMyPin(SecurityPinUpdateDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Pin) || request.Pin.Length < 4 || request.Pin.Length > 8 || !request.Pin.All(char.IsDigit))
            return BadRequest(new { message = "PIN must be 4 to 8 digits." });

        if (await DenyUnlessPinActionVerifiedAsync(request.Code) is IActionResult denied)
            return denied;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        await _settings.SetPinAsync(key, request.Pin);
        _activity.ClearFailedPinAttempts(key);

        return Ok(new { Configured = true });
    }

    // Removing the PIN turns off both what it protects (the Credentials
    // tabs' unlock gate, and the "lock instead of wipe" idle behavior) -
    // significant enough that, when this session's GitHub identity has MFA
    // enabled, we require a fresh MFA code before it takes effect, same as
    // disabling MFA itself already requires (see MfaController.Disable).
    [HttpDelete("me/pin")]
    public async Task<IActionResult> ClearMyPin(MfaCodeRequestDto request)
    {
        if (await DenyUnlessPinActionVerifiedAsync(request?.Code) is IActionResult denied)
            return denied;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        await _settings.ClearPinAsync(key);
        _activity.ClearFailedPinAttempts(key);
        return Ok();
    }

    // The PIN protects real saved credentials (GitHub/AWS/Azure/GCP), not
    // just local UI state - a 4-8 digit numeric PIN is trivially brute-
    // forceable with unlimited attempts, and PinLockScreen's own 5-attempt
    // lockout is enforced entirely in the browser, which anyone calling
    // this endpoint directly can simply skip. This mirrors that same
    // 5-attempt rule server-side via SessionActivityService's in-memory
    // per-session counter, so a scripted bypass of the UI gets the same
    // "credentials wiped" outcome a UI-following attempt would - see
    // security_findings.txt Finding 004.
    private const int MaxPinAttempts = 5;

    [HttpPost("me/pin/verify")]
    public async Task<IActionResult> VerifyMyPin(SecurityPinUpdateDto request)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

        if (_activity.GetFailedPinAttemptCount(key) >= MaxPinAttempts)
            return Ok(new { Valid = false, Locked = true });

        var valid = await _settings.VerifyPinAsync(key, request.Pin ?? string.Empty);

        if (valid)
        {
            _activity.ClearFailedPinAttempts(key);
            return Ok(new { Valid = true, Locked = false });
        }

        var attempts = _activity.RecordFailedPinAttempt(key);

        if (attempts >= MaxPinAttempts)
        {
            // Same outcome as the frontend's own performSelfClear - wipes
            // this session's saved credentials and screen-lock PIN, so a
            // scripted attacker who skipped the UI entirely still ends up
            // exactly where a UI-following one would.
            await _settings.ClearMyCredentialsAsync(key);
            _activity.ClearFailedPinAttempts(key);

            return Ok(new { Valid = false, Locked = true });
        }

        return Ok(new { Valid = false, Locked = false });
    }

    // Per-credential unlock (see CredentialGate/SessionActivityService) -
    // verifying the SAME screen-lock PIN here grants a short-lived, in-
    // memory pass covering EVERY gated provider at once (CredentialGate.
    // AllProviders), not just whichever tab the prompt happened to appear
    // on - one PIN entry unlocks Credentials for the rest of this grant's
    // lifetime, rather than re-prompting on every tab switch. Reuses
    // VerifyMyPin's exact rate-limit/wipe-on-5-fails machinery so there's a
    // single security boundary for "guess the PIN," not a second weaker one
    // a scripted attacker could target instead.
    [HttpPost("me/credentials/{provider}/unlock")]
    public async Task<IActionResult> UnlockMyCredential(string provider, SecurityPinUpdateDto request)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

        // No screen-lock PIN configured at all - credential management
        // works exactly as it did before this feature existed, with no
        // prompt in front of it. See CredentialGate.DenyUnlessUnlockedAsync,
        // which applies the same bypass on the enforcement side.
        if (!await _settings.HasPinAsync(key))
            return Ok(new { Valid = true, Locked = false });

        if (_activity.GetFailedPinAttemptCount(key) >= MaxPinAttempts)
            return Ok(new { Valid = false, Locked = true });

        var valid = await _settings.VerifyPinAsync(key, request.Pin ?? string.Empty);

        if (valid)
        {
            _activity.ClearFailedPinAttempts(key);

            foreach (var grantedProvider in CredentialGate.AllProviders)
                _activity.GrantCredentialUnlock(key, grantedProvider, TimeSpan.FromMinutes(5));

            return Ok(new { Valid = true, Locked = false });
        }

        var attempts = _activity.RecordFailedPinAttempt(key);

        if (attempts >= MaxPinAttempts)
        {
            // Same outcome as VerifyMyPin hitting the same limit - a
            // scripted attacker hammering this endpoint directly ends up
            // exactly where one hammering the portal-wide unlock would.
            await _settings.ClearMyCredentialsAsync(key);
            _activity.ClearFailedPinAttempts(key);

            return Ok(new { Valid = false, Locked = true });
        }

        return Ok(new { Valid = false, Locked = false });
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
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        return Ok(await _settings.ClearMyCredentialsAsync(key));
    }

    // "Skip" on MfaEnforcementGate's nudge (see BootstrapController's
    // MfaNudge block) - no AdminGate, same as every other /me/* endpoint,
    // since a session can only ever increment its own counter. Harmless to
    // call even before the nudge is mandatory (the count just sits unused
    // until hasCloudCredential flips true) - keeps the increment logic in
    // one place instead of the frontend guessing when it "really" counts.
    [HttpPost("me/mfa/skip-nudge")]
    public async Task<IActionResult> SkipMfaNudge()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var count = await _settings.IncrementMfaNudgeSkipCountAsync(key);

        return Ok(new { skipsUsed = count });
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

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "docker") is IActionResult locked)
            return locked;

        return Ok(await _settings.SaveDockerAsync(request));
    }

    [HttpPost("github-oauth")]
    public async Task<IActionResult> SaveGitHubOAuth(GitHubOAuthUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "github-oauth") is IActionResult locked)
            return locked;

        return Ok(await _settings.SaveGitHubOAuthAsync(request));
    }

    // SonarQube/SonarCloud saves live on SonarController now (api/sonar/
    // {provider}) - each an independent credential since the split, not
    // this shared-settings-blob mechanism.

    // Deployment Copilot's Gemini API key/model - same admin-only, portal-
    // wide model as Sonar above. The saved view (BuildView) never echoes
    // the key back, only AiApiKeyConfigured/AiModel.
    [HttpPost("ai")]
    public async Task<IActionResult> SaveAi(AiAssistantSettingsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "ai") is IActionResult locked)
            return locked;

        return Ok(await _settings.SaveAiAssistantAsync(request));
    }

    // Tests the CURRENTLY SAVED Gemini configuration (not whatever's
    // sitting unsaved in the form) - "Test Connection" is meant to confirm
    // what Deployment Copilot will actually use, so this deliberately
    // ignores anything the caller hasn't saved yet rather than accepting
    // an API key in the request body.
    [HttpPost("ai/test")]
    public async Task<IActionResult> TestAi()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "test the AI Assistant connection") is IActionResult denied)
            return denied;

        var creds = await _settings.GetAiAssistantCredentialsAsync();

        if (!creds.IsConfigured)
        {
            return Ok(new AiTestConnectionResultDto
            {
                Success = false,
                Message = "Add a Gemini API key and model, then save, before testing the connection."
            });
        }

        return Ok(await _ai.TestConnectionAsync(creds.ApiKey!, creds.Model));
    }

    // Resend login-notification email - same admin-only, portal-wide,
    // PIN-gated model as AI Assistant above. The saved view never echoes
    // the key back, only NotificationsApiKeyConfigured/FromEmail/FromName.
    [HttpPost("notifications")]
    public async Task<IActionResult> SaveNotifications(NotificationSettingsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "resend") is IActionResult locked)
            return locked;

        return Ok(await _settings.SaveNotificationSettingsAsync(request));
    }

    // Sends a real Resend email to whatever address the admin types in -
    // deliberately not auto-resolved from the caller's own session (a
    // PAT-based admin session has no reliable email to resolve), same
    // reasoning as TestAi ignoring anything not yet saved: this uses
    // whatever's currently saved, not an unsaved key sitting in the form.
    [HttpPost("notifications/test")]
    public async Task<IActionResult> TestNotifications(EmailTestRequestDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "send a test email") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(request.ToEmail))
        {
            return Ok(new EmailSendResultDto { Success = false, Message = "Enter an email address to send the test to." });
        }

        return Ok(await _email.SendTestEmailAsync(request.ToEmail.Trim()));
    }

    // Deliberately super-admin-only (not the general AdminGate.
    // DenyUnlessAdminAsync every other section here uses) - who gets the
    // Admin role at all is a step up from "changing settings," the same
    // reasoning Database Management already applies to itself.
    [HttpPost("admins")]
    public async Task<IActionResult> SaveAdmins(AdminUsernamesUpdateDto request)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "change the admin allowlist") is IActionResult denied)
            return denied;

        return Ok(await _settings.SaveAdminUsernamesAsync(request));
    }

    // Same super-admin-only tier as SaveAdmins above - see
    // SettingsService.SuspendAdminAsync for why this is distinct from
    // just re-saving the allowlist without that username.
    [HttpPost("admins/{username}/suspend")]
    public async Task<IActionResult> SuspendAdmin(string username)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "suspend an admin") is IActionResult denied)
            return denied;

        return Ok(await _settings.SuspendAdminAsync(username));
    }

    [HttpPost("admins/{username}/unsuspend")]
    public async Task<IActionResult> UnsuspendAdmin(string username)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "unsuspend an admin") is IActionResult denied)
            return denied;

        return Ok(await _settings.UnsuspendAdminAsync(username));
    }

    // Email equivalent of the admins/* endpoints above - the actual
    // source of truth for Admin/Viewer role going forward, since it's the
    // one identifier every login method (email/password, Google, GitHub)
    // can resolve. Same super-admin-only tier - who gets Admin at all is a
    // step up from "changing settings" regardless of which allowlist it is.
    [HttpPost("admin-emails")]
    public async Task<IActionResult> SaveAdminEmails(AdminEmailsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "change the admin email allowlist") is IActionResult denied)
            return denied;

        return Ok(await _settings.SaveAdminEmailsAsync(request.AdminEmails, request.ViewerEmails));
    }

    [HttpPost("super-admin-email")]
    public async Task<IActionResult> SetSuperAdminEmail(SuperAdminEmailUpdateDto request)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "change the super-admin email") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains('@'))
            return BadRequest(new { message = "Enter a valid email address." });

        return Ok(await _settings.SetSuperAdminEmailAsync(request.Email));
    }

    // No AdminGate needed beyond being logged in - every account's own
    // Sidebar needs to know which of ITS OWN tabs to grey out or remove.
    // Restrictions are per account (see SettingsService), so this always
    // resolves to the caller's own key — nobody can read (or infer) what's
    // restricted for anyone else through this endpoint.
    [HttpGet("sidebar")]
    public async Task<IActionResult> GetSidebarAccess()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
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

        var users = await _settings.GetPatUsersAsync();

        // Key here is the literal PortalIdentity session key - the same
        // value that determines whose saved GitHub PAT a request uses (see
        // PortalIdentity.GetOrCreateKey). Returning it as-is would let an
        // admin replay it as their own X-Session-Id and silently act as
        // that specific other person - swapped for a non-reversible row ID
        // right before the response goes out (see
        // SettingsService.ComputeSessionRowIdAsync).
        foreach (var user in users)
            user.Key = await _settings.ComputeSessionRowIdAsync(user.Key);

        return Ok(users);
    }

    [HttpGet("sidebar/user")]
    public async Task<IActionResult> GetUserSidebarAccess([FromQuery] string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view sidebar access") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(key))
            return BadRequest("key is required.");

        if (await _settings.ResolveSessionKeyFromRowIdAsync(key) is not string realKey)
            return NotFound(new { message = "That user's session no longer exists." });

        return Ok(await _settings.GetSidebarAccessAsync(realKey));
    }

    [HttpPost("sidebar/user")]
    public async Task<IActionResult> SaveUserSidebarAccess([FromQuery] string key, SidebarAccessUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change sidebar access") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(key))
            return BadRequest("key is required.");

        if (await _settings.ResolveSessionKeyFromRowIdAsync(key) is not string realKey)
            return NotFound(new { message = "That user's session no longer exists." });

        return Ok(await _settings.SaveSidebarAccessAsync(realKey, request.States));
    }

    [HttpDelete("sidebar/user")]
    public async Task<IActionResult> ClearUserSidebarAccess([FromQuery] string key)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change sidebar access") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(key))
            return BadRequest("key is required.");

        if (await _settings.ResolveSessionKeyFromRowIdAsync(key) is not string realKey)
            return NotFound(new { message = "That user's session no longer exists." });

        await _settings.ClearSidebarAccessAsync(realKey);
        return Ok(await _settings.GetSidebarAccessAsync(realKey));
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

    // Sections individually gated below - "docker"/"github-oauth"/"sonar"/
    // "ai"/"notifications" are the per-provider credentials this feature
    // covers (see CredentialGate). "admins" is never gated (it's not a
    // credential, it's access control) and neither is "all" - that's an
    // admin's bulk portal reset across every shared section at once, the
    // same category of escape hatch as ClearMyAll, not a targeted
    // single-credential action.
    private static readonly HashSet<string> CredentialGatedSections = new() { "docker", "github-oauth", "sonar", "ai", "notifications" };

    [HttpDelete("{section}")]
    public async Task<IActionResult> Clear(string section)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        // Same super-admin-only step-up as SaveAdmins above - clearing the
        // allowlist is just as sensitive as editing it (an empty allowlist
        // drops the whole portal into bootstrap mode - see AdminGate), so
        // it can't be reached by a general admin either.
        if (section == "admins"
            && await AdminGate.DenyUnlessSuperAdminAsync(this, "change the admin allowlist") is IActionResult superDenied)
            return superDenied;

        if (CredentialGatedSections.Contains(section)
            && await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, section) is IActionResult locked)
            return locked;

        try
        {
            if (section == "all")
            {
                var (key, authDenied) = RequireAuth.RequireUserId(this);
                if (authDenied != null) return authDenied;
                return Ok(await _settings.ClearAllAsync(key));
            }

            var result = await _settings.ClearAsync(section);

            if (CredentialGatedSections.Contains(section))
            {
                // Always succeeds here - DenyUnlessAdminAsync above already
                // guarantees an authenticated caller by this point.
                var (revokeKey, _) = RequireAuth.RequireUserId(this);
                _activity.RevokeCredentialUnlock(revokeKey!, section);
            }

            return Ok(result);
        }
        catch (ArgumentException)
        {
            return BadRequest(new { message = $"'{section}' isn't a valid settings section.", code = "VALIDATION_ERROR" });
        }
    }
}

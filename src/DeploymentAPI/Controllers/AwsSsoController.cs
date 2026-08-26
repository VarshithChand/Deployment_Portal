using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// The real "Sign in with AWS" flow for organizations on IAM Identity
// Center (AWS SSO) — device authorization, the same mechanism `aws sso
// login` uses. Every step here is scoped to this visitor's own
// PortalIdentity session (see AwsSsoService.TryGetOwnedEntry) so one
// browser can never poll or complete another's sign-in.
[ApiController]
[Route("api/aws-sso")]
public class AwsSsoController : ControllerBase
{
    private readonly AwsSsoService _sso;
    private readonly SettingsService _settings;

    public AwsSsoController(AwsSsoService sso, SettingsService settings)
    {
        _sso = sso;
        _settings = settings;
    }

    [HttpPost("start")]
    public async Task<IActionResult> Start(AwsSsoStartRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.StartUrl))
            return BadRequest(new { message = "Your AWS SSO start URL is required." });

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

        try
        {
            var result = await _sso.StartAsync(key, request);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = CloudErrorSanitizer.Describe(ex, "AWS", "SSO sign-in start") });
        }
    }

    [HttpGet("poll")]
    public async Task<IActionResult> Poll([FromQuery] string pendingId)
    {
        if (string.IsNullOrWhiteSpace(pendingId))
            return BadRequest(new { message = "pendingId is required." });

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var result = await _sso.PollAsync(key, pendingId);

        return Ok(result);
    }

    [HttpGet("accounts")]
    public async Task<IActionResult> Accounts([FromQuery] string pendingId)
    {
        if (string.IsNullOrWhiteSpace(pendingId))
            return BadRequest(new { message = "pendingId is required." });

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var accounts = await _sso.ListAccountsAndRolesAsync(key, pendingId);

        if (accounts == null)
            return BadRequest(new { message = "This sign-in has expired or hasn't been approved yet. Start again." });

        return Ok(accounts);
    }

    // Mints temporary credentials for the chosen account/role and saves
    // them as this visitor's active AWS session - same storage the MFA
    // path uses, so the Environments page's ECS/ECR status works
    // identically either way.
    [HttpPost("select")]
    public async Task<IActionResult> Select(AwsSsoSelectRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.PendingId) || string.IsNullOrWhiteSpace(request.AccountId) || string.IsNullOrWhiteSpace(request.RoleName))
            return BadRequest(new { message = "pendingId, accountId, and roleName are required." });

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

        var accounts = await _sso.ListAccountsAndRolesAsync(key, request.PendingId);
        var account = accounts?.FirstOrDefault(a => a.AccountId == request.AccountId);

        if (account == null)
            return BadRequest(new { message = "This sign-in has expired. Start again." });

        var session = await _sso.GetRoleCredentialsAsync(key, request.PendingId, request.AccountId, account.AccountName, request.RoleName);

        if (session == null)
            return BadRequest(new { message = "This sign-in has expired. Start again." });

        await _settings.SaveUserAwsCredentialsAsync(
            key,
            new AwsCredentialsUpdateDto { Region = request.Region },
            session);

        return Ok(new { Configured = true, AccountName = account.AccountName, RoleName = request.RoleName });
    }
}

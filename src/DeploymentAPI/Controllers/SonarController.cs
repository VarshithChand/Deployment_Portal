using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Code Quality page's SonarQube and SonarCloud sub-pages. Credentials are
// session-scoped (each visitor connects their own SonarQube/SonarCloud
// token, isolated from every other visitor - see
// SettingsService.SaveUserSonarCredentialsAsync's own comment on why there
// are two genuinely independent credentials) - configuring/clearing them is
// self-service, gated only by the same screen-lock PIN every session
// credential goes through (CredentialGate), not AdminGate. Viewing the
// Code Quality tab AT ALL is a separate, orthogonal restriction still left
// in place here (the "codeQuality" page grant via AdminGate.
// DenyUnlessAdminAsync on Overview/Status) - that's the existing per-PAT-
// user sidebar visibility mechanism (see SidebarAccess), unrelated to
// whether the underlying credential is shared or per-session. No class-
// level [Authorize]: bootstrap mode needs the same unauthenticated-first-
// configure path every other admin-gated controller allows — see AdminGate.
[ApiController]
[Route("api/sonar")]
public class SonarController : ControllerBase
{
    private readonly SonarApiService _sonar;
    private readonly SettingsService _settings;
    private readonly SessionActivityService _activity;

    public SonarController(SonarApiService sonar, SettingsService settings, SessionActivityService activity)
    {
        _sonar = sonar;
        _settings = settings;
        _activity = activity;
    }

    private static IActionResult? ValidateProvider(string provider) =>
        provider is "sonarqube" or "sonarcloud"
            ? null
            : new NotFoundObjectResult(new { message = $"Unknown Sonar provider \"{provider}\"." });

    [HttpGet("{provider}/overview")]
    public async Task<IActionResult> Overview(string provider)
    {
        if (ValidateProvider(provider) is IActionResult invalid)
            return invalid;

        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view code quality data", "codeQuality") is IActionResult denied)
            return denied;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        return Ok(await _sonar.GetOverviewAsync(provider, key));
    }

    [HttpGet("{provider}/status")]
    public async Task<IActionResult> Status(string provider)
    {
        if (ValidateProvider(provider) is IActionResult invalid)
            return invalid;

        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view code quality data", "codeQuality") is IActionResult denied)
            return denied;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserSonarCredentialsAsync(provider, key);

        return Ok(new SonarStatusDto
        {
            Configured = creds.IsConfigured,
            HostUrl = creds.HostUrl,
            Organization = creds.Organization,
            ProjectKey = creds.ProjectKey
        });
    }

    [HttpPost("{provider}")]
    public async Task<IActionResult> Save(string provider, SonarSettingsUpdateDto request)
    {
        if (ValidateProvider(provider) is IActionResult invalid)
            return invalid;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);

        if (provider == "sonarqube")
        {
            var existing = await _settings.GetUserSonarCredentialsAsync(provider, key);
            var effectiveHostUrl = string.IsNullOrWhiteSpace(request.HostUrl) ? existing.HostUrl : request.HostUrl;

            if (string.IsNullOrWhiteSpace(effectiveHostUrl))
                return BadRequest(new { message = "A host URL is required for a self-hosted SonarQube instance." });
        }

        await _settings.SaveUserSonarCredentialsAsync(provider, key, request);

        return Ok(new { configured = true });
    }

    [HttpDelete("{provider}")]
    public async Task<IActionResult> Clear(string provider)
    {
        if (ValidateProvider(provider) is IActionResult invalid)
            return invalid;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserSonarCredentialsAsync(provider, key);
        _activity.RevokeCredentialUnlock(key, provider);

        return Ok(new { success = true });
    }
}

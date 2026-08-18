using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Code Quality page's SonarQube and SonarCloud sub-pages — admin-only end
// to end (unlike GitHub data, this isn't scoped per-session/PAT; there's
// one shared Sonar project per provider for the whole repo, and its token
// is a portal-wide credential same as Docker/OAuth). Two genuinely
// independent credentials (see SettingsService.SaveSonarCredentialsAsync's
// own comment on why), both still gated behind the same "codeQuality"
// page grant as before the split - granting Code Quality access still
// covers both. No class-level [Authorize]: bootstrap mode needs the same
// unauthenticated-first-configure path every other admin-gated controller
// allows — see AdminGate.
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

        return Ok(await _sonar.GetOverviewAsync(provider));
    }

    [HttpGet("{provider}/status")]
    public async Task<IActionResult> Status(string provider)
    {
        if (ValidateProvider(provider) is IActionResult invalid)
            return invalid;

        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view code quality data", "codeQuality") is IActionResult denied)
            return denied;

        var creds = await _settings.GetSonarCredentialsAsync(provider);

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

        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        if (provider == "sonarqube")
        {
            var existing = await _settings.GetSonarCredentialsAsync(provider);
            var effectiveHostUrl = string.IsNullOrWhiteSpace(request.HostUrl) ? existing.HostUrl : request.HostUrl;

            if (string.IsNullOrWhiteSpace(effectiveHostUrl))
                return BadRequest(new { message = "A host URL is required for a self-hosted SonarQube instance." });
        }

        await _settings.SaveSonarCredentialsAsync(provider, request);

        return Ok(new { configured = true });
    }

    [HttpDelete("{provider}")]
    public async Task<IActionResult> Clear(string provider)
    {
        if (ValidateProvider(provider) is IActionResult invalid)
            return invalid;

        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        await _settings.ClearSonarCredentialsAsync(provider);

        return Ok(new { success = true });
    }
}

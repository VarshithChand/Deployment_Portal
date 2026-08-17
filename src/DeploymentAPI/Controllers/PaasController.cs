using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Render/Cloudflare/Netlify/Vercel connections for the Hosting Providers
// page - same self-service, no-AdminGate posture as the /me/aws, /me/azure
// routes on SettingsController: these are the visitor's OWN account
// credentials, scoped to this browser session only (see PortalIdentity),
// never portal-wide. Read-only status/connection only - no mutating action
// against the provider itself exists here.
[ApiController]
[Route("api/paas")]
public class PaasController : ControllerBase
{
    private static readonly HashSet<string> SupportedProviders =
        new(StringComparer.OrdinalIgnoreCase) { "render", "cloudflare", "netlify", "vercel" };

    private readonly SettingsService _settings;
    private readonly PaasProviderService _paas;
    private readonly SessionActivityService _activity;

    public PaasController(SettingsService settings, PaasProviderService paas, SessionActivityService activity)
    {
        _settings = settings;
        _paas = paas;
        _activity = activity;
    }

    private static IActionResult? ValidateProvider(string provider, out string normalized)
    {
        normalized = provider?.ToLowerInvariant() ?? string.Empty;

        return SupportedProviders.Contains(normalized)
            ? null
            : new NotFoundObjectResult(new { message = $"Unknown hosting provider \"{provider}\"." });
    }

    [HttpGet("{provider}/status")]
    public async Task<IActionResult> GetStatus(string provider)
    {
        if (ValidateProvider(provider, out var normalized) is IActionResult invalid)
            return invalid;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(normalized, key);

        return Ok(await _paas.GetStatusAsync(normalized, creds));
    }

    // On-demand usage/load metrics for one of THIS session's own connected
    // services - independent of the Environments linking feature (see
    // EnvironmentsController.GetCloudStatus, which calls the same
    // PaasProviderService method but scoped to a saved Environment target).
    // Here it's just "give me metrics for a service I can already see in my
    // own /status listing" - no Environment involved at all.
    [HttpGet("{provider}/services/{serviceId}/metrics")]
    public async Task<IActionResult> GetServiceMetrics(string provider, string serviceId)
    {
        if (ValidateProvider(provider, out var normalized) is IActionResult invalid)
            return invalid;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(normalized, key);

        return Ok(await _paas.GetServiceMetricsAsync(normalized, creds, serviceId));
    }

    [HttpPost("{provider}/credentials")]
    public async Task<IActionResult> SaveCredentials(string provider, PaasCredentialsUpdateDto request)
    {
        if (ValidateProvider(provider, out var normalized) is IActionResult invalid)
            return invalid;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, normalized) is IActionResult denied)
            return denied;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var existing = await _settings.GetUserPaasCredentialsAsync(normalized, key);

        var effectiveToken = string.IsNullOrWhiteSpace(request.Token) ? existing.Token : request.Token;

        if (string.IsNullOrWhiteSpace(effectiveToken))
            return BadRequest(new { message = "A token is required." });

        if (normalized == "cloudflare")
        {
            var effectiveAccountId = string.IsNullOrWhiteSpace(request.AccountId) ? existing.AccountId : request.AccountId;

            if (string.IsNullOrWhiteSpace(effectiveAccountId))
                return BadRequest(new { message = "Cloudflare requires an Account ID." });
        }

        await _settings.SaveUserPaasCredentialsAsync(normalized, key, request);

        return Ok(new { Configured = true });
    }

    [HttpDelete("{provider}/credentials")]
    public async Task<IActionResult> ClearCredentials(string provider)
    {
        if (ValidateProvider(provider, out var normalized) is IActionResult invalid)
            return invalid;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, normalized) is IActionResult denied)
            return denied;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserPaasCredentialsAsync(normalized, key);
        _activity.RevokeCredentialUnlock(key, normalized);

        return Ok();
    }
}

using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Observability's own sidebar group: 4 CSP-native tools with real, live
// data (CloudWatch/X-Ray reuse this session's AWS credential, Azure
// Monitor reuses Azure, Cloud Monitoring reuses GCP - no new credential
// type for any of these 4), plus 10 standalone tools (Prometheus/Datadog/
// ELK/OpenSearch/Loki/Fluent Bit/Fluentd/OpenTelemetry/Jaeger/Zipkin) that
// each get their own connection, reusing PortalHostCredentials' existing
// generic (HostUrl, Username, Password) storage - the exact same
// mechanism ContainerRegistryController already uses for Harbor/Nexus,
// just a different provider set and a dedicated route/controller so
// "prometheus"/"datadog" don't live under an /api/containerregistry/...
// path that has nothing to do with container registries.
// Route is "api/observabilitytools", not "api/observability" - that
// route already belongs to HostingObservabilityController (the portal's
// own super-admin-only frontend/backend/database health dashboard,
// reached via Settings → Hosting Observability - a completely different,
// pre-existing feature with no relation to this one beyond a name that
// happens to overlap in English). Naming this controller/route family
// "ObservabilityTools" keeps the two unambiguous at the API layer even
// though the Sidebar group here is still labeled plain "Observability"
// (no user-facing collision - the existing feature isn't a Sidebar item
// at all, only a Settings sub-page).
[ApiController]
[Route("api/observabilitytools")]
public class ObservabilityController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly ObservabilityService _observability;
    private readonly SessionActivityService _activity;

    public ObservabilityController(SettingsService settings, ObservabilityService observability, SessionActivityService activity)
    {
        _settings = settings;
        _observability = observability;
        _activity = activity;
    }

    private static readonly HashSet<string> HostProviders = new(StringComparer.OrdinalIgnoreCase)
    {
        "prometheus", "datadog", "elk", "opensearch", "loki", "fluentbit", "fluentd",
        "opentelemetry", "jaeger", "zipkin"
    };

    private static IActionResult? ValidateHostProvider(string provider) =>
        HostProviders.Contains(provider)
            ? null
            : new NotFoundObjectResult(new { message = $"Unknown observability tool \"{provider}\"." });

    // ---- The 10 standalone tools: credential status/save/clear ----------
    // Identical shape to ContainerRegistryController's own Harbor/Nexus
    // routes - same PortalHostCredentials storage, same
    // SettingsService.GetUserHostCredentialsAsync/SaveUserHostCredentialsAsync/
    // ClearUserHostCredentialsAsync methods, already fully generic by
    // provider string with zero changes needed there.

    [HttpGet("{provider}/host-status")]
    public async Task<IActionResult> GetHostStatus(string provider)
    {
        if (ValidateHostProvider(provider) is IActionResult invalid)
            return invalid;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserHostCredentialsAsync(provider, key);

        return Ok(new HostCredentialStatusDto
        {
            Configured = creds.IsConfigured,
            HostUrl = creds.HostUrl ?? string.Empty,
            Username = creds.Username ?? string.Empty
        });
    }

    [HttpPost("{provider}/host")]
    public async Task<IActionResult> SaveHostCredentials(string provider, HostCredentialsUpdateDto request)
    {
        if (ValidateHostProvider(provider) is IActionResult invalid)
            return invalid;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var existing = await _settings.GetUserHostCredentialsAsync(provider, key);
        var effectiveHostUrl = string.IsNullOrWhiteSpace(request.HostUrl) ? existing.HostUrl : request.HostUrl;

        if (string.IsNullOrWhiteSpace(effectiveHostUrl))
            return BadRequest(new { message = "A host URL is required." });

        await _settings.SaveUserHostCredentialsAsync(provider, key, request);

        return Ok(new { configured = true });
    }

    [HttpDelete("{provider}/host")]
    public async Task<IActionResult> ClearHostCredentials(string provider)
    {
        if (ValidateHostProvider(provider) is IActionResult invalid)
            return invalid;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        await _settings.ClearUserHostCredentialsAsync(provider, key);
        _activity.RevokeCredentialUnlock(key, provider);

        return Ok(new { success = true });
    }

    // ---- The 4 CSP-native tools: real, live data -------------------------
    // No AdminGate, no separate credential to save here - this session's
    // own already-connected AWS/Azure/GCP credential is the auth boundary,
    // same self-service posture as every other Cloud Services feature.

    [HttpGet("cloudwatch")]
    public async Task<IActionResult> GetCloudWatch([FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _observability.GetCloudWatchOverviewAsync(creds, region));
    }

    [HttpGet("xray")]
    public async Task<IActionResult> GetXRay([FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _observability.GetXRayOverviewAsync(creds, region));
    }

    [HttpGet("azuremonitor")]
    public async Task<IActionResult> GetAzureMonitor()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _observability.GetAzureMonitorOverviewAsync(creds));
    }

    [HttpGet("cloudmonitoring")]
    public async Task<IActionResult> GetCloudMonitoring()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        return Ok(await _observability.GetCloudMonitoringOverviewAsync(creds));
    }
}

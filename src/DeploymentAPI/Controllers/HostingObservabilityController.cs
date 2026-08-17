using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace DeploymentAPI.Controllers;

// Hosting Providers page's Frontend/Backend/Database observability
// dashboard - a portal-wide view of THIS deployment's own real Cloudflare
// Worker, Render service, and Postgres, configured once by the
// super-admin and shown identically to every visitor. Deliberately
// separate from PaasController (session-scoped, self-service, no
// AdminGate at all) - every action here is restricted to the single
// super-admin identity, same posture as DatabaseController/
// SecurityTestingController for comparably sensitive infrastructure data.
// Every provider call is delegated to the existing PaasProviderService/
// DatabaseManagementService - no provider-calling logic is duplicated here.
[ApiController]
[Route("api/observability")]
public class HostingObservabilityController : ControllerBase
{
    private static readonly HashSet<string> SupportedProviders =
        new(StringComparer.OrdinalIgnoreCase) { "render", "cloudflare", "netlify", "vercel" };

    private static readonly Dictionary<string, TimeSpan> RangeLookup = new(StringComparer.OrdinalIgnoreCase)
    {
        ["15m"] = TimeSpan.FromMinutes(15),
        ["1h"] = TimeSpan.FromHours(1),
        ["6h"] = TimeSpan.FromHours(6),
        ["24h"] = TimeSpan.FromHours(24),
        ["7d"] = TimeSpan.FromDays(7)
    };

    private readonly SettingsService _settings;
    private readonly PaasProviderService _paas;
    private readonly DatabaseManagementService _db;
    private readonly IActionDescriptorCollectionProvider _routes;

    public HostingObservabilityController(SettingsService settings, PaasProviderService paas,
        DatabaseManagementService db, IActionDescriptorCollectionProvider routes)
    {
        _settings = settings;
        _paas = paas;
        _db = db;
        _routes = routes;
    }

    private static IActionResult? ValidateProvider(string provider, out string normalized)
    {
        normalized = provider?.ToLowerInvariant() ?? string.Empty;

        return SupportedProviders.Contains(normalized)
            ? null
            : new NotFoundObjectResult(new { message = $"Unknown hosting provider \"{provider}\"." });
    }

    // ---- Admin config --------------------------------------------------

    [HttpGet("config")]
    public async Task<IActionResult> GetConfig()
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "view the hosting observability configuration") is IActionResult denied)
            return denied;

        var targets = await _settings.GetPortalDeploymentTargetsAsync();

        var frontendConfigured = !string.IsNullOrWhiteSpace(targets.FrontendProvider)
            && (await _settings.GetPortalPaasCredentialsAsync(targets.FrontendProvider)).IsConfigured;

        var backendConfigured = !string.IsNullOrWhiteSpace(targets.BackendProvider)
            && (await _settings.GetPortalPaasCredentialsAsync(targets.BackendProvider)).IsConfigured;

        var databaseConfigured = !string.IsNullOrWhiteSpace(targets.DatabaseProvider)
            && (await _settings.GetPortalPaasCredentialsAsync(targets.DatabaseProvider)).IsConfigured;

        return Ok(new { targets, frontendConfigured, backendConfigured, databaseConfigured });
    }

    [HttpPost("config")]
    public async Task<IActionResult> SaveConfig(PortalDeploymentTargetsDto request)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "configure the hosting observability targets") is IActionResult denied)
            return denied;

        await _settings.SavePortalDeploymentTargetsAsync(request);

        return Ok(new { success = true });
    }

    [HttpGet("credentials/{provider}/status")]
    public async Task<IActionResult> GetCredentialStatus(string provider)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "view a portal-wide hosting credential's status") is IActionResult denied)
            return denied;

        if (ValidateProvider(provider, out var normalized) is IActionResult invalid)
            return invalid;

        var creds = await _settings.GetPortalPaasCredentialsAsync(normalized);

        return Ok(await _paas.GetStatusAsync(normalized, creds));
    }

    [HttpPost("credentials/{provider}")]
    public async Task<IActionResult> SaveCredentials(string provider, PaasCredentialsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "configure a portal-wide hosting credential") is IActionResult denied)
            return denied;

        if (ValidateProvider(provider, out var normalized) is IActionResult invalid)
            return invalid;

        var existing = await _settings.GetPortalPaasCredentialsAsync(normalized);
        var effectiveToken = string.IsNullOrWhiteSpace(request.Token) ? existing.Token : request.Token;

        if (string.IsNullOrWhiteSpace(effectiveToken))
            return BadRequest(new { message = "A token is required." });

        if (normalized == "cloudflare")
        {
            var effectiveAccountId = string.IsNullOrWhiteSpace(request.AccountId) ? existing.AccountId : request.AccountId;

            if (string.IsNullOrWhiteSpace(effectiveAccountId))
                return BadRequest(new { message = "Cloudflare requires an Account ID." });
        }

        await _settings.SavePortalPaasCredentialsAsync(normalized, request);

        return Ok(new { configured = true });
    }

    [HttpDelete("credentials/{provider}")]
    public async Task<IActionResult> ClearCredentials(string provider)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "clear a portal-wide hosting credential") is IActionResult denied)
            return denied;

        if (ValidateProvider(provider, out var normalized) is IActionResult invalid)
            return invalid;

        await _settings.ClearPortalPaasCredentialsAsync(normalized);

        return Ok(new { success = true });
    }

    // ---- Tabs -----------------------------------------------------------

    [HttpGet("frontend")]
    public async Task<IActionResult> GetFrontend([FromQuery] string range = "1h") =>
        await GetRoleOverview("frontend", range);

    [HttpGet("backend")]
    public async Task<IActionResult> GetBackend([FromQuery] string range = "1h") =>
        await GetRoleOverview("backend", range);

    private async Task<IActionResult> GetRoleOverview(string role, string range)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, $"view the {role} overview") is IActionResult denied)
            return denied;

        var targets = await _settings.GetPortalDeploymentTargetsAsync();

        var (provider, serviceId) = role == "frontend"
            ? (targets.FrontendProvider, targets.FrontendServiceId)
            : (targets.BackendProvider, targets.BackendServiceId);

        var result = new HostingRoleOverviewDto { Role = role, Provider = provider };

        if (string.IsNullOrWhiteSpace(provider) || string.IsNullOrWhiteSpace(serviceId))
            return Ok(result); // Configured=false - "not set up yet", not an error

        var creds = await _settings.GetPortalPaasCredentialsAsync(provider);
        result.Configured = creds.IsConfigured;

        if (!creds.IsConfigured)
            return Ok(result);

        var status = await _paas.GetStatusAsync(provider, creds);
        result.Found = status.Found;
        result.Error = status.Error;

        var svc = status.Services.FirstOrDefault(s => (s.Id ?? s.Name) == serviceId);

        if (svc != null)
        {
            result.ServiceName = svc.Name;
            result.Type = svc.Type;
            result.Status = svc.Status;
            result.Url = svc.Url;
            result.UpdatedAt = svc.UpdatedAt;
            result.CommitSha = svc.CommitSha; // SHA only - never svc.CommitMessage, per spec
            result.Plan = svc.Plan;
        }
        else if (status.Found)
        {
            result.Found = false;
            result.Error = $"The configured {Label(provider)} service wasn't found under the connected account.";
        }

        var span = RangeLookup.TryGetValue(range, out var mapped) ? mapped : TimeSpan.FromHours(1);
        result.Metrics = await _paas.GetServiceMetricsAsync(provider, creds, serviceId, span);

        return Ok(result);
    }

    // ---- Database connection override ----------------------------------

    [HttpGet("database/connection")]
    public async Task<IActionResult> GetDatabaseConnection()
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "view the database connection") is IActionResult denied)
            return denied;

        var (label, connectionString) = await _settings.GetPortalDatabaseConnectionAsync();

        return Ok(new PortalDatabaseConnectionDto
        {
            Configured = !string.IsNullOrWhiteSpace(connectionString),
            ProviderLabel = label,
            MaskedConnection = BuildMaskedConnection(connectionString)
        });
    }

    [HttpPost("database/connection")]
    public async Task<IActionResult> SaveDatabaseConnection(PortalDatabaseConnectionUpdateDto request)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "configure the database connection") is IActionResult denied)
            return denied;

        await _settings.SavePortalDatabaseConnectionAsync(request);

        return Ok(new { success = true });
    }

    [HttpDelete("database/connection")]
    public async Task<IActionResult> ClearDatabaseConnection()
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "clear the database connection") is IActionResult denied)
            return denied;

        await _settings.ClearPortalDatabaseConnectionAsync();

        return Ok(new { success = true });
    }

    // Host/port/database only - same masking rule as
    // DatabaseManagementService.BuildMaskedConnection, duplicated at this
    // small scale rather than exposed from that service, since this is the
    // only place outside it that ever needs to preview a raw connection
    // string before it's saved.
    private static string? BuildMaskedConnection(string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString)) return null;

        try
        {
            var builder = new Npgsql.NpgsqlConnectionStringBuilder(connectionString);
            return $"{builder.Host}:{builder.Port}/{builder.Database}";
        }
        catch
        {
            return null;
        }
    }

    // Live Render Postgres instances, using the portal-wide Render
    // credential (same one the Backend role's Render option uses) - fixes
    // the "Database metrics" role picker's Service dropdown always being
    // empty for Render, since that picker was built on top of
    // GetStatusAsync's /v1/services list, which never included Postgres
    // instances to begin with (see GetRenderDatabasesAsync).
    [HttpGet("database/render-databases")]
    public async Task<IActionResult> GetRenderDatabases()
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "view Render Postgres instances") is IActionResult denied)
            return denied;

        var creds = await _settings.GetPortalPaasCredentialsAsync("render");

        if (!creds.IsConfigured)
            return Ok(new List<RenderDatabaseItemDto>());

        return Ok(await _paas.GetRenderDatabasesAsync(creds));
    }

    // Fetches the real connection string for one Render Postgres instance
    // and saves it directly as the portal's database connection - the
    // string itself is never part of this response or sent to the browser
    // at any point, only "success" or a friendly error.
    [HttpPost("database/render-databases/{databaseId}/connect")]
    public async Task<IActionResult> ConnectRenderDatabase(string databaseId)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "connect a Render database") is IActionResult denied)
            return denied;

        var creds = await _settings.GetPortalPaasCredentialsAsync("render");

        if (!creds.IsConfigured)
            return BadRequest(new { message = "Save a portal-wide Render credential first." });

        var connectionString = await _paas.GetRenderDatabaseConnectionStringAsync(creds, databaseId);

        if (string.IsNullOrWhiteSpace(connectionString))
            return BadRequest(new { message = "Unable to fetch that database's connection info from Render right now." });

        await _settings.SavePortalDatabaseConnectionAsync(new PortalDatabaseConnectionUpdateDto
        {
            ProviderLabel = "Render",
            ConnectionString = connectionString
        });

        return Ok(new { success = true });
    }

    [HttpGet("database")]
    public async Task<IActionResult> GetDatabase([FromQuery] string range = "1h")
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "view the database overview") is IActionResult denied)
            return denied;

        var (dbLabel, dbConnectionOverride) = await _settings.GetPortalDatabaseConnectionAsync();
        var hasOverride = !string.IsNullOrWhiteSpace(dbConnectionOverride);

        var health = await _db.GetHealthAsync(hasOverride ? dbConnectionOverride : null);

        var overview = new HostingDatabaseOverviewDto
        {
            Health = health,
            ConnectionPool = health.Connected ? await _db.GetConnectionPoolAsync(hasOverride ? dbConnectionOverride : null) : null,
            Tables = health.Connected ? (await _db.GetTablesAsync(null, hasOverride ? dbConnectionOverride : null)).Tables : new List<DatabaseTableSummaryDto>(),
            ProviderLabel = hasOverride ? dbLabel : null
        };

        var targets = await _settings.GetPortalDeploymentTargetsAsync();

        if (!string.IsNullOrWhiteSpace(targets.DatabaseProvider) && !string.IsNullOrWhiteSpace(targets.DatabaseServiceId))
        {
            var creds = await _settings.GetPortalPaasCredentialsAsync(targets.DatabaseProvider);

            if (creds.IsConfigured)
            {
                var span = RangeLookup.TryGetValue(range, out var mapped) ? mapped : TimeSpan.FromHours(1);
                overview.Metrics = await _paas.GetServiceMetricsAsync(targets.DatabaseProvider, creds, targets.DatabaseServiceId, span);
            }
        }

        if (overview.Metrics == null || !overview.Metrics.Found)
            overview.MetricsUnavailableReason = "Metric unavailable from this database provider.";

        return Ok(overview);
    }

    [HttpGet("endpoints")]
    public async Task<IActionResult> GetEndpoints()
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "view the endpoint inventory") is IActionResult denied)
            return denied;

        return Ok(EndpointDiscovery.Discover(_routes));
    }

    private static string Label(string provider) => provider switch
    {
        "render" => "Render",
        "cloudflare" => "Cloudflare",
        "netlify" => "Netlify",
        "vercel" => "Vercel",
        _ => provider
    };
}

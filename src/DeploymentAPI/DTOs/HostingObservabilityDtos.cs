namespace DeploymentAPI.DTOs;

// Backs the Hosting Providers page's Frontend/Backend/Database observability
// dashboard (see HostingObservabilityController) — a portal-wide view of
// THIS deployment's own real Cloudflare/Render/Postgres, set up once by the
// super-admin, shown identically to every visitor. Deliberately separate
// from PaasProviderDtos.cs/DatabaseDtos.cs, which back the session-scoped
// self-service Hosting Providers flow and the Settings -> Database row
// browser respectively — those stay untouched, this only reuses their
// existing types (UserPaasCredentials, PaasCredentialsUpdateDto,
// PaasServiceMetricsDto, DatabaseInspectionHealthDto, DatabaseTableSummaryDto).

// Which provider+service fills each of the dashboard's 3 roles. Database is
// optional — only meaningful when the app's real Postgres also happens to be
// a Render-managed database the admin wants to additionally pull CPU/Memory/
// Storage/Connections metrics for via Render's Metrics API; DB health/size/
// table-list/connection-pool all work from DATABASE_URL directly either way.
public class PortalDeploymentTargetsDto
{
    public string? FrontendProvider { get; set; }
    public string? FrontendServiceId { get; set; }
    public string? BackendProvider { get; set; }
    public string? BackendServiceId { get; set; }
    public string? DatabaseProvider { get; set; }
    public string? DatabaseServiceId { get; set; }
}

// One role's (Frontend or Backend) live status - same field set as
// PaasServiceItemDto flattened into a single resolved service, since
// PortalDeploymentTargetsDto always picks out exactly one (unlike the
// self-service page's PaasProviderStatusDto, which lists every service
// under an account). CommitSha only - CommitMessage is deliberately never
// added here, per the spec's "commit ID only" requirement.
public class HostingRoleOverviewDto
{
    public string Role { get; set; } = string.Empty;

    public string? Provider { get; set; }

    // A portal-wide credential AND a target service id are both set for
    // this role - "set up", not "currently reachable" (see Found below).
    public bool Configured { get; set; }

    // The provider call actually succeeded and a matching service was found.
    public bool Found { get; set; }

    public string? Error { get; set; }

    public string? ServiceName { get; set; }
    public string? Type { get; set; }
    public string? Status { get; set; }
    public string? Url { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? CommitSha { get; set; }
    public string? Plan { get; set; }

    // Null when the provider has no metrics API for this role (see
    // PaasProviderService.GetServiceMetricsAsync - only Render today).
    public PaasServiceMetricsDto? Metrics { get; set; }
}

// Named HostingDatabaseOverviewDto, NOT DatabaseOverviewDto - that name is
// already taken by the unrelated app-tables/migration-status DTO at
// DatabaseDtos.cs (Settings > Database's own overview tab).
public class HostingDatabaseOverviewDto
{
    public DatabaseInspectionHealthDto Health { get; set; } = new();

    public DatabaseConnectionPoolDto? ConnectionPool { get; set; }

    public List<DatabaseTableSummaryDto> Tables { get; set; } = new();

    // Only populated when PortalDeploymentTargetsDto.DatabaseProvider/
    // DatabaseServiceId are configured and that provider exposes metrics.
    public PaasServiceMetricsDto? Metrics { get; set; }

    // Spec-required literal fallback wording, set whenever Metrics is null
    // or empty - never fabricate a CPU/Memory/Storage/Connections graph for
    // a database provider that doesn't expose one.
    public string? MetricsUnavailableReason { get; set; }

    // Free-text label the admin gave this database when pasting its own
    // connection string (e.g. "CSP", "AWS RDS", "Supabase") - see
    // PortalDatabaseConnectionDto. Null when no override is configured, in
    // which case this is just this backend's own DATABASE_URL and needs no
    // separate label.
    public string? ProviderLabel { get; set; }
}

// Whether an admin has pointed the dashboard's Database tab at a specific
// Postgres instance (rather than this backend's own DATABASE_URL, the
// default). The connection string itself is never returned here - only
// whether one is set, its label, and a masked host:port/db for
// confirmation (same "never username/password" rule as
// DatabaseInspectionHealthDto.MaskedConnection).
public class PortalDatabaseConnectionDto
{
    public bool Configured { get; set; }
    public string? ProviderLabel { get; set; }
    public string? MaskedConnection { get; set; }
}

// What the Credentials page's Database form posts. Blank ConnectionString
// keeps whatever was already saved (same "blank field keeps existing
// value" convention as every other credential save in this app).
public class PortalDatabaseConnectionUpdateDto
{
    public string ProviderLabel { get; set; } = string.Empty;
    public string ConnectionString { get; set; } = string.Empty;
}

// One Render Postgres instance - a completely different resource type from
// PaasServiceItemDto/GetRenderStatusAsync's /v1/services listing (web/
// worker/static-site only). Render's Postgres offering has its own
// top-level API (/v1/postgres), so it needs its own DTO rather than being
// forced into the generic multi-provider service shape.
public class RenderDatabaseItemDto
{
    public string? Id { get; set; }
    public string? Name { get; set; }
    public string? Status { get; set; }
    public string? Region { get; set; }
    public string? Plan { get; set; }
}

// pg_stat_activity-derived connection counts for this app's own database -
// see DatabaseManagementService.GetConnectionPoolAsync.
public class DatabaseConnectionPoolDto
{
    public int ActiveConnections { get; set; }
    public int IdleConnections { get; set; }
    public int TotalConnections { get; set; }
    public int MaxConnections { get; set; }
}

// One row of the Backend Endpoint Inventory panel - see EndpointDiscovery.
// No health/response-time columns in Phase 1: showing those for real
// requires the request-counting middleware from a later fast-follow: this
// app currently tracks zero per-request telemetry anywhere.
public class HostingEndpointInventoryItemDto
{
    public string Controller { get; set; } = string.Empty;
    public string Method { get; set; } = "GET";
    public string Path { get; set; } = string.Empty;
}

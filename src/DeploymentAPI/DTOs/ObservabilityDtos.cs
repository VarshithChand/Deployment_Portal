namespace DeploymentAPI.DTOs;

// The Observability sidebar group's 4 CSP-native tools (CloudWatch, AWS
// X-Ray, Azure Monitor, GCP Cloud Monitoring) - each reuses this app's
// EXISTING AWS/Azure/GCP credential (see UserAwsCredentials/
// UserAzureCredentials/UserGcpCredentials), same self-service posture as
// every other Cloud Services feature. The other 10 tools in this group
// (Prometheus/Datadog/ELK/OpenSearch/Loki/Fluent Bit/Fluentd/
// OpenTelemetry/Jaeger/Zipkin) are each a separate self-hosted/third-party
// service reusing the EXISTING generic PortalHostCredentials (HostUrl/
// Username/Password) storage and ObservabilityController's own
// {provider}/host routes - no new DTOs needed for those, see
// ContainerRegistryDtos.cs's PortalHostCredentials.

// ================= AWS CloudWatch =================

public class CloudWatchAlarmDto
{
    public string Name { get; set; } = string.Empty;

    public string? State { get; set; }

    public string? MetricName { get; set; }

    public string? Namespace { get; set; }

    public string? Reason { get; set; }

    public DateTime? UpdatedAt { get; set; }
}

public class CloudWatchLogGroupDto
{
    public string Name { get; set; } = string.Empty;

    public long? StoredBytes { get; set; }

    public int? RetentionDays { get; set; }

    public DateTime? CreatedAt { get; set; }
}

public class CloudWatchOverviewDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public string? Region { get; set; }

    public List<CloudWatchAlarmDto> Alarms { get; set; } = new();

    public List<CloudWatchLogGroupDto> LogGroups { get; set; } = new();
}

// ================= AWS X-Ray =================

public class XRayTraceDto
{
    public string Id { get; set; } = string.Empty;

    public double? Duration { get; set; }

    public double? ResponseTime { get; set; }

    public bool HasError { get; set; }

    public bool HasFault { get; set; }

    public bool HasThrottle { get; set; }

    public string? Url { get; set; }

    public DateTime? StartTime { get; set; }
}

public class XRayOverviewDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public string? Region { get; set; }

    // Last 6 hours only - X-Ray's own GetTraceSummaries call requires a
    // bounded time window, and a glance at "what's happened recently" is
    // what this page is for, not an exhaustive trace archive browser.
    public List<XRayTraceDto> Traces { get; set; } = new();
}

// ================= Azure Monitor =================

// Log Analytics Workspaces and Application Insights components are both
// already captured by the account-wide Azure resource inventory (see
// CloudStatusService.GetAzureResourceInventoryAsync's own
// AzureResourceTypeLabels) - reused here via AwsResourceItemDto rather
// than re-fetched, so this page's own "what does Azure Monitor have"
// question doesn't need a second inventory scan.
public class AzureActivityLogEntryDto
{
    public string? EventName { get; set; }

    public string? OperationName { get; set; }

    public string? Status { get; set; }

    public string? ResourceId { get; set; }

    public DateTime? Timestamp { get; set; }
}

public class AzureMonitorOverviewDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<AwsResourceItemDto> LogAnalyticsWorkspaces { get; set; } = new();

    public List<AwsResourceItemDto> ApplicationInsights { get; set; } = new();

    // Last 24 hours - the Activity Log API itself is a full audit trail
    // (every control-plane operation on the subscription), this is
    // deliberately just a recent-activity glance, not an exhaustive log
    // viewer.
    public List<AzureActivityLogEntryDto> RecentActivity { get; set; } = new();
}

// ================= GCP Cloud Monitoring =================

public class GcpAlertPolicyDto
{
    public string Name { get; set; } = string.Empty;

    public string? DisplayName { get; set; }

    public bool Enabled { get; set; }

    public string? CombinerCondition { get; set; }
}

public class GcpUptimeCheckDto
{
    public string Name { get; set; } = string.Empty;

    public string? DisplayName { get; set; }

    public string? MonitoredResourceType { get; set; }

    public int? PeriodSeconds { get; set; }
}

public class CloudMonitoringOverviewDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<GcpAlertPolicyDto> AlertPolicies { get; set; } = new();

    public List<GcpUptimeCheckDto> UptimeChecks { get; set; } = new();
}

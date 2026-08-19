namespace DeploymentAPI.DTOs;

// Phase A of the PaaS/Microservices console - AWS Elastic Beanstalk.
// Reuses SecurityRuleDto/MetricSeriesDto/ResourceMetricsDto/
// CloudServiceActionResultDto (from the earlier multi-cloud
// infrastructure console phases) unchanged - no new metric/action-result
// shapes needed here.

public class EbApplicationDto
{
    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public DateTime? DateCreated { get; set; }

    public DateTime? DateUpdated { get; set; }
}

public class EbApplicationListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<EbApplicationDto> Applications { get; set; } = new();
}

public class EbEnvironmentDto
{
    public string EnvironmentName { get; set; } = string.Empty;

    public string? EnvironmentId { get; set; }

    public string ApplicationName { get; set; } = string.Empty;

    // EB's own vocabulary (Ready/Launching/Updating/Terminating/
    // Terminated) - not normalized to another provider's states, same
    // "StateBadge already handles an open-ended string" reasoning used
    // for Azure VM/GCP VM power states.
    public string? Status { get; set; }

    // Green/Yellow/Red/Grey.
    public string? Health { get; set; }

    public string? HealthStatus { get; set; }

    public string? Url { get; set; }

    public string? PlatformArn { get; set; }

    public string? VersionLabel { get; set; }

    public string? Tier { get; set; }

    public DateTime? DateCreated { get; set; }

    public DateTime? DateUpdated { get; set; }
}

public class EbEnvironmentListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<EbEnvironmentDto> Environments { get; set; } = new();
}

// Name/IsSecret/Value(nullable) rather than a plain dictionary - a
// secret's Value is always null once IsSecret is true (section 38's
// explicit contract), never a redacted placeholder string masquerading
// as real data.
public class EbEnvironmentVariableDto
{
    public string Name { get; set; } = string.Empty;

    public bool IsSecret { get; set; }

    public string? Value { get; set; }
}

public class EbEnvironmentDetailDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public EbEnvironmentDto? Environment { get; set; }

    public List<string> InstanceIds { get; set; } = new();

    public string? LoadBalancerName { get; set; }

    public string? AutoScalingGroupName { get; set; }

    public int? MinSize { get; set; }

    public int? MaxSize { get; set; }

    public List<EbEnvironmentVariableDto> EnvironmentVariables { get; set; } = new();
}

public class EbApplicationVersionDto
{
    public string VersionLabel { get; set; } = string.Empty;

    public string? Description { get; set; }

    public DateTime? DateCreated { get; set; }

    public string? SourceBundle { get; set; }

    public string? Status { get; set; }
}

public class EbApplicationVersionListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<EbApplicationVersionDto> Versions { get; set; } = new();
}

public class EbEventDto
{
    public DateTime? EventDate { get; set; }

    public string? Severity { get; set; }

    public string Message { get; set; } = string.Empty;
}

public class EbEventListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<EbEventDto> Events { get; set; } = new();
}

public class EbDeployVersionRequestDto
{
    public string VersionLabel { get; set; } = string.Empty;
}

public class EbScaleRequestDto
{
    public int MinSize { get; set; }

    public int MaxSize { get; set; }
}

// Sets (or, when Value is null, removes) one environment variable.
// EB's config-settings API has no single-key upsert - the whole
// namespace is replaced - so the backend does a real read-modify-write
// against the CURRENT settings, not a naive overwrite (see
// ElasticBeanstalkService.UpdateEnvironmentVariableAsync).
public class EbEnvironmentVariableUpdateDto
{
    public string Name { get; set; } = string.Empty;

    public string? Value { get; set; }
}

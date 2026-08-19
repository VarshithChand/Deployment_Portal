namespace DeploymentAPI.DTOs;

// Phase 2 of the multi-cloud infrastructure console - AWS ECS's fuller
// console (task/container drill-down, logs, metrics, bulk scaling, ECR
// image correlation). See security_findings.txt's Phase 2 entry for the
// plan this implements.

public class EcsContainerDto
{
    public string Name { get; set; } = string.Empty;

    public string? Image { get; set; }

    public string? ImageDigest { get; set; }

    public string? LastStatus { get; set; }

    public string? HealthStatus { get; set; }

    public int? ExitCode { get; set; }

    public List<string> Ports { get; set; } = new();

    // Environment variables from the task DEFINITION (not the running task
    // instance - ECS doesn't expose that separately), with anything whose
    // key looks like a secret (SECRET/PASSWORD/TOKEN/KEY/CREDENTIAL/etc.)
    // redacted server-side before this ever reaches the frontend - never
    // the real secret value, per section 12's explicit "WITHOUT secrets".
    public Dictionary<string, string> Environment { get; set; } = new();
}

public class EcsTaskDto
{
    public string TaskId { get; set; } = string.Empty;

    public string TaskArn { get; set; } = string.Empty;

    public string LastStatus { get; set; } = string.Empty;

    public string? HealthStatus { get; set; }

    public DateTime? StartedAt { get; set; }

    public string? Cpu { get; set; }

    public string? Memory { get; set; }

    public string? AvailabilityZone { get; set; }

    public List<EcsContainerDto> Containers { get; set; } = new();
}

public class EcsServiceDetailDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public string ClusterName { get; set; } = string.Empty;

    public string ServiceName { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public int DesiredCount { get; set; }

    public int RunningCount { get; set; }

    public int PendingCount { get; set; }

    public string? TaskDefinition { get; set; }

    public string? DeploymentStatus { get; set; }

    public List<EcsTaskDto> Tasks { get; set; } = new();
}

// Which ECR repository/tag this service's task definition actually
// references, and (if it resolves to this account's ECR) the real
// digest/push time/size for that exact tag - section 15's "which
// deployment is currently running" answer.
public class EcsRunningImageDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public string? Image { get; set; }

    public bool IsEcr { get; set; }

    public string? Repository { get; set; }

    public string? Tag { get; set; }

    public string? Digest { get; set; }

    public DateTime? PushedAt { get; set; }

    public long? SizeBytes { get; set; }
}

public class EcsServiceRefDto
{
    public string Cluster { get; set; } = string.Empty;

    public string Service { get; set; } = string.Empty;
}

public class EcsBulkScaleRequestDto
{
    public List<EcsServiceRefDto> Services { get; set; } = new();

    public int DesiredCount { get; set; }
}

public class EcsBulkActionItemResultDto
{
    public string Cluster { get; set; } = string.Empty;

    public string Service { get; set; } = string.Empty;

    public bool Success { get; set; }

    public string? Error { get; set; }
}

// Never reported as a single pass/fail (section 27's "do not report bulk
// operation as successful if some resources failed") - the frontend
// renders one row per service with its own outcome, this DTO just carries
// that list back.
public class EcsBulkActionResultDto
{
    public List<EcsBulkActionItemResultDto> Results { get; set; } = new();
}

public class LogLineDto
{
    public DateTime Timestamp { get; set; }

    public string Message { get; set; } = string.Empty;
}

public class EcsLogsDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<LogLineDto> Lines { get; set; } = new();
}

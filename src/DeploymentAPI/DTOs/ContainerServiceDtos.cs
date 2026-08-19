namespace DeploymentAPI.DTOs;

// Phase 3 of the multi-cloud infrastructure console - Azure Container
// Apps and GCP Cloud Run, both entirely new backend integrations with no
// existing precedent in this codebase before this round (unlike Phase 1/2,
// which extended EC2/Azure VM/GCP Compute/ECS surfaces that partially
// already existed). See security_findings.txt's Phase 3 entry for the
// plan this implements. Deliberately NOT modeled as identical siblings -
// Container Apps has real Start/Stop operations, Cloud Run does not (see
// GcpCloudRunServiceDto's own comment) - section 18's explicit "do not
// pretend Cloud Run has EC2-style start/stop semantics".

// ================= Azure Container Apps =================

public class AzureContainerAppDto
{
    public string Name { get; set; } = string.Empty;

    public string ResourceGroup { get; set; } = string.Empty;

    public string Location { get; set; } = string.Empty;

    public string? EnvironmentId { get; set; }

    public string? Image { get; set; }

    public string? FqdnUrl { get; set; }

    public string? ProvisioningState { get; set; }

    // "Running" / "Stopped" (Container Apps' own runningStatus field) -
    // distinct from ProvisioningState (whether the last deployment
    // succeeded) and from an individual revision's own state.
    public string? RunningStatus { get; set; }

    public int MinReplicas { get; set; }

    public int MaxReplicas { get; set; }
}

public class AzureContainerAppListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<AzureContainerAppDto> Apps { get; set; } = new();
}

public class AzureContainerAppRevisionDto
{
    public string Name { get; set; } = string.Empty;

    public bool Active { get; set; }

    public int Replicas { get; set; }

    public int TrafficWeight { get; set; }

    public DateTime? CreatedTime { get; set; }

    public string? ProvisioningState { get; set; }
}

public class AzureContainerAppDetailDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public AzureContainerAppDto? App { get; set; }

    public List<AzureContainerAppRevisionDto> Revisions { get; set; } = new();
}

public class AzureContainerAppScaleRequestDto
{
    public int MinReplicas { get; set; }

    public int MaxReplicas { get; set; }
}

// ================= GCP Cloud Run =================
//
// Cloud Run has no Start/Stop the way a VM or even Container Apps does -
// a service is either deployed (serving traffic per its scaling config)
// or deleted. What this app exposes instead, per section 18's "expose
// the provider-equivalent operation": Scale (min/max instance count,
// Cloud Run's real autoscaling knobs) and Redeploy (forces a new
// revision by touching an annotation - the standard real-world Cloud Run
// "restart" workaround, not a fabricated stop/start pair).
public class GcpCloudRunServiceDto
{
    public string Name { get; set; } = string.Empty;

    public string Location { get; set; } = string.Empty;

    public string? Url { get; set; }

    public string? Image { get; set; }

    public string? LatestReadyRevision { get; set; }

    public string? Condition { get; set; }

    public int MinInstances { get; set; }

    public int MaxInstances { get; set; }
}

public class GcpCloudRunServiceListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<GcpCloudRunServiceDto> Services { get; set; } = new();
}

public class GcpCloudRunScaleRequestDto
{
    public int MinInstances { get; set; }

    public int MaxInstances { get; set; }
}

// Phase C extension - section 21's revision list + traffic split,
// section 22's rollback. Cloud Run's real model (revisions + traffic
// percentages), not an invented "slot" abstraction - section 22's
// explicit "do not invent a slot swap abstraction for GCP".
public class GcpCloudRunRevisionDto
{
    public string Name { get; set; } = string.Empty;

    public DateTime? CreatedAt { get; set; }

    public string? Image { get; set; }

    // Ready/NotReady/Unknown, from the revision's own "Ready" condition.
    public string? Status { get; set; }

    public int TrafficPercent { get; set; }
}

public class GcpCloudRunRevisionListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<GcpCloudRunRevisionDto> Revisions { get; set; } = new();
}

public class GcpCloudRunTrafficEntryDto
{
    public string Revision { get; set; } = string.Empty;

    public int Percent { get; set; }
}

public class GcpCloudRunTrafficUpdateRequestDto
{
    public List<GcpCloudRunTrafficEntryDto> Traffic { get; set; } = new();
}

// Rollback is Cloud Run's real traffic model applied as a convenience -
// set the target revision to 100% traffic, not a fabricated "revert"
// operation Cloud Run doesn't actually have.
public class GcpCloudRunRollbackRequestDto
{
    public string RevisionName { get; set; } = string.Empty;
}

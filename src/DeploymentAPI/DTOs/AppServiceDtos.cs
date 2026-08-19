namespace DeploymentAPI.DTOs;

// Phase B of the PaaS/Microservices console - Azure App Service +
// Deployment Slots + Swap. Reuses ResourceMetricsDto/MetricSeriesDto/
// CloudServiceActionResultDto unchanged - no new metric/action-result
// shapes needed. Environment-variable shape mirrors Elastic Beanstalk's
// EbEnvironmentVariableDto exactly (Name/IsSecret/Value-nullable) for
// the same section-38 contract, just under an Azure-specific name.

public class AzureAppServiceDto
{
    public string Name { get; set; } = string.Empty;

    public string ResourceGroup { get; set; } = string.Empty;

    public string Location { get; set; } = string.Empty;

    // Running/Stopped - Azure's own vocabulary, StateBadge already
    // handles an open-ended string.
    public string? State { get; set; }

    public string? DefaultHostName { get; set; }

    public string? Kind { get; set; }

    public string? ServerFarmId { get; set; }

    public int SlotCount { get; set; }
}

public class AzureAppServiceListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<AzureAppServiceDto> Apps { get; set; } = new();
}

public class AzureAppServiceSlotDto
{
    // "production" for the main site's own pseudo-slot row (Azure's
    // deployment-slots API treats the main site as a slot conceptually
    // named "production", even though it isn't a real /slots/{name}
    // child resource) - every other entry is a real slot resource.
    public string Name { get; set; } = string.Empty;

    public string? State { get; set; }

    public string? DefaultHostName { get; set; }

    public bool IsProductionSlot { get; set; }
}

public class AzureAppServiceDetailDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public AzureAppServiceDto? App { get; set; }

    // A curated read-only slice of siteConfig - not the full ARM
    // property bag (section 18's "do not expose unsupported settings
    // for a provider" - full config editing isn't built this round,
    // stated plainly rather than half-implemented).
    public string? Runtime { get; set; }

    public bool? AlwaysOn { get; set; }

    public List<AzureAppServiceSlotDto> Slots { get; set; } = new();
}

public class AzureAppServiceEnvVarDto
{
    public string Name { get; set; } = string.Empty;

    public bool IsSecret { get; set; }

    public string? Value { get; set; }
}

public class AzureAppServiceEnvVarListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<AzureAppServiceEnvVarDto> Variables { get; set; } = new();
}

// Sets (or, when Value is null, removes) one app setting. Azure's own
// appsettings API has no single-key upsert either - PUT replaces the
// whole set - same real read-modify-write shape as Elastic Beanstalk's
// environment variables (see AzureAppServiceManagementService.
// UpdateEnvVarAsync).
public class AzureAppServiceEnvVarUpdateDto
{
    public string Name { get; set; } = string.Empty;

    public string? Value { get; set; }
}

// Scales the App Service PLAN (Microsoft.Web/serverfarms) this app runs
// on, not the app in isolation - Azure's real model: instance count is a
// property of the plan, and every app on that plan shares it. Surfaced
// honestly in the frontend's own field-hint, not hidden.
public class AzureAppServiceScaleRequestDto
{
    public int Capacity { get; set; }
}

public class AzureSlotSwapRequestDto
{
    public string TargetSlot { get; set; } = "production";
}

public class AzureBulkSwapItemDto
{
    public string ResourceGroup { get; set; } = string.Empty;

    public string AppName { get; set; } = string.Empty;

    public string SourceSlot { get; set; } = string.Empty;

    public string TargetSlot { get; set; } = "production";
}

public class AzureBulkSwapRequestDto
{
    public List<AzureBulkSwapItemDto> Items { get; set; } = new();
}

public class AzureBulkActionItemResultDto
{
    public string AppName { get; set; } = string.Empty;

    public string? Slot { get; set; }

    public bool Success { get; set; }

    public string? Error { get; set; }
}

// Never a single pass/fail for the whole batch - section 13/27's
// explicit "never report the entire operation as successful if some
// resources failed", same contract already used for ECS bulk scaling.
public class AzureBulkActionResultDto
{
    public List<AzureBulkActionItemResultDto> Results { get; set; } = new();
}

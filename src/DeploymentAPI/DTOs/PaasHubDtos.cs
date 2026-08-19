namespace DeploymentAPI.DTOs;

// Phase C of the PaaS/Microservices console - the cross-provider hub
// page (section 2's main application list). One loose, provider-
// agnostic shape covering AWS Elastic Beanstalk environments, Azure App
// Service apps, and GCP Cloud Run services - same "one shared shape
// beats three near-identical DTOs" reasoning already used for
// AwsResourceItemDto/SecurityRuleDto/MetricSeriesDto.
public class PaasApplicationDto
{
    // "AWS" | "Azure" | "GCP".
    public string Provider { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    // EB's ApplicationName / Azure's ResourceGroup / GCP's Location -
    // whichever "grouping" concept that provider actually has, not a
    // fabricated shared field.
    public string? Environment { get; set; }

    public string? Region { get; set; }

    // Azure only - carried through so a bulk action item can address
    // this app without a second lookup.
    public string? ResourceGroup { get; set; }

    public string? Status { get; set; }

    public string? Version { get; set; }

    public string? Url { get; set; }
}

public class PaasApplicationListDto
{
    public bool AwsConfigured { get; set; }

    public bool AzureConfigured { get; set; }

    public bool GcpConfigured { get; set; }

    public string? AwsError { get; set; }

    public string? AzureError { get; set; }

    public string? GcpError { get; set; }

    public List<PaasApplicationDto> Applications { get; set; } = new();
}

// Section 14's bulk lifecycle actions - scoped to Restart only at the
// hub level (see PaasAggregationService.BulkRestartAsync's own comment
// for why): Elastic Beanstalk and Cloud Run don't have a real Start/Stop
// operation the way Azure App Service does, so a hub-level bulk Start/
// Stop button would either lie for two-thirds of providers or need to
// silently skip them - neither is honest. Restart has a real equivalent
// on all three (RestartAppServer / site restart / Cloud Run redeploy).
public class PaasBulkRestartItemDto
{
    public string Provider { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? ResourceGroup { get; set; }
}

public class PaasBulkRestartRequestDto
{
    public List<PaasBulkRestartItemDto> Items { get; set; } = new();
}

public class PaasBulkActionItemResultDto
{
    public string Provider { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public bool Success { get; set; }

    public string? Error { get; set; }
}

// Never a single pass/fail for the whole batch - same contract as every
// other bulk operation in this app.
public class PaasBulkActionResultDto
{
    public List<PaasBulkActionItemResultDto> Results { get; set; } = new();
}

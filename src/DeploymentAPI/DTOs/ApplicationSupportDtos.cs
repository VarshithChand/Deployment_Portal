namespace DeploymentAPI.DTOs;

// Every field here comes from a real, already-resolved source
// (ApplicationBuildInfoService, SettingsService.CheckDatabaseHealthAsync,
// GitHubApiService's workflow runs) - never invented. See
// ApplicationSupportController.

public class ApplicationVersionDto
{
    public string Application { get; set; } = "Deployment Portal";

    public string Environment { get; set; } = string.Empty;

    public string BackendCommit { get; set; } = string.Empty;

    public string? BackendVersion { get; set; }

    public DateTime BackendStartedAtUtc { get; set; }
}

public class ApplicationHealthDto
{
    public bool BackendHealthy { get; set; } = true;

    public bool DatabaseHealthy { get; set; }

    public string DatabaseMode { get; set; } = string.Empty;

    public string? DatabaseError { get; set; }

    public double? DatabaseResponseTimeMs { get; set; }

    public bool GitHubConfigured { get; set; }
}

// The production environment's (or, absent one named that, the first
// configured environment's) latest workflow run - the same derivation
// EnvironmentsController already does for the Dashboard's Environments
// card, reused here rather than reinvented.
public class LatestDeploymentDto
{
    public string? EnvironmentName { get; set; }

    public string? WorkflowName { get; set; }

    public long? RunId { get; set; }

    public long? RunNumber { get; set; }

    public string? Branch { get; set; }

    public string? CommitSha { get; set; }

    public string? Status { get; set; }

    public string? Conclusion { get; set; }

    public DateTime? StartedAtUtc { get; set; }

    public string? HtmlUrl { get; set; }
}

// What a session's frontend reports about itself once per app load (see
// deployment-ui/utils/buildInfo.js) - build-time metadata only, never
// anything from credentials/tokens/env vars beyond the public build stamp.
public class FrontendHeartbeatRequestDto
{
    public string Commit { get; set; } = string.Empty;

    public string? Version { get; set; }

    public string Environment { get; set; } = string.Empty;
}

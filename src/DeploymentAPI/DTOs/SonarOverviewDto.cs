namespace DeploymentAPI.DTOs;

// What the Code Quality page shows — a handful of headline metrics plus a
// link out to the full Sonar dashboard, not a re-implementation of Sonar's
// own issue browser.
public class SonarOverviewDto
{
    public bool Configured { get; set; }

    public string DashboardUrl { get; set; } = string.Empty;

    public string QualityGateStatus { get; set; } = string.Empty;

    public int Bugs { get; set; }

    public int Vulnerabilities { get; set; }

    public int CodeSmells { get; set; }

    public double CoveragePercent { get; set; }

    public double DuplicatedLinesPercent { get; set; }

    public string ReliabilityRating { get; set; } = string.Empty;

    public string SecurityRating { get; set; } = string.Empty;

    public string MaintainabilityRating { get; set; } = string.Empty;

    public int LinesOfCode { get; set; }

    public string? Error { get; set; }
}

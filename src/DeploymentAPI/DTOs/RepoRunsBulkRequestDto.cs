namespace DeploymentAPI.DTOs;

// Backs POST /api/github/repo-runs/bulk - the Dashboard's "all your repos"
// grid used to fire one GET /api/github/repo-runs per repo (25-30+ parallel
// requests on load and on every poll tick); this collapses that into one
// round trip carrying every repo the grid needs runs for.
public class RepoRunsBulkRequestDto
{
    public List<RepoRefDto> Repos { get; set; } = new();
}

public class RepoRefDto
{
    public string Owner { get; set; } = string.Empty;

    public string Repo { get; set; } = string.Empty;
}

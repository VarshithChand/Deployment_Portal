namespace DeploymentAPI.DTOs;

public class SidebarAccessUpdateDto
{
    // Keyed by sidebar tab key (e.g. "docker", "storage") -> "locked" or
    // "hidden". A tab with no entry here is fully visible/usable.
    public Dictionary<string, string> States { get; set; } = new();
}

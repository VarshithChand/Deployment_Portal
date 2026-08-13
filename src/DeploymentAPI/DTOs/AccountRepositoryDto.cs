namespace DeploymentAPI.DTOs;

// A repository the configured Personal Access Token's account can see —
// lets Settings offer "pick a repo" instead of only "type a URL".
public class AccountRepositoryDto
{
    public string FullName { get; set; } = string.Empty;

    public string Owner { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public bool Private { get; set; }
}

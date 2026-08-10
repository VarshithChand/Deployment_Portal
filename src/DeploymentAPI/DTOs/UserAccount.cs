namespace DeploymentAPI.DTOs;

// Named UserAccount rather than User to avoid colliding with
// ControllerBase.User (the request's ClaimsPrincipal) when referenced
// unqualified inside a controller.
public class UserAccount
{
    public int Id { get; set; }

    public string Username { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string Role { get; set; } = "Viewer";

    public bool Active { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

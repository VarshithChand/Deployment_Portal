namespace DeploymentAPI.DTOs;

public class CreateUserRequest
{
    public string Username { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string Role { get; set; } = "Viewer";
}

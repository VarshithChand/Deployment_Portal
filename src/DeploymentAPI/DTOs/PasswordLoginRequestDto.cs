namespace DeploymentAPI.DTOs;

public class PasswordLoginRequestDto
{
    public string Email { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;
}

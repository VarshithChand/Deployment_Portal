namespace DeploymentAPI.DTOs;

public class PasswordLoginRequestDto
{
    // Either an email or a username (see AccountAuthService.
    // LoginWithPasswordAsync - resolved by whichever this looks like).
    public string EmailOrUsername { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;
}

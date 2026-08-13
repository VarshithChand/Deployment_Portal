namespace DeploymentAPI.DTOs;

public class GitHubSettingsUpdateDto
{
    public string Owner { get; set; } = string.Empty;

    public string Repository { get; set; } = string.Empty;

    // Left blank/null keeps the previously saved token instead of clearing it.
    public string? PersonalAccessToken { get; set; }

    // Only meaningful when PersonalAccessToken is also provided and its
    // resolved owner has MFA enabled - see MfaGate. Exactly one of these
    // two is expected when required; RecoveryCode is the "lost my phone"
    // fallback, single-use.
    public string? MfaCode { get; set; }

    public string? RecoveryCode { get; set; }
}

namespace DeploymentAPI.DTOs;

public class SonarSettingsUpdateDto
{
    public string HostUrl { get; set; } = "https://sonarcloud.io";

    public string Organization { get; set; } = string.Empty;

    public string ProjectKey { get; set; } = string.Empty;

    public string? Token { get; set; }
}

public record SonarCredentials(string HostUrl, string Organization, string ProjectKey, string? Token)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(ProjectKey) && !string.IsNullOrWhiteSpace(Token);
}

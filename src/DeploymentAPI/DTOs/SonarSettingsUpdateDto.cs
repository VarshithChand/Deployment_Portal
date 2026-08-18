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
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(HostUrl) && !string.IsNullOrWhiteSpace(ProjectKey) && !string.IsNullOrWhiteSpace(Token);
}

// Non-secret status shown on the Code Quality sub-pages and their Settings
// credential forms - matches how every other credential status DTO in this
// app (AwsSettingsDto, ContainerRegistryCredentialStatusDto, etc.) works.
public class SonarStatusDto
{
    public bool Configured { get; set; }
    public string HostUrl { get; set; } = string.Empty;
    public string Organization { get; set; } = string.Empty;
    public string ProjectKey { get; set; } = string.Empty;
}

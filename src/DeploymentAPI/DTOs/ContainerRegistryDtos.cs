namespace DeploymentAPI.DTOs;

// Docker Hub and GHCR (GitHub Container Registry) - the two "standalone"
// registries built in this pass, browsing against the shared, portal-wide
// credential in SettingsService.GetPortalContainerRegistryCredentialsAsync
// (see its own comment for why that's a separate store from
// PortalPaasCredentials). Shapes mirror the existing AwsEcr*/AzureAcr*/
// GcpArtifactRegistry* DTOs' Configured/Error contract - Configured is false
// only when nobody has saved a credential yet; Error carries a sanitized
// message (see CloudErrorSanitizer) for every other kind of failure so the
// two states are never confused in the UI.

public class DockerHubRepositoryDto
{
    public string Name { get; set; } = string.Empty;
    public string Namespace { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool IsPrivate { get; set; }
    public int PullCount { get; set; }
    public int StarCount { get; set; }
    public DateTime? LastUpdated { get; set; }
}

public class DockerHubRepositoryListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<DockerHubRepositoryDto> Repositories { get; set; } = new();
}

public class DockerHubTagDto
{
    public string Tag { get; set; } = string.Empty;
    public string? Digest { get; set; }
    public long? SizeBytes { get; set; }
    public DateTime? PushedAt { get; set; }
}

public class DockerHubTagListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<DockerHubTagDto> Images { get; set; } = new();
}

public class GhcrPackageDto
{
    public string Name { get; set; } = string.Empty;
    public string Visibility { get; set; } = string.Empty;
    public int VersionCount { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class GhcrPackageListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<GhcrPackageDto> Packages { get; set; } = new();
}

public class GhcrVersionDto
{
    public string Tag { get; set; } = string.Empty;
    public string? Digest { get; set; }
    public DateTime? PushedAt { get; set; }
}

public class GhcrVersionListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<GhcrVersionDto> Images { get; set; } = new();
}

// Non-secret status shown on the Container Registry hub and the Settings
// credential form - Username only (never the token), matching how every
// other credential status DTO in this app (AwsSettingsDto, AzureSettingsDto,
// GcpSettingsDto) already works.
public class ContainerRegistryCredentialStatusDto
{
    public bool Configured { get; set; }
    public string Username { get; set; } = string.Empty;
}

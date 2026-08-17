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

// ============================================================
// GitLab Container Registry and JFrog Artifactory - unlike Docker Hub/GHCR,
// neither is reachable from a bare (username, token) pair: GitLab's
// registry is scoped to one project (self-hosted or gitlab.com), and
// Artifactory has no fixed host at all - every instance is its own domain.
// Both get their own dedicated credential shape/storage
// (SettingsService.GetPortalGitLabRegistryCredentialsAsync/
// GetPortalJfrogCredentialsAsync) rather than reusing
// PortalContainerRegistryCredentials's generic (Token, AccountId) pair,
// same reasoning that shape itself was kept separate from
// PortalPaasCredentials - a shape that doesn't fit is a sign to add a new
// one, not to overload an existing one with an extra convention-only field.

public record PortalGitLabRegistryCredentials(string? HostUrl, string? ProjectId, string? Token)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(Token) && !string.IsNullOrWhiteSpace(ProjectId);
}

public class GitLabRegistryCredentialsUpdateDto
{
    public string HostUrl { get; set; } = string.Empty;
    public string ProjectId { get; set; } = string.Empty;
    public string Token { get; set; } = string.Empty;
}

public class GitLabRegistryStatusDto
{
    public bool Configured { get; set; }
    public string HostUrl { get; set; } = string.Empty;
    public string ProjectId { get; set; } = string.Empty;
}

public record PortalJfrogCredentials(string? HostUrl, string? Token)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(Token) && !string.IsNullOrWhiteSpace(HostUrl);
}

public class JfrogCredentialsUpdateDto
{
    public string HostUrl { get; set; } = string.Empty;
    public string Token { get; set; } = string.Empty;
}

public class JfrogStatusDto
{
    public bool Configured { get; set; }
    public string HostUrl { get; set; } = string.Empty;
}

public class GitLabRegistryRepositoryDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public int TagsCount { get; set; }
    public DateTime? CreatedAt { get; set; }
}

public class GitLabRegistryRepositoryListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<GitLabRegistryRepositoryDto> Repositories { get; set; } = new();
}

public class GitLabRegistryTagDto
{
    public string Tag { get; set; } = string.Empty;
    public string? Digest { get; set; }
    public long? SizeBytes { get; set; }
    public DateTime? PushedAt { get; set; }
}

public class GitLabRegistryTagListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<GitLabRegistryTagDto> Images { get; set; } = new();
}

public class JfrogRepositoryDto
{
    public string Key { get; set; } = string.Empty;
    public string PackageType { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public class JfrogRepositoryListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<JfrogRepositoryDto> Repositories { get; set; } = new();
}

public class JfrogImageDto
{
    public string Name { get; set; } = string.Empty;
}

public class JfrogImageListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<JfrogImageDto> Images { get; set; } = new();
}

public class JfrogTagDto
{
    public string Tag { get; set; } = string.Empty;
    public string? Digest { get; set; }
}

public class JfrogTagListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<JfrogTagDto> Images { get; set; } = new();
}

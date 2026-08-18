namespace DeploymentAPI.DTOs;

// Docker Hub and GHCR (GitHub Container Registry) - two of the "standalone"
// registries, browsing against this session's own credential (reuses
// UserPaasCredentials/GetUserPaasCredentialsAsync directly - see
// SettingsService's own comment). Shapes mirror the existing AwsEcr*/AzureAcr*/
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
// Both get their own dedicated, session-scoped credential shape/storage
// (SettingsService.GetUserGitLabRegistryCredentialsAsync/
// GetUserJfrogCredentialsAsync) rather than reusing UserPaasCredentials'
// generic (Token, AccountId) pair - a shape that doesn't fit is a sign to
// add a new one, not to overload an existing one with an extra
// convention-only field.

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

// ============================================================
// Harbor and Nexus - the final two providers from the original reference
// image. Both are almost always self-hosted (no fixed host, like JFrog),
// and both authenticate with a plain username + password/token pair (Basic
// auth) rather than a single bearer token - so both share one dedicated
// credential shape (HostUrl, Username, Password) and, on the frontend, one
// shared login form component rather than two near-identical bespoke ones
// (see HostCredentialLoginSection.jsx) - the same "one generic shape for
// several near-identical providers" reasoning UserPaasCredentials(Token,
// AccountId) already uses for Render/Cloudflare/Netlify/Vercel.

public record PortalHostCredentials(string? HostUrl, string? Username, string? Password)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(HostUrl) && !string.IsNullOrWhiteSpace(Username) && !string.IsNullOrWhiteSpace(Password);
}

public class HostCredentialsUpdateDto
{
    public string HostUrl { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class HostCredentialStatusDto
{
    public bool Configured { get; set; }
    public string HostUrl { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
}

public class HarborProjectDto
{
    public string Name { get; set; } = string.Empty;
    public int RepoCount { get; set; }
    public DateTime? CreatedAt { get; set; }
}

public class HarborProjectListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<HarborProjectDto> Projects { get; set; } = new();
}

public class HarborRepositoryDto
{
    public string Name { get; set; } = string.Empty;
    public int ArtifactCount { get; set; }
    public int PullCount { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class HarborRepositoryListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<HarborRepositoryDto> Repositories { get; set; } = new();
}

public class HarborArtifactDto
{
    public string Tag { get; set; } = string.Empty;
    public string? Digest { get; set; }
    public long? SizeBytes { get; set; }
    public DateTime? PushedAt { get; set; }
}

public class HarborArtifactListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<HarborArtifactDto> Images { get; set; } = new();
}

public class NexusRepositoryDto
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
}

public class NexusRepositoryListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<NexusRepositoryDto> Repositories { get; set; } = new();
}

public class NexusImageDto
{
    public string Name { get; set; } = string.Empty;
}

public class NexusImageListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<NexusImageDto> Images { get; set; } = new();
}

public class NexusTagDto
{
    public string Tag { get; set; } = string.Empty;
    public string? Digest { get; set; }
    public DateTime? PushedAt { get; set; }
}

public class NexusTagListDto
{
    public bool Configured { get; set; }
    public string? Error { get; set; }
    public List<NexusTagDto> Images { get; set; } = new();
}

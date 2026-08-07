namespace DeploymentAPI.DTOs;

// One portal visitor's own AWS credentials — session-scoped, same isolation
// model as UserGitHubCredentials (see PortalIdentity): never shared portal-
// wide, never tied to a GitHub login, kept only against this browser's
// session key.
public record UserAwsCredentials(string? AccessKeyId, string? SecretAccessKey, string? Region)
{
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(AccessKeyId) && !string.IsNullOrWhiteSpace(SecretAccessKey);
}

public class AwsCredentialsUpdateDto
{
    public string AccessKeyId { get; set; } = string.Empty;

    public string SecretAccessKey { get; set; } = string.Empty;

    public string Region { get; set; } = string.Empty;
}

public record UserAzureCredentials(string? TenantId, string? ClientId, string? ClientSecret)
{
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(TenantId)
        && !string.IsNullOrWhiteSpace(ClientId)
        && !string.IsNullOrWhiteSpace(ClientSecret);
}

public class AzureCredentialsUpdateDto
{
    public string TenantId { get; set; } = string.Empty;

    public string ClientId { get; set; } = string.Empty;

    public string ClientSecret { get; set; } = string.Empty;
}

// What the Environment detail view's cloud panel renders — deliberately
// loose/nullable across both providers rather than two separate response
// shapes, since the caller already knows which provider it asked about.
public class CloudStatusDto
{
    public bool Configured { get; set; }

    public bool Found { get; set; }

    public string? Error { get; set; }

    public string Provider { get; set; } = string.Empty;

    // ECS
    public string? EcsStatus { get; set; }

    public int? DesiredCount { get; set; }

    public int? RunningCount { get; set; }

    public string? TaskDefinition { get; set; }

    // ECR
    public List<EcrImageDto> EcrImages { get; set; } = new();

    // Azure Web App
    public string? AzureState { get; set; }

    public string? AzureDefaultHostname { get; set; }

    public DateTime? AzureLastModifiedUtc { get; set; }
}

public class EcrImageDto
{
    public string? Tag { get; set; }

    public DateTime? PushedAt { get; set; }

    public long SizeBytes { get; set; }
}

namespace DeploymentAPI.DTOs;

// One portal visitor's own AWS credentials — session-scoped, same isolation
// model as UserGitHubCredentials (see PortalIdentity): never shared portal-
// wide, never tied to a GitHub login, kept only against this browser's
// session key.
//
// AWS has no API for username/password sign-in — that only exists for the
// Console web UI. AccessKeyId/SecretAccessKey (the long-term IAM user key)
// are the real API-side equivalent of a "login." When an MFA device is
// enrolled (MfaSerialNumber set), that long-term key is used only to call
// STS GetSessionToken (see CloudStatusService.GetSessionTokenAsync) — the
// resulting temporary, MFA-verified SessionAccessKeyId/SessionSecretKey/
// SessionToken is what every actual ECS/ECR call uses, until ExpiresAtUtc
// passes and the visitor has to re-enter a fresh 6-digit code.
public record UserAwsCredentials(
    string? AccessKeyId,
    string? SecretAccessKey,
    string? Region,
    string? MfaSerialNumber,
    string? SessionAccessKeyId,
    string? SessionSecretAccessKey,
    string? SessionToken,
    DateTime? ExpiresAtUtc)
{
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(AccessKeyId) && !string.IsNullOrWhiteSpace(SecretAccessKey);

    public bool MfaEnrolled => !string.IsNullOrWhiteSpace(MfaSerialNumber);

    public bool HasValidSession =>
        !string.IsNullOrWhiteSpace(SessionToken) && ExpiresAtUtc is not null && ExpiresAtUtc > DateTime.UtcNow;

    // MFA enrolled but no live session — the visitor needs to re-enter a
    // fresh code before any AWS call can be made on their behalf.
    public bool RequiresMfaRefresh => MfaEnrolled && !HasValidSession;
}

public class AwsCredentialsUpdateDto
{
    public string AccessKeyId { get; set; } = string.Empty;

    public string SecretAccessKey { get; set; } = string.Empty;

    public string Region { get; set; } = string.Empty;

    // Optional — an IAM user with no MFA device enrolled leaves these blank
    // and authenticates with the access key alone, same as before.
    public string MfaSerialNumber { get; set; } = string.Empty;

    // The current 6-digit code from the MFA device/app — used once, right
    // now, to obtain a temporary session via STS. Never itself stored.
    public string MfaCode { get; set; } = string.Empty;
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

// Stored for future use — no feature in this portal reads GCP credentials
// yet (unlike AWS/Azure, which back the Environments cloud-status panel).
// A service account key (the JSON key file's raw contents) rather than a
// bare API key since that's what every GCP server-to-server API actually
// authenticates with.
public record UserGcpCredentials(string? ProjectId, string? ServiceAccountKeyJson)
{
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ProjectId) && !string.IsNullOrWhiteSpace(ServiceAccountKeyJson);
}

public class GcpCredentialsUpdateDto
{
    public string ProjectId { get; set; } = string.Empty;

    public string ServiceAccountKeyJson { get; set; } = string.Empty;
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

// The temporary credential set STS hands back for a successful MFA
// verification (CloudStatusService.GetSessionTokenAsync) — everything
// needed to make AWS calls as that session until it expires.
public record AwsSessionCredentials(string AccessKeyId, string SecretAccessKey, string SessionToken, DateTime ExpiresAtUtc);

// Result of attempting the MFA verification itself — kept separate from
// AwsSessionCredentials so a failure (wrong code, wrong serial, expired
// code) carries a message back to the caller instead of just null.
public class AwsMfaVerificationResult
{
    public bool Success { get; set; }

    public string? Error { get; set; }

    public AwsSessionCredentials? Session { get; set; }
}

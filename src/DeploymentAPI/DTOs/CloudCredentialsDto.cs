namespace DeploymentAPI.DTOs;

// One portal visitor's own AWS credentials — session-scoped, same isolation
// model as UserGitHubCredentials (see PortalIdentity): never shared portal-
// wide, never tied to a GitHub login, kept only against this browser's
// session key.
//
// AWS has no API for username/password sign-in — that only exists for the
// Console web UI (and, for organizations on IAM Identity Center, their own
// SSO login page). Two different paths lead here:
//
// 1. A plain IAM user's long-term AccessKeyId/SecretAccessKey, optionally
//    stepped up with MFA (MfaSerialNumber set) via STS GetSessionToken -
//    see CloudStatusService.GetSessionTokenAsync.
// 2. AWS SSO's device-authorization flow (see AwsSsoService) - the visitor
//    signs in on AWS's own real page (their actual username, password, and
//    MFA, entered on AWS's domain, never this app's), picks an account and
//    role, and this backend exchanges that for temporary credentials via
//    GetRoleCredentials. There's no long-term key in this path at all -
//    AccessKeyId/SecretAccessKey stay blank, only the session fields below
//    are set.
//
// Either way, SessionAccessKeyId/SessionSecretAccessKey/SessionToken is
// what every actual ECS/ECR call uses (see CloudStatusService.
// BuildCredentials) until ExpiresAtUtc passes.
public record UserAwsCredentials(
    string? AccessKeyId,
    string? SecretAccessKey,
    string? Region,
    string? MfaSerialNumber,
    string? SessionAccessKeyId,
    string? SessionSecretAccessKey,
    string? SessionToken,
    DateTime? ExpiresAtUtc,
    string? SsoAccountId,
    string? SsoAccountName,
    string? SsoRoleName)
{
    public bool HasLongTermKey =>
        !string.IsNullOrWhiteSpace(AccessKeyId) && !string.IsNullOrWhiteSpace(SecretAccessKey);

    public bool HasValidSession =>
        !string.IsNullOrWhiteSpace(SessionToken) && ExpiresAtUtc is not null && ExpiresAtUtc > DateTime.UtcNow;

    // A long-term key (MFA-optional path) counts even once its session has
    // lapsed, since RequiresMfaRefresh below tells the caller how to renew
    // it. A pure SSO session (no long-term key at all) only counts while
    // still valid - once it expires there's nothing left to fall back to
    // except signing in again from scratch.
    public bool IsConfigured => HasLongTermKey || HasValidSession;

    public bool MfaEnrolled => !string.IsNullOrWhiteSpace(MfaSerialNumber);

    // MFA enrolled but no live session — the visitor needs to re-enter a
    // fresh code before any AWS call can be made on their behalf.
    public bool RequiresMfaRefresh => MfaEnrolled && !HasValidSession;

    public bool IsSsoSession => !HasLongTermKey && !string.IsNullOrWhiteSpace(SsoAccountId);

    // A pure SSO session that's run out - the only way back is signing in
    // again, there's no key to silently refresh from.
    public bool RequiresSsoSignIn => !HasLongTermKey && !string.IsNullOrWhiteSpace(SessionToken) && !HasValidSession;
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

    // Render/Cloudflare/Netlify/Vercel — the matched service from this
    // visitor's own connected account (see EnvironmentsController.
    // GetCloudStatus), when Configured/Found are both true and a service
    // matching this environment's saved target id was located.
    public PaasServiceItemDto? PaasService { get; set; }

    // Metric series for that same matched service — always an empty list
    // (never null) for providers/services with nothing to show, per
    // PaasProviderService.GetServiceMetricsAsync's contract.
    public List<PaasMetricSeriesDto> Metrics { get; set; } = new();
}

public class EcrImageDto
{
    public string? Tag { get; set; }

    public DateTime? PushedAt { get; set; }

    public long SizeBytes { get; set; }
}

// One resource in an AwsServiceStatusDto's list — deliberately just two
// loose strings rather than a shape per AWS service, since Name/Detail
// already covers "instance name + type/state", "bucket name + created",
// "function name + runtime", etc. without six near-identical DTOs.
public class AwsResourceItemDto
{
    public string Name { get; set; } = string.Empty;

    public string? Detail { get; set; }
}

// One AWS service's slice of the Dashboard's "AWS Services" inventory —
// same Found/Error shape as CloudStatusDto, repeated per service instead
// of per environment, since one IAM user's permissions commonly cover some
// services and not others (e.g. no route53:ListHostedZones) and each
// service should fail independently rather than blanking the whole card.
public class AwsServiceStatusDto
{
    public bool Found { get; set; }

    public string? Error { get; set; }

    public int Count { get; set; }

    public List<AwsResourceItemDto> Items { get; set; } = new();
}

// The Dashboard's "AWS Services" container — a broader account-wide
// inventory across the services teams actually use day to day (EC2, ECR,
// VPC, S3, Lambda, Route 53, SNS), independent of the Environments
// feature's ECS/ECR panel, which only ever showed the one cluster/service/
// repository an environment happens to be wired to.
public class AwsResourceInventoryDto
{
    public bool Configured { get; set; }

    public string? Region { get; set; }

    public AwsServiceStatusDto Ec2 { get; set; } = new();

    public AwsServiceStatusDto Ecr { get; set; } = new();

    public AwsServiceStatusDto Vpc { get; set; } = new();

    public AwsServiceStatusDto S3 { get; set; } = new();

    public AwsServiceStatusDto Lambda { get; set; } = new();

    public AwsServiceStatusDto Route53 { get; set; } = new();

    public AwsServiceStatusDto Sns { get; set; } = new();

    // Everything else this access key can see in the region, discovered
    // dynamically via the Resource Groups Tagging API rather than one
    // hand-written SDK call per AWS service (there are ~300 of those) -
    // RDS, DynamoDB, SQS, CloudFront, whatever else the account actually
    // uses. One dynamic tile per AWS service namespace found.
    public List<AwsServiceGroupDto> Other { get; set; } = new();

    // Set only if the broader tagging-API scan itself failed (e.g. no
    // tag:GetResources permission) - the six/seven dedicated tiles above
    // are unaffected either way, since each already fails independently.
    public string? OtherError { get; set; }
}

// One dynamically-discovered AWS service's slice of "Other" above - same
// shape as AwsServiceStatusDto's count/items, plus the service's own key
// (the ARN service namespace, e.g. "dynamodb") and a human label.
public class AwsServiceGroupDto
{
    public string Key { get; set; } = string.Empty;

    public string Label { get; set; } = string.Empty;

    public int Count { get; set; }

    public List<AwsResourceItemDto> Items { get; set; } = new();
}

// The Cloud Services page's EC2 detail view - unlike the Dashboard's EC2
// tile (deliberately running-only, see DescribeEc2InstancesAsync), this
// shows both running AND stopped so "how many are running vs stopped"
// is answerable from the click-through detail, not just "what's live".
public class AwsEc2DetailDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public int RunningCount { get; set; }

    public int StoppedCount { get; set; }

    public List<AwsEc2InstanceDto> Instances { get; set; } = new();
}

public class AwsEc2InstanceDto
{
    public string Name { get; set; } = string.Empty;

    public string InstanceId { get; set; } = string.Empty;

    public string InstanceType { get; set; } = string.Empty;

    public string State { get; set; } = string.Empty;

    public string? PrivateIp { get; set; }

    public string? PublicIp { get; set; }

    public string? AvailabilityZone { get; set; }

    public DateTime? LaunchTime { get; set; }
}

// The Cloud Services page's ECS detail view - every cluster this access
// key can see, and every service within each, with running/desired task
// counts - answers "how many services in ECS, and which are stopped in
// this cluster" at a glance, which the account-wide inventory's generic
// Tagging API scan (see AwsResourceInventoryDto.Other) can't - task
// counts aren't something a tag scan exposes, only a real ECS API call.
public class AwsEcsDetailDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<AwsEcsClusterDto> Clusters { get; set; } = new();
}

public class AwsEcsClusterDto
{
    public string ClusterName { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public List<AwsEcsServiceDto> Services { get; set; } = new();
}

public class AwsEcsServiceDto
{
    public string ServiceName { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public int RunningCount { get; set; }

    public int DesiredCount { get; set; }

    public int PendingCount { get; set; }

    public string? TaskDefinition { get; set; }

    public string? DeploymentStatus { get; set; }
}

// The result of a mutating Cloud Services action (EC2 start/stop/reboot/
// terminate, ECS scale, ECR create/delete) - AWS accepted the request or
// it didn't. Never claims a final resource state itself (see section 25
// of the request this came from: "Running -> Stopped" only ever comes
// from a real follow-up AWS read, not from assuming the action worked) -
// the frontend re-fetches the resource list after a successful action
// rather than trusting this response to describe the new state.
public class CloudServiceActionResultDto
{
    public bool Success { get; set; }

    public string? Error { get; set; }

    public string? Message { get; set; }
}

public class AwsEcrRepositoryDto
{
    public string Name { get; set; } = string.Empty;

    public string Uri { get; set; } = string.Empty;

    public int ImageCount { get; set; }

    public DateTime? LatestPushedAt { get; set; }

    public DateTime? CreatedAt { get; set; }
}

public class AwsEcrRepositoryListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<AwsEcrRepositoryDto> Repositories { get; set; } = new();
}

public class AwsEcrImageDto
{
    public string Tag { get; set; } = string.Empty;

    public string Digest { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    public DateTime? PushedAt { get; set; }
}

public class AwsEcrImageListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<AwsEcrImageDto> Images { get; set; } = new();
}

public class AwsLambdaFunctionDto
{
    public string Name { get; set; } = string.Empty;

    public string Runtime { get; set; } = string.Empty;

    public string Architecture { get; set; } = string.Empty;

    public int MemorySize { get; set; }

    public int Timeout { get; set; }

    public DateTime? LastModified { get; set; }
}

public class AwsLambdaFunctionListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<AwsLambdaFunctionDto> Functions { get; set; } = new();
}

public class AwsRdsInstanceDto
{
    public string Identifier { get; set; } = string.Empty;

    public string Engine { get; set; } = string.Empty;

    public string EngineVersion { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public string InstanceClass { get; set; } = string.Empty;

    public int StorageGb { get; set; }

    public string? AvailabilityZone { get; set; }
}

public class AwsRdsInstanceListDto
{
    public bool Configured { get; set; }

    public string? Error { get; set; }

    public List<AwsRdsInstanceDto> Instances { get; set; } = new();
}

// The temporary credential set STS (MFA path) or AWS SSO's
// GetRoleCredentials (SSO path) hands back — everything needed to make AWS
// calls as that session until it expires. The Sso* fields are only set by
// the SSO path, purely for display (which account/role you're signed in
// as) - they don't affect how the credentials are used.
public record AwsSessionCredentials(
    string AccessKeyId,
    string SecretAccessKey,
    string SessionToken,
    DateTime ExpiresAtUtc,
    string? SsoAccountId = null,
    string? SsoAccountName = null,
    string? SsoRoleName = null);

// Result of attempting the MFA verification itself — kept separate from
// AwsSessionCredentials so a failure (wrong code, wrong serial, expired
// code) carries a message back to the caller instead of just null.
public class AwsMfaVerificationResult
{
    public bool Success { get; set; }

    public string? Error { get; set; }

    public AwsSessionCredentials? Session { get; set; }
}

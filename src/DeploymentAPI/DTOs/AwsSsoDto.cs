namespace DeploymentAPI.DTOs;

public class AwsSsoStartRequestDto
{
    // e.g. "https://d-90661fb14c.awsapps.com/start" - the same URL your
    // company's AWS sign-in page already redirects you to when your
    // session expires.
    public string StartUrl { get; set; } = string.Empty;

    // The AWS region IAM Identity Center is set up in for this
    // organization - usually us-east-1, but not always.
    public string SsoRegion { get; set; } = "us-east-1";
}

// What the frontend needs to open the real AWS sign-in page and then poll
// this backend until the visitor has approved it there.
public class AwsSsoStartResponseDto
{
    public string PendingId { get; set; } = string.Empty;

    public string VerificationUriComplete { get; set; } = string.Empty;

    public string UserCode { get; set; } = string.Empty;

    public int IntervalSeconds { get; set; }

    public int ExpiresInSeconds { get; set; }
}

public class AwsSsoPollResponseDto
{
    // "pending" | "success" | "denied" | "expired" | "error"
    public string Status { get; set; } = string.Empty;

    public string? Error { get; set; }
}

public class AwsSsoAccountRolesDto
{
    public string AccountId { get; set; } = string.Empty;

    public string AccountName { get; set; } = string.Empty;

    public string EmailAddress { get; set; } = string.Empty;

    public List<string> Roles { get; set; } = new();
}

public class AwsSsoSelectRequestDto
{
    public string PendingId { get; set; } = string.Empty;

    public string AccountId { get; set; } = string.Empty;

    public string RoleName { get; set; } = string.Empty;

    public string Region { get; set; } = string.Empty;
}

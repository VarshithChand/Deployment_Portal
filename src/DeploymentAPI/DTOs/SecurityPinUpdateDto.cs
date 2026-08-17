namespace DeploymentAPI.DTOs;

public class SecurityPinUpdateDto
{
    public string Pin { get; set; } = string.Empty;

    // Only actually required when this session's GitHub identity has MFA
    // enabled (see MfaGate.DenyUnlessCodeVerifiedAsync). No recovery-code
    // field on this form by design - see SecurityPinSection.jsx.
    public string? Code { get; set; }
}

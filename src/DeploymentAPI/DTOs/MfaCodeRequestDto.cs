namespace DeploymentAPI.DTOs;

// Shared request shape for the two self-service MfaController actions
// that need a code to proceed (enroll/verify, disable) - RecoveryCode is
// only ever meaningful for Disable (a "lost my phone" fallback);
// enrollment verification always needs a live 6-digit code since a
// recovery code can't exist yet.
public class MfaCodeRequestDto
{
    public string? Code { get; set; }

    public string? RecoveryCode { get; set; }
}

public class MfaNotificationEmailRequestDto
{
    public string? Email { get; set; }
}

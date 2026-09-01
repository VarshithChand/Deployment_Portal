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

    // True when Code is an emailed OTP (see AccountAuthController's
    // login-mfa/send-otp) rather than a TOTP code from the authenticator
    // app - both are 6 digits, so the caller has to say which kind this
    // is; verifying an email OTP against the TOTP algorithm (or vice
    // versa) would just always fail.
    public bool IsEmailOtp { get; set; }
}

public class MfaNotificationEmailRequestDto
{
    public string? Email { get; set; }
}

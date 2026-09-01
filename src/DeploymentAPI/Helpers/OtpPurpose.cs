namespace DeploymentAPI.Helpers;

// Shared between SettingsService (storage), AccountAuthService/MfaController
// (issuing + verifying), and AccountAuthController (wiring up the actual
// HTTP endpoints) - a single source for these two strings so a typo in one
// spot can't silently create a third, never-matched "purpose".
public static class OtpPurpose
{
    public const string Mfa = "MFA";
    public const string PasswordReset = "PASSWORD_RESET";
}

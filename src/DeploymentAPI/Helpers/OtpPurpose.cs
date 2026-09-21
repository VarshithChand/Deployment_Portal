namespace DeploymentAPI.Helpers;

// Shared between SettingsService (storage), AccountAuthService/MfaController
// (issuing + verifying), and AccountAuthController (wiring up the actual
// HTTP endpoints) - a single source for these two strings so a typo in one
// spot can't silently create a third, never-matched "purpose".
public static class OtpPurpose
{
    public const string Mfa = "MFA";
    public const string PasswordReset = "PASSWORD_RESET";

    // Gates Settings > Admin Access > Backup & Restore's "Export Backup" -
    // that file carries every credential in the portal (plus the
    // encryption keys that unlock them), so downloading it needs the same
    // "prove it's really you, right now" step MFA/password-reset already
    // require, not just the standing super-admin session.
    public const string BackupExport = "BACKUP_EXPORT";
}

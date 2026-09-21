namespace DeploymentAPI.DTOs;

// A full export of this portal's own persisted state - everything
// SettingsService keeps in portal_settings (still Data-Protection-
// encrypted at the field level, exactly as it sits at rest - this
// endpoint never decrypts anything) plus the Data Protection key ring
// that's the only thing able to decrypt it (see PostgresXmlRepository).
// Exporting the settings JSON without the matching keys would make
// every credential inside it permanently unreadable the moment it's
// restored into a database with a different (freshly-generated) key
// ring - both halves have to travel together.
//
// Settings is a raw JSON string, not a Newtonsoft JObject - this DTO
// travels through ASP.NET Core's default controller pipeline, which
// serializes with System.Text.Json (no AddNewtonsoftJson() configured
// anywhere in this project - see Program.cs's plain AddControllers()).
// System.Text.Json has no idea how to serialize/deserialize a
// Newtonsoft JObject correctly - deserializing a POST body into one
// threw during model binding, before the controller action's own
// try/catch ever ran, which is what actually produced the generic
// "Unable to complete the requested operation" 500 on Import. A plain
// string round-trips correctly regardless of which JSON library is on
// either end - SettingsService does its own JObject.Parse/.ToString()
// at the boundary instead.
public class PortalBackupDto
{
    public DateTime ExportedAtUtc { get; set; }

    public string? Settings { get; set; }

    public List<string> DataProtectionKeyXmls { get; set; } = new();
}

// Backup & Restore's "Export Backup" now requires an emailed OTP first
// (OtpPurpose.BackupExport) - that file carries every credential in the
// portal, so downloading it needs the same "prove it's really you, right
// now" step MFA/password-reset already require.
public class ExportBackupRequestDto
{
    public string? Otp { get; set; }
}

// "Delete All Data" - ConfirmPhrase is checked server-side too (not just
// the frontend's typed-confirmation UI, which is a nicety, not a real
// gate on its own) since this is the most destructive action in the
// entire portal.
public class WipeDatabaseRequestDto
{
    public string? ConfirmPhrase { get; set; }
}

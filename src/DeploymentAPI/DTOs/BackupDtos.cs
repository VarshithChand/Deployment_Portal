using Newtonsoft.Json.Linq;

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
public class PortalBackupDto
{
    public DateTime ExportedAtUtc { get; set; }

    public JObject? Settings { get; set; }

    public List<string> DataProtectionKeyXmls { get; set; } = new();
}

namespace DeploymentAPI.DTOs;

// The raw key is never stored — only its SHA-256 hash, plus a short
// prefix safe to display so someone can tell keys apart in a list. This
// mirrors how GitHub/Stripe-style tokens actually work: shown once at
// creation, unrecoverable after that.
public class ApiKey
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Prefix { get; set; } = string.Empty;

    public string HashedKey { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool Revoked { get; set; }

    // The PortalIdentity session key of whoever created this key - resolved
    // to a friendly GitHub login for display (see
    // SecurityApiKeysController.GetAll), same as the Users tab's PAT owners.
    public string OwnerKey { get; set; } = string.Empty;
}

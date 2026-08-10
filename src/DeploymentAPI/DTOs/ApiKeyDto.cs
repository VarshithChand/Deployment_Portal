namespace DeploymentAPI.DTOs;

// What GET endpoints return — never the hash, never the raw key.
public class ApiKeyDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Prefix { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public bool Revoked { get; set; }

    // The creating session's PortalIdentity key - carried through purely
    // so SecurityApiKeysController.GetAll can resolve OwnerLogin from it
    // after the fact (ApiKeyStore itself has no way to look up a GitHub
    // identity). Harmless to leave in the response; same sensitivity
    // level as PatUserSummaryDto's own Key field.
    public string OwnerKey { get; set; } = string.Empty;

    // Resolved from OwnerKey above - the same live GitHub-identity lookup
    // the Users tab's PatOwnerLogin already uses. "Unknown owner" covers a
    // key created before its creator ever configured a GitHub token, or
    // whose token has since been removed - the key itself still works
    // either way.
    public string OwnerLogin { get; set; } = "Unknown owner";
}

// What POST /api/security/api-keys returns once — the only time the raw
// key is ever available, same as GitHub/Stripe-style token creation.
public class CreatedApiKeyDto : ApiKeyDto
{
    public string Key { get; set; } = string.Empty;
}

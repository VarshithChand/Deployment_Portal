namespace DeploymentAPI.DTOs;

// What GET endpoints return — never the hash, never the raw key.
public class ApiKeyDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Prefix { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public bool Revoked { get; set; }

    // Resolved server-side from the key's OwnerKey (the creating session's
    // PortalIdentity key - see SecurityApiKeysController.ToDto) - that raw
    // value is deliberately NOT exposed on this DTO. It's the same literal
    // bearer value that determines whose saved GitHub PAT a request uses
    // (see PortalIdentity.GetOrCreateKey/PatUserSummaryDto.Key), so an
    // admin viewing this list could otherwise replay it as their own
    // X-Session-Id and silently act as whoever created that key. Never
    // read by the frontend (confirmed via grep) - OwnerLogin is all the
    // Security tab actually needs to show. "Unknown owner" covers a key
    // created before its creator ever configured a GitHub token, or whose
    // token has since been removed - the key itself still works either way.
    public string OwnerLogin { get; set; } = "Unknown owner";
}

// What POST /api/security/api-keys returns once — the only time the raw
// key is ever available, same as GitHub/Stripe-style token creation.
public class CreatedApiKeyDto : ApiKeyDto
{
    public string Key { get; set; } = string.Empty;
}

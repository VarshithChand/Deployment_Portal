namespace DeploymentAPI.DTOs;

// What GET endpoints return — never the hash, never the raw key.
public class ApiKeyDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Prefix { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public bool Revoked { get; set; }
}

// What POST /api/security/api-keys returns once — the only time the raw
// key is ever available, same as GitHub/Stripe-style token creation.
public class CreatedApiKeyDto : ApiKeyDto
{
    public string Key { get; set; } = string.Empty;
}

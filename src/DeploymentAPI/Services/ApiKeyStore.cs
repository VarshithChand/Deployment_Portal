using System.Security.Cryptography;
using System.Text;

using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Backs the Services page's "Security (SecurityAPI)" tab's API Keys
// panel — see UserStore for why this lives here instead of a separately-
// hosted origin.
public class ApiKeyStore
{
    private readonly object _lock = new();
    private readonly List<ApiKey> _keys = new();
    private int _nextId = 1;

    public List<ApiKeyDto> GetAll()
    {
        lock (_lock)
        {
            return _keys.OrderBy(k => k.Id).Select(ToDto).ToList();
        }
    }

    // Generates a cryptographically random key (RandomNumberGenerator, not
    // Random), returns it exactly once, and stores only its SHA-256 hash
    // plus a short prefix — the raw key can't be recovered after this call.
    // ownerKey is the creating session's PortalIdentity key (see
    // SecurityApiKeysController.Create), resolved to a friendly GitHub
    // login for display whenever this list is read back.
    public CreatedApiKeyDto Create(CreateApiKeyRequest request, string ownerKey)
    {
        var rawKey = "sk_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawKey))).ToLowerInvariant();

        lock (_lock)
        {
            var key = new ApiKey
            {
                Id = _nextId++,
                Name = string.IsNullOrWhiteSpace(request.Name) ? "Unnamed key" : request.Name,
                Prefix = rawKey[..11], // "sk_" + 8 hex chars — enough to tell keys apart
                HashedKey = hash,
                CreatedAt = DateTime.UtcNow,
                Revoked = false,
                OwnerKey = ownerKey
            };

            _keys.Add(key);

            var dto = ToDto(key);
            return new CreatedApiKeyDto
            {
                Id = dto.Id,
                Name = dto.Name,
                Prefix = dto.Prefix,
                CreatedAt = dto.CreatedAt,
                Revoked = dto.Revoked,
                OwnerKey = dto.OwnerKey,
                Key = rawKey
            };
        }
    }

    public bool Revoke(int id)
    {
        lock (_lock)
        {
            var key = _keys.FirstOrDefault(k => k.Id == id);
            if (key is null) return false;

            key.Revoked = true;
            return true;
        }
    }

    // Would be how an incoming request's key gets checked against what's
    // stored — hash the presented key and compare, never the raw values.
    public bool IsValid(string presentedKey)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(presentedKey))).ToLowerInvariant();

        lock (_lock)
        {
            return _keys.Any(k => !k.Revoked && k.HashedKey == hash);
        }
    }

    // OwnerLogin isn't filled in here - ApiKeyStore has no way to resolve a
    // session key to a GitHub identity itself (that needs SettingsService).
    // SecurityApiKeysController.GetAll does that resolution afterward,
    // using ApiKeyDto's own OwnerKey field as the lookup key.
    private static ApiKeyDto ToDto(ApiKey key) => new()
    {
        Id = key.Id,
        Name = key.Name,
        Prefix = key.Prefix,
        CreatedAt = key.CreatedAt,
        Revoked = key.Revoked,
        OwnerKey = key.OwnerKey
    };
}

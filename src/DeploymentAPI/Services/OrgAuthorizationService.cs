using Npgsql;

namespace DeploymentAPI.Services;

// Resolves a caller's effective permission set inside one organization -
// role-granted permissions, minus member_permissions "deny" overrides,
// plus "grant" overrides. Scoped (AddScoped, one instance per request),
// which is what makes the private cache below safe: it's per-request
// memoization only, never cross-request - resolving fresh from the DB on
// every request (no JWT-baked role, no IMemoryCache) is exactly what lets
// a role change take effect on the very next request instead of waiting
// for a session to expire (see the plan's "no stale sessions" decision).
public class OrgAuthorizationService
{
    private readonly SettingsService _settings;
    private readonly Dictionary<Guid, HashSet<string>> _cache = new();

    public OrgAuthorizationService(SettingsService settings)
    {
        _settings = settings;
    }

    public async Task<HashSet<string>> ResolveAsync(string userId, Guid organizationId)
    {
        if (_cache.TryGetValue(organizationId, out var cached))
            return cached;

        var connectionString = _settings.GetDatabaseConnectionString()
            ?? throw new InvalidOperationException("Organizations require DATABASE_URL to be configured.");

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        var granted = new HashSet<string>(StringComparer.Ordinal);

        Guid? membershipId = null;

        await using (var command = new NpgsqlCommand(
            "SELECT om.id, p.key " +
            "FROM organization_members om " +
            "JOIN role_permissions rp ON rp.role_id = om.role_id " +
            "JOIN permissions p ON p.id = rp.permission_id " +
            "WHERE om.organization_id = @orgId AND om.user_id = @userId AND om.status = 'active'",
            connection))
        {
            command.Parameters.AddWithValue("orgId", organizationId);
            command.Parameters.AddWithValue("userId", userId);

            await using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                membershipId ??= reader.GetGuid(0);
                granted.Add(reader.GetString(1));
            }
        }

        if (membershipId != null)
        {
            await using var overridesCommand = new NpgsqlCommand(
                "SELECT p.key, mp.effect FROM member_permissions mp " +
                "JOIN permissions p ON p.id = mp.permission_id " +
                "WHERE mp.organization_member_id = @membershipId",
                connection);

            overridesCommand.Parameters.AddWithValue("membershipId", membershipId.Value);

            await using var reader = await overridesCommand.ExecuteReaderAsync();

            var overrides = new List<(string Key, string Effect)>();

            while (await reader.ReadAsync())
                overrides.Add((reader.GetString(0), reader.GetString(1)));

            ApplyOverrides(granted, overrides);
        }

        _cache[organizationId] = granted;
        return granted;
    }

    // Pure - no DB/HTTP dependency, extracted specifically so the actual
    // grant/deny resolution rule is unit-testable without a live Postgres
    // instance (see the "Organizations, Roles & Permissions" plan's
    // testing section, which flagged this exact gap: this codebase's usual
    // inline-NpgsqlConnection style isn't mockable, so the decision logic
    // needs to live somewhere that doesn't touch a connection at all).
    // Mutates `granted` in place. Deny is applied before grant - a per-user
    // grant override always wins even if a deny row for the same
    // permission exists (shouldn't happen given the unique constraint on
    // (organization_member_id, permission_id), but this ordering keeps the
    // resolution unambiguous either way).
    internal static void ApplyOverrides(HashSet<string> granted, IEnumerable<(string Key, string Effect)> overrides)
    {
        var materialized = overrides as IList<(string Key, string Effect)> ?? overrides.ToList();

        foreach (var (key, effect) in materialized)
        {
            if (effect == "deny")
                granted.Remove(key);
        }

        foreach (var (key, effect) in materialized)
        {
            if (effect != "deny")
                granted.Add(key);
        }
    }
}

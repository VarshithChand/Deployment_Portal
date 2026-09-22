using System.Text.RegularExpressions;
using DeploymentAPI.DTOs;
using Npgsql;

namespace DeploymentAPI.Services;

// Organization CRUD + the Personal-org migration hook. Sibling to
// MembershipService/OrgAuthorizationService - see MembershipService's own
// header comment for why this doesn't route through SettingsService's
// JSON blob.
public class OrganizationService
{
    private readonly SettingsService _settings;

    public OrganizationService(SettingsService settings)
    {
        _settings = settings;
    }

    private string? ConnectionString => _settings.GetDatabaseConnectionString();

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connectionString = ConnectionString
            ?? throw new InvalidOperationException("Organizations require DATABASE_URL to be configured.");

        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        return connection;
    }

    // Called from the login-success paths (AccountAuthController.
    // IssueSessionAsync, Helpers/OAuthLoginFinisher.FinishAsync) - the
    // same places session/login-history recording already happens. A
    // no-op (organizations disabled) when there's no DATABASE_URL, so
    // login keeps working exactly as today for a JSON-file-only deployment.
    // Idempotent via the partial unique index on organizations
    // (owner_user_id) WHERE account_type='personal' - ON CONFLICT DO
    // NOTHING makes a double-login race harmless rather than a duplicate
    // row, so this can run unconditionally on every login with no prior
    // existence check needed.
    public async Task EnsureOwnsPersonalOrganizationAsync(string userId, string? displayName)
    {
        if (ConnectionString == null)
            return;

        await using var connection = await OpenAsync();

        var adminRoleId = await GetSystemRoleIdAsync(connection, "admin");

        if (adminRoleId == null)
            return; // Schema not seeded yet (shouldn't happen once Program.cs's startup hook has run) - fail soft.

        var orgId = Guid.NewGuid();
        var name = string.IsNullOrWhiteSpace(displayName) ? "Personal" : displayName!;

        await using (var command = new NpgsqlCommand(
            "INSERT INTO organizations (id, name, slug, description, account_type, owner_user_id) " +
            "VALUES (@id, @name, @slug, NULL, 'personal', @ownerUserId) " +
            "ON CONFLICT (owner_user_id) WHERE account_type = 'personal' DO NOTHING " +
            "RETURNING id",
            connection))
        {
            command.Parameters.AddWithValue("id", orgId);
            command.Parameters.AddWithValue("name", name);
            command.Parameters.AddWithValue("slug", $"personal-{orgId:N}");
            command.Parameters.AddWithValue("ownerUserId", userId);

            var insertedId = await command.ExecuteScalarAsync();

            if (insertedId == null)
                return; // Already existed - nothing else to do.
        }

        await using var membershipCommand = new NpgsqlCommand(
            "INSERT INTO organization_members (id, organization_id, user_id, role_id, status) " +
            "VALUES (@id, @orgId, @userId, @roleId, 'active')",
            connection);

        membershipCommand.Parameters.AddWithValue("id", Guid.NewGuid());
        membershipCommand.Parameters.AddWithValue("orgId", orgId);
        membershipCommand.Parameters.AddWithValue("userId", userId);
        membershipCommand.Parameters.AddWithValue("roleId", adminRoleId.Value);

        await membershipCommand.ExecuteNonQueryAsync();
    }

    public async Task<(bool Success, string? Error, OrganizationDto? Organization)> CreateOrganizationAsync(
        string userId, string? name, string? slug, string? description)
    {
        if (string.IsNullOrWhiteSpace(name))
            return (false, "Organization name is required.", null);

        await using var connection = await OpenAsync();

        var adminRoleId = await GetSystemRoleIdAsync(connection, "admin");

        if (adminRoleId == null)
            return (false, "Organizations aren't fully set up yet - try again in a moment.", null);

        var resolvedSlug = await GenerateUniqueSlugAsync(connection, slug ?? name);
        var orgId = Guid.NewGuid();

        await using (var command = new NpgsqlCommand(
            "INSERT INTO organizations (id, name, slug, description, account_type, owner_user_id) " +
            "VALUES (@id, @name, @slug, @description, 'organization', @ownerUserId)",
            connection))
        {
            command.Parameters.AddWithValue("id", orgId);
            command.Parameters.AddWithValue("name", name.Trim());
            command.Parameters.AddWithValue("slug", resolvedSlug);
            command.Parameters.AddWithValue("description", (object?)description?.Trim() ?? DBNull.Value);
            command.Parameters.AddWithValue("ownerUserId", userId);

            await command.ExecuteNonQueryAsync();
        }

        await using (var command = new NpgsqlCommand(
            "INSERT INTO organization_members (id, organization_id, user_id, role_id, status) " +
            "VALUES (@id, @orgId, @userId, @roleId, 'active')",
            connection))
        {
            command.Parameters.AddWithValue("id", Guid.NewGuid());
            command.Parameters.AddWithValue("orgId", orgId);
            command.Parameters.AddWithValue("userId", userId);
            command.Parameters.AddWithValue("roleId", adminRoleId.Value);

            await command.ExecuteNonQueryAsync();
        }

        return (true, null, new OrganizationDto
        {
            Id = orgId,
            Name = name.Trim(),
            Slug = resolvedSlug,
            Description = description?.Trim(),
            AccountType = "organization",
            RoleKey = "admin",
            RoleDisplayName = "Admin",
            CreatedAtUtc = DateTime.UtcNow
        });
    }

    public async Task<List<OrganizationDto>> GetMyOrganizationsAsync(string userId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT o.id, o.name, o.slug, o.description, o.account_type, o.created_at_utc, r.key, r.display_name " +
            "FROM organization_members om " +
            "JOIN organizations o ON o.id = om.organization_id " +
            "JOIN roles r ON r.id = om.role_id " +
            "WHERE om.user_id = @userId AND om.status = 'active' AND o.deleted_at_utc IS NULL " +
            "ORDER BY (o.account_type = 'personal') DESC, o.created_at_utc",
            connection);

        command.Parameters.AddWithValue("userId", userId);

        var results = new List<OrganizationDto>();

        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            results.Add(new OrganizationDto
            {
                Id = reader.GetGuid(0),
                Name = reader.GetString(1),
                Slug = reader.GetString(2),
                Description = reader.IsDBNull(3) ? null : reader.GetString(3),
                AccountType = reader.GetString(4),
                CreatedAtUtc = reader.GetDateTime(5),
                RoleKey = reader.GetString(6),
                RoleDisplayName = reader.GetString(7)
            });
        }

        return results;
    }

    public async Task<bool> UpdateOrganizationAsync(Guid organizationId, string? name, string? description)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "UPDATE organizations SET " +
            "name = COALESCE(NULLIF(@name, ''), name), " +
            "description = CASE WHEN @descriptionProvided THEN @description ELSE description END " +
            "WHERE id = @id AND deleted_at_utc IS NULL",
            connection);

        command.Parameters.AddWithValue("id", organizationId);
        command.Parameters.AddWithValue("name", name?.Trim() ?? string.Empty);
        command.Parameters.AddWithValue("descriptionProvided", description != null);
        command.Parameters.AddWithValue("description", (object?)description?.Trim() ?? DBNull.Value);

        var rows = await command.ExecuteNonQueryAsync();
        return rows > 0;
    }

    public async Task<OrganizationDto?> GetOrganizationAsync(Guid organizationId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT id, name, slug, description, account_type, created_at_utc " +
            "FROM organizations WHERE id = @id AND deleted_at_utc IS NULL",
            connection);

        command.Parameters.AddWithValue("id", organizationId);

        await using var reader = await command.ExecuteReaderAsync();

        if (!await reader.ReadAsync())
            return null;

        return new OrganizationDto
        {
            Id = reader.GetGuid(0),
            Name = reader.GetString(1),
            Slug = reader.GetString(2),
            Description = reader.IsDBNull(3) ? null : reader.GetString(3),
            AccountType = reader.GetString(4),
            CreatedAtUtc = reader.GetDateTime(5)
        };
    }

    // The fixed system role -> permission-keys matrix (identical for every
    // organization, since only system roles exist today - see
    // OrganizationSchema's own comment on why custom per-org roles are out
    // of scope). Powers the read-only Roles & Permissions display - no
    // membership/org-id needed to view this, it describes the roles
    // themselves, not any particular org's data.
    public async Task<List<(string RoleKey, string RoleDisplayName, List<string> PermissionKeys)>> GetRolePermissionMatrixAsync()
    {
        await using var connection = await OpenAsync();

        var roles = new List<(Guid Id, string Key, string DisplayName)>();

        await using (var command = new NpgsqlCommand(
            "SELECT id, key, display_name FROM roles WHERE organization_id IS NULL ORDER BY " +
            "CASE key WHEN 'admin' THEN 0 WHEN 'contributor' THEN 1 ELSE 2 END",
            connection))
        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
                roles.Add((reader.GetGuid(0), reader.GetString(1), reader.GetString(2)));
        }

        var result = new List<(string, string, List<string>)>();

        foreach (var role in roles)
        {
            var permissionKeys = new List<string>();

            await using var command = new NpgsqlCommand(
                "SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id " +
                "WHERE rp.role_id = @roleId ORDER BY p.key",
                connection);
            command.Parameters.AddWithValue("roleId", role.Id);

            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
                permissionKeys.Add(reader.GetString(0));

            result.Add((role.Key, role.DisplayName, permissionKeys));
        }

        return result;
    }

    private static async Task<Guid?> GetSystemRoleIdAsync(NpgsqlConnection connection, string key)
    {
        await using var command = new NpgsqlCommand(
            "SELECT id FROM roles WHERE key = @key AND organization_id IS NULL", connection);
        command.Parameters.AddWithValue("key", key);

        var result = await command.ExecuteScalarAsync();
        return result == null ? null : (Guid)result;
    }

    private static readonly Regex SlugCleanupRegex = new("[^a-z0-9-]", RegexOptions.Compiled);

    // Pure - no DB dependency, extracted specifically so the actual
    // slugification rule is unit-testable in isolation (see
    // OrgAuthorizationService.ApplyOverrides' identical reasoning). Never
    // returns empty - falls back to "org" for input that slugifies away to
    // nothing (e.g. all-punctuation names).
    internal static string SlugifyBase(string source)
    {
        var baseSlug = SlugCleanupRegex.Replace(source.Trim().ToLowerInvariant().Replace(' ', '-'), "");
        baseSlug = baseSlug.Trim('-');

        if (string.IsNullOrWhiteSpace(baseSlug))
            baseSlug = "org";

        if (baseSlug.Length > 50)
            baseSlug = baseSlug[..50].Trim('-');

        return string.IsNullOrWhiteSpace(baseSlug) ? "org" : baseSlug;
    }

    // Slugifies the input, then appends a short random suffix on collision
    // (same "base, then -suffix on collision" shape AccountAuthService.
    // DeriveUniqueUsernameAsync already uses for usernames) - never fails
    // outright the way that method can fall back to "no username", since a
    // slug is required here.
    private static async Task<string> GenerateUniqueSlugAsync(NpgsqlConnection connection, string source)
    {
        var baseSlug = SlugifyBase(source);

        var candidate = baseSlug;
        var attempt = 0;

        while (await SlugExistsAsync(connection, candidate))
        {
            attempt++;
            candidate = $"{baseSlug}-{Convert.ToHexString(Guid.NewGuid().ToByteArray())[..6].ToLowerInvariant()}";

            if (attempt > 5)
                break;
        }

        return candidate;
    }

    private static async Task<bool> SlugExistsAsync(NpgsqlConnection connection, string slug)
    {
        await using var command = new NpgsqlCommand("SELECT 1 FROM organizations WHERE slug = @slug", connection);
        command.Parameters.AddWithValue("slug", slug);

        return await command.ExecuteScalarAsync() != null;
    }
}

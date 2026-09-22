using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

namespace DeploymentAPI.Services;

// Persisted, queryable audit trail for organization-scoped security-
// sensitive actions - the audit_logs table, NOT the existing in-memory
// Services/ActivityLogService.cs (a capped 200-entry LinkedList, explicitly
// documented there as "not an audit trail that needs to survive a
// restart" - that one stays exactly as-is for its own unrelated portal-
// wide activity feed; the two are deliberately separate, not merged).
//
// metadata is arbitrary, NON-SECRET context (e.g. {"name":"Production
// AWS","provider":"aws"} for a credential creation) - callers must never
// pass a decrypted secret value here, same rule SettingsService's own
// logging already follows everywhere else in this app.
public class AuditLogService
{
    private readonly SettingsService _settings;

    public AuditLogService(SettingsService settings)
    {
        _settings = settings;
    }

    // Silently no-ops when organizations aren't enabled (no DATABASE_URL) -
    // every call site already only runs from an organization-scoped action
    // that's itself unreachable in that case (see OrganizationsController's
    // own DenyIfOrganizationsDisabled), but this stays defensive rather
    // than assuming, and specifically never throws: a logging failure must
    // never turn an otherwise-successful action (inviting a member,
    // saving a credential) into an error response.
    public async Task LogAsync(
        Guid? organizationId, string actorUserId, string action,
        string? targetType = null, string? targetId = null, object? metadata = null, string? ipAddress = null)
    {
        var connectionString = _settings.GetDatabaseConnectionString();

        if (connectionString == null)
            return;

        try
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();

            await using var command = new NpgsqlCommand(
                "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, target_type, target_id, metadata_json, ip_address) " +
                "VALUES (@id, @orgId, @actorUserId, @action, @targetType, @targetId, @metadata, @ipAddress)",
                connection);

            command.Parameters.AddWithValue("id", Guid.NewGuid());
            command.Parameters.AddWithValue("orgId", (object?)organizationId ?? DBNull.Value);
            command.Parameters.AddWithValue("actorUserId", actorUserId);
            command.Parameters.AddWithValue("action", action);
            command.Parameters.AddWithValue("targetType", (object?)targetType ?? DBNull.Value);
            command.Parameters.AddWithValue("targetId", (object?)targetId ?? DBNull.Value);
            command.Parameters.Add(new NpgsqlParameter("metadata", NpgsqlDbType.Jsonb)
            {
                Value = (object?)(metadata != null ? JsonSerializer.Serialize(metadata) : null) ?? DBNull.Value
            });
            command.Parameters.AddWithValue("ipAddress", (object?)ipAddress ?? DBNull.Value);

            await command.ExecuteNonQueryAsync();
        }
        catch (Exception)
        {
            // See this method's own header comment - never let a logging
            // failure surface as a broken request.
        }
    }

    // Most recent 200 entries - same "a rolling window, not an unbounded
    // fetch" cap PortalUserAccount.LoginHistory/ActivityLogService already
    // use elsewhere in this app. Paginated client-side (see AuditLogView.jsx/
    // usePagination) - this project's own established convention for every
    // list of this size, not a server-side page/pageSize param.
    public async Task<List<AuditLogEntry>> ListAsync(Guid organizationId)
    {
        var connectionString = _settings.GetDatabaseConnectionString()
            ?? throw new InvalidOperationException("Organizations require DATABASE_URL to be configured.");

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT id, actor_user_id, action, target_type, target_id, metadata_json, ip_address, created_at_utc " +
            "FROM audit_logs WHERE organization_id = @orgId ORDER BY created_at_utc DESC LIMIT 200",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);

        var results = new List<AuditLogEntry>();

        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            results.Add(new AuditLogEntry(
                reader.GetGuid(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4),
                reader.IsDBNull(5) ? null : JsonDocument.Parse(reader.GetString(5)).RootElement.Clone(),
                reader.IsDBNull(6) ? null : reader.GetString(6),
                reader.GetDateTime(7)));
        }

        return results;
    }
}

public record AuditLogEntry(
    Guid Id, string ActorUserId, string Action, string? TargetType, string? TargetId,
    JsonElement? Metadata, string? IpAddress, DateTime CreatedAtUtc);

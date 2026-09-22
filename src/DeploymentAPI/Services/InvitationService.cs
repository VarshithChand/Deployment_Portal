using System.Security.Cryptography;
using Npgsql;

namespace DeploymentAPI.Services;

// Organization invitations - token generation/hashing/storage, accept/
// revoke. Sibling to OrganizationService/MembershipService, same "not the
// JSON blob" reasoning throughout (see OrganizationSchema's header
// comment). Token generation mirrors AccountAuthService's existing
// EmailVerificationToken/PasswordResetToken convention exactly
// (RandomNumberGenerator.GetBytes(32), hex-encoded) - the one difference
// is this token is hashed (SHA-256) before storage, never kept in
// plaintext anywhere but the email link itself, a deliberate strengthening
// justified by this being a brand-new table with no existing-data
// compatibility constraint (see the plan's invitation-flow section).
public class InvitationService
{
    private static readonly TimeSpan DefaultTtl = TimeSpan.FromDays(7);

    private readonly SettingsService _settings;

    public InvitationService(SettingsService settings)
    {
        _settings = settings;
    }

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connectionString = _settings.GetDatabaseConnectionString()
            ?? throw new InvalidOperationException("Organizations require DATABASE_URL to be configured.");

        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        return connection;
    }

    public async Task<(bool Success, string? Error, string? RawToken)> CreateAsync(
        Guid organizationId, string invitedByUserId, string email, string roleKey)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();

        if (string.IsNullOrWhiteSpace(normalizedEmail) || !normalizedEmail.Contains('@'))
            return (false, "Enter a valid email address.", null);

        await using var connection = await OpenAsync();

        Guid roleId;

        await using (var roleCommand = new NpgsqlCommand(
            "SELECT id FROM roles WHERE key = @key AND organization_id IS NULL", connection))
        {
            roleCommand.Parameters.AddWithValue("key", roleKey);
            var result = await roleCommand.ExecuteScalarAsync();

            if (result == null)
                return (false, "Unknown role.", null);

            roleId = (Guid)result;
        }

        // Revoke any existing pending invite to the same email+org before
        // issuing a fresh one - same "a fresh token overwrites whatever was
        // there before" convention PortalUserAccount.EmailVerificationToken
        // already follows, applied here via an explicit status transition
        // instead of an overwrite since this table keeps history.
        await using (var revokeCommand = new NpgsqlCommand(
            "UPDATE invitations SET status = 'revoked' WHERE organization_id = @orgId AND email = @email AND status = 'pending'",
            connection))
        {
            revokeCommand.Parameters.AddWithValue("orgId", organizationId);
            revokeCommand.Parameters.AddWithValue("email", normalizedEmail);
            await revokeCommand.ExecuteNonQueryAsync();
        }

        var rawToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var tokenHash = ComputeTokenHash(rawToken);

        await using (var insertCommand = new NpgsqlCommand(
            "INSERT INTO invitations (id, organization_id, email, role_id, token_hash, invited_by_user_id, expires_at_utc) " +
            "VALUES (@id, @orgId, @email, @roleId, @tokenHash, @invitedBy, @expiresAt)",
            connection))
        {
            insertCommand.Parameters.AddWithValue("id", Guid.NewGuid());
            insertCommand.Parameters.AddWithValue("orgId", organizationId);
            insertCommand.Parameters.AddWithValue("email", normalizedEmail);
            insertCommand.Parameters.AddWithValue("roleId", roleId);
            insertCommand.Parameters.AddWithValue("tokenHash", tokenHash);
            insertCommand.Parameters.AddWithValue("invitedBy", invitedByUserId);
            insertCommand.Parameters.AddWithValue("expiresAt", DateTime.UtcNow.Add(DefaultTtl));

            await insertCommand.ExecuteNonQueryAsync();
        }

        return (true, null, rawToken);
    }

    public async Task<List<InvitationSummary>> ListPendingAsync(Guid organizationId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT i.id, i.email, r.key, r.display_name, i.created_at_utc, i.expires_at_utc " +
            "FROM invitations i JOIN roles r ON r.id = i.role_id " +
            "WHERE i.organization_id = @orgId AND i.status = 'pending' AND i.expires_at_utc > now() " +
            "ORDER BY i.created_at_utc DESC",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);

        var results = new List<InvitationSummary>();

        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            results.Add(new InvitationSummary(
                reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.GetDateTime(4), reader.GetDateTime(5)));
        }

        return results;
    }

    public async Task<bool> RevokeAsync(Guid organizationId, Guid invitationId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "UPDATE invitations SET status = 'revoked' WHERE id = @id AND organization_id = @orgId AND status = 'pending'",
            connection);

        command.Parameters.AddWithValue("id", invitationId);
        command.Parameters.AddWithValue("orgId", organizationId);

        var rows = await command.ExecuteNonQueryAsync();
        return rows > 0;
    }

    // token/userEmail are both untrusted input - re-hashes the submitted
    // token itself (never trusts a client-supplied hash) and re-checks the
    // email match server-side even though the frontend/caller already
    // "knows" whose invite this is, since that's exactly the check the
    // spec's "don't let a user accept an invitation meant for a different
    // email" requirement needs enforced, not just displayed.
    public async Task<AcceptInvitationResult> AcceptAsync(string rawToken, string userId, string userEmail)
    {
        var tokenHash = ComputeTokenHash(rawToken);
        var normalizedUserEmail = userEmail.Trim().ToLowerInvariant();

        await using var connection = await OpenAsync();

        Guid invitationId;
        Guid organizationId;
        string invitedEmail;
        Guid roleId;
        string roleKey;

        await using (var command = new NpgsqlCommand(
            "SELECT i.id, i.organization_id, i.email, i.role_id, r.key " +
            "FROM invitations i JOIN roles r ON r.id = i.role_id " +
            "WHERE i.token_hash = @hash AND i.status = 'pending' AND i.expires_at_utc > now()",
            connection))
        {
            command.Parameters.AddWithValue("hash", tokenHash);

            await using var reader = await command.ExecuteReaderAsync();

            if (!await reader.ReadAsync())
                return AcceptInvitationResult.Fail("This invitation link is invalid or has expired.");

            invitationId = reader.GetGuid(0);
            organizationId = reader.GetGuid(1);
            invitedEmail = reader.GetString(2);
            roleId = reader.GetGuid(3);
            roleKey = reader.GetString(4);
        }

        if (!string.Equals(invitedEmail, normalizedUserEmail, StringComparison.Ordinal))
            return AcceptInvitationResult.Fail("This invitation was sent to a different email address.", wrongEmail: true);

        // Already an active member (e.g. re-invited to change role) -
        // update the existing row's role rather than inserting a second
        // one, which the partial unique index on (organization_id,
        // user_id) WHERE status='active' would reject anyway.
        Guid? existingMembershipId = null;

        await using (var existingCommand = new NpgsqlCommand(
            "SELECT id FROM organization_members WHERE organization_id = @orgId AND user_id = @userId AND status = 'active'",
            connection))
        {
            existingCommand.Parameters.AddWithValue("orgId", organizationId);
            existingCommand.Parameters.AddWithValue("userId", userId);

            var result = await existingCommand.ExecuteScalarAsync();
            if (result != null) existingMembershipId = (Guid)result;
        }

        if (existingMembershipId != null)
        {
            await using var updateCommand = new NpgsqlCommand(
                "UPDATE organization_members SET role_id = @roleId WHERE id = @id", connection);
            updateCommand.Parameters.AddWithValue("roleId", roleId);
            updateCommand.Parameters.AddWithValue("id", existingMembershipId.Value);
            await updateCommand.ExecuteNonQueryAsync();
        }
        else
        {
            await using var insertCommand = new NpgsqlCommand(
                "INSERT INTO organization_members (id, organization_id, user_id, role_id, status, invited_by_user_id) " +
                "VALUES (@id, @orgId, @userId, @roleId, 'active', " +
                "(SELECT invited_by_user_id FROM invitations WHERE id = @invitationId))",
                connection);

            insertCommand.Parameters.AddWithValue("id", Guid.NewGuid());
            insertCommand.Parameters.AddWithValue("orgId", organizationId);
            insertCommand.Parameters.AddWithValue("userId", userId);
            insertCommand.Parameters.AddWithValue("roleId", roleId);
            insertCommand.Parameters.AddWithValue("invitationId", invitationId);

            await insertCommand.ExecuteNonQueryAsync();
        }

        await using (var acceptCommand = new NpgsqlCommand(
            "UPDATE invitations SET status = 'accepted', accepted_at_utc = now(), accepted_by_user_id = @userId WHERE id = @id",
            connection))
        {
            acceptCommand.Parameters.AddWithValue("userId", userId);
            acceptCommand.Parameters.AddWithValue("id", invitationId);
            await acceptCommand.ExecuteNonQueryAsync();
        }

        return AcceptInvitationResult.Ok(organizationId, roleKey);
    }

    // internal (not private) so the test project can verify this
    // deterministic hashing directly - see AssemblyInfo.cs's
    // InternalsVisibleTo.
    internal static string ComputeTokenHash(string rawToken) =>
        Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();

    // A pure mirror of the WHERE status='pending' AND expires_at_utc>now()
    // predicate CreateAsync/AcceptAsync actually enforce in SQL (see
    // AcceptAsync above) - kept only for unit-testing the business rule in
    // isolation, since the real predicate lives in the query itself and
    // can't be exercised without a live Postgres row. If this rule ever
    // changes, both places need updating together; there's no single
    // source of truth spanning SQL and C# here.
    internal static bool IsAcceptable(string status, DateTime expiresAtUtc, DateTime nowUtc) =>
        status == "pending" && expiresAtUtc > nowUtc;
}

public record InvitationSummary(
    Guid Id, string Email, string RoleKey, string RoleDisplayName, DateTime CreatedAtUtc, DateTime ExpiresAtUtc);

public class AcceptInvitationResult
{
    public bool Success { get; private init; }
    public string? Error { get; private init; }
    public bool WrongEmail { get; private init; }
    public Guid? OrganizationId { get; private init; }
    public string? RoleKey { get; private init; }

    public static AcceptInvitationResult Fail(string error, bool wrongEmail = false) =>
        new() { Success = false, Error = error, WrongEmail = wrongEmail };

    public static AcceptInvitationResult Ok(Guid organizationId, string roleKey) =>
        new() { Success = true, OrganizationId = organizationId, RoleKey = roleKey };
}

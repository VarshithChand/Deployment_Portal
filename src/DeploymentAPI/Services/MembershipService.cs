using Npgsql;

namespace DeploymentAPI.Services;

// Organization membership - who belongs to which org, with what role.
// Sibling to OrganizationService/OrgAuthorizationService, all three new
// for the Organizations/Roles/Permissions feature, none of them routing
// through SettingsService's JSON blob (see OrganizationSchema's own header
// comment for why: this needs real relational membership queries).
public class MembershipService
{
    private readonly SettingsService _settings;

    public MembershipService(SettingsService settings)
    {
        _settings = settings;
    }

    private string? ConnectionString => _settings.GetDatabaseConnectionString();

    // Null when organizations aren't enabled at all (no DATABASE_URL) -
    // every caller of this service already only runs when that's true
    // (OrganizationsController etc. are unreachable otherwise - see
    // SettingsViewDto.OrganizationsEnabled), but this stays defensive
    // rather than assuming.
    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connectionString = ConnectionString
            ?? throw new InvalidOperationException("Organizations require DATABASE_URL to be configured.");

        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        return connection;
    }

    public async Task<MembershipRow?> GetActiveMembershipAsync(Guid organizationId, string userId)
    {
        await using var connection = await OpenAsync();
        await using var command = new NpgsqlCommand(
            "SELECT om.id, om.role_id, r.key " +
            "FROM organization_members om JOIN roles r ON r.id = om.role_id " +
            "WHERE om.organization_id = @orgId AND om.user_id = @userId AND om.status = 'active'",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);
        command.Parameters.AddWithValue("userId", userId);

        await using var reader = await command.ExecuteReaderAsync();

        if (!await reader.ReadAsync())
            return null;

        return new MembershipRow(reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2));
    }

    // Active Admin-role members in an org, optionally excluding one row -
    // the shared building block for last-admin protection (role changes,
    // member removal in a later phase, and account deletion here in
    // Phase 1). Plain read-then-write, not transactional - a known,
    // narrow, accepted race (see the plan's own note on this), not a
    // silent gap.
    public async Task<int> CountActiveAdminsAsync(Guid organizationId, Guid? excludingMemberId = null)
    {
        await using var connection = await OpenAsync();
        await using var command = new NpgsqlCommand(
            "SELECT COUNT(*) FROM organization_members om JOIN roles r ON r.id = om.role_id " +
            "WHERE om.organization_id = @orgId AND om.status = 'active' AND r.key = 'admin' " +
            "AND (@excludingMemberId::uuid IS NULL OR om.id != @excludingMemberId)",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);
        command.Parameters.AddWithValue("excludingMemberId", (object?)excludingMemberId ?? DBNull.Value);

        var result = await command.ExecuteScalarAsync();
        return Convert.ToInt32(result);
    }

    // Called from AccountAuthController.DeleteAccount before the existing
    // DeletePatUserAsync runs. Two responsibilities: (1) cascade away the
    // user's own synthetic Personal org (organizations.owner_user_id ->
    // ON DELETE CASCADE on every child table takes care of memberships/
    // credentials/invitations/etc. for that org), (2) refuse the deletion
    // outright if the user is the SOLE remaining Admin of any real org
    // that still has other members - without this, account deletion would
    // be a way to silently orphan an organization with zero admins.
    public async Task<AccountDeletionCheckResult> HandleAccountDeletionAsync(string userId)
    {
        await using var connection = await OpenAsync();

        // Orgs where this user is an active Admin.
        var adminOrgIds = new List<Guid>();

        await using (var command = new NpgsqlCommand(
            "SELECT om.organization_id FROM organization_members om JOIN roles r ON r.id = om.role_id " +
            "WHERE om.user_id = @userId AND om.status = 'active' AND r.key = 'admin'",
            connection))
        {
            command.Parameters.AddWithValue("userId", userId);

            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
                adminOrgIds.Add(reader.GetGuid(0));
        }

        foreach (var orgId in adminOrgIds)
        {
            // Personal orgs have no other members by construction - skip
            // the "other members" check for them, they're always safe to
            // cascade-delete along with the account itself.
            await using var typeCommand = new NpgsqlCommand(
                "SELECT account_type FROM organizations WHERE id = @orgId", connection);
            typeCommand.Parameters.AddWithValue("orgId", orgId);
            var accountType = (string?)await typeCommand.ExecuteScalarAsync();

            if (accountType == "personal")
                continue;

            await using var otherMembersCommand = new NpgsqlCommand(
                "SELECT COUNT(*) FROM organization_members WHERE organization_id = @orgId AND status = 'active' AND user_id != @userId",
                connection);
            otherMembersCommand.Parameters.AddWithValue("orgId", orgId);
            otherMembersCommand.Parameters.AddWithValue("userId", userId);
            var otherMembers = Convert.ToInt32(await otherMembersCommand.ExecuteScalarAsync());

            var remainingAdmins = await CountActiveAdminsAsyncOnConnection(connection, orgId, excludingUserId: userId);

            if (otherMembers > 0 && LastAdminProtection.WouldLeaveOrganizationWithoutAdmin(remainingAdmins))
                return AccountDeletionCheckResult.Blocked();
        }

        // Safe to proceed - cascade the Personal org away (real orgs the
        // user belongs to, admin or not, simply lose this membership row
        // via the same cascade path organization deletion would use; here
        // it's scoped to only the Personal org since that's the one this
        // account genuinely owns).
        await using var deleteCommand = new NpgsqlCommand(
            "DELETE FROM organizations WHERE owner_user_id = @userId AND account_type = 'personal'", connection);
        deleteCommand.Parameters.AddWithValue("userId", userId);
        await deleteCommand.ExecuteNonQueryAsync();

        await using var removeMembershipsCommand = new NpgsqlCommand(
            "UPDATE organization_members SET status = 'removed', removed_at_utc = now() WHERE user_id = @userId AND status = 'active'",
            connection);
        removeMembershipsCommand.Parameters.AddWithValue("userId", userId);
        await removeMembershipsCommand.ExecuteNonQueryAsync();

        return AccountDeletionCheckResult.Allowed();
    }

    public async Task<List<MemberSummary>> ListMembersAsync(Guid organizationId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT om.id, om.user_id, r.key, r.display_name, om.joined_at_utc " +
            "FROM organization_members om JOIN roles r ON r.id = om.role_id " +
            "WHERE om.organization_id = @orgId AND om.status = 'active' " +
            "ORDER BY (r.key = 'admin') DESC, om.joined_at_utc",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);

        var results = new List<MemberSummary>();

        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            results.Add(new MemberSummary(
                reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetDateTime(4)));
        }

        return results;
    }

    // Refuses to demote the org's last Admin (see
    // WouldLeaveOrgWithoutAdminAsync's own reasoning, inlined here via
    // CountActiveAdminsAsync with the target member excluded from the count).
    public async Task<(bool Success, string? Error)> ChangeRoleAsync(Guid organizationId, Guid memberId, string newRoleKey)
    {
        await using var connection = await OpenAsync();

        Guid roleId;

        await using (var roleCommand = new NpgsqlCommand(
            "SELECT id FROM roles WHERE key = @key AND organization_id IS NULL", connection))
        {
            roleCommand.Parameters.AddWithValue("key", newRoleKey);
            var result = await roleCommand.ExecuteScalarAsync();

            if (result == null)
                return (false, "Unknown role.");

            roleId = (Guid)result;
        }

        if (newRoleKey != "admin")
        {
            var remainingAdmins = await CountActiveAdminsOnConnectionAsync(connection, organizationId, excludingMemberId: memberId);

            if (LastAdminProtection.WouldLeaveOrganizationWithoutAdmin(remainingAdmins))
                return (false, "An organization must always have at least one Admin.");
        }

        await using var updateCommand = new NpgsqlCommand(
            "UPDATE organization_members SET role_id = @roleId WHERE id = @id AND organization_id = @orgId AND status = 'active'",
            connection);

        updateCommand.Parameters.AddWithValue("roleId", roleId);
        updateCommand.Parameters.AddWithValue("id", memberId);
        updateCommand.Parameters.AddWithValue("orgId", organizationId);

        var rows = await updateCommand.ExecuteNonQueryAsync();
        return rows > 0 ? (true, null) : (false, "Member not found.");
    }

    public async Task<(bool Success, string? Error)> RemoveMemberAsync(Guid organizationId, Guid memberId)
    {
        await using var connection = await OpenAsync();

        var remainingAdmins = await CountActiveAdminsOnConnectionAsync(connection, organizationId, excludingMemberId: memberId);

        // Only actually a problem if the member being removed is one of
        // the org's admins - CountActiveAdminsOnConnectionAsync excludes
        // them from the count either way, so removing a non-admin always
        // leaves the count unchanged and this never blocks that case.
        await using var roleCheckCommand = new NpgsqlCommand(
            "SELECT r.key FROM organization_members om JOIN roles r ON r.id = om.role_id WHERE om.id = @id AND om.organization_id = @orgId",
            connection);
        roleCheckCommand.Parameters.AddWithValue("id", memberId);
        roleCheckCommand.Parameters.AddWithValue("orgId", organizationId);
        var currentRoleKey = (string?)await roleCheckCommand.ExecuteScalarAsync();

        if (currentRoleKey == null)
            return (false, "Member not found.");

        if (currentRoleKey == "admin" && LastAdminProtection.WouldLeaveOrganizationWithoutAdmin(remainingAdmins))
            return (false, "An organization must always have at least one Admin.");

        await using var removeCommand = new NpgsqlCommand(
            "UPDATE organization_members SET status = 'removed', removed_at_utc = now() " +
            "WHERE id = @id AND organization_id = @orgId AND status = 'active'",
            connection);

        removeCommand.Parameters.AddWithValue("id", memberId);
        removeCommand.Parameters.AddWithValue("orgId", organizationId);

        var rows = await removeCommand.ExecuteNonQueryAsync();
        return rows > 0 ? (true, null) : (false, "Member not found.");
    }

    private static async Task<int> CountActiveAdminsOnConnectionAsync(NpgsqlConnection connection, Guid organizationId, Guid excludingMemberId)
    {
        await using var command = new NpgsqlCommand(
            "SELECT COUNT(*) FROM organization_members om JOIN roles r ON r.id = om.role_id " +
            "WHERE om.organization_id = @orgId AND om.status = 'active' AND r.key = 'admin' AND om.id != @excludingMemberId",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);
        command.Parameters.AddWithValue("excludingMemberId", excludingMemberId);

        var result = await command.ExecuteScalarAsync();
        return Convert.ToInt32(result);
    }

    private static async Task<int> CountActiveAdminsAsyncOnConnection(NpgsqlConnection connection, Guid organizationId, string excludingUserId)
    {
        await using var command = new NpgsqlCommand(
            "SELECT COUNT(*) FROM organization_members om JOIN roles r ON r.id = om.role_id " +
            "WHERE om.organization_id = @orgId AND om.status = 'active' AND r.key = 'admin' AND om.user_id != @excludingUserId",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);
        command.Parameters.AddWithValue("excludingUserId", excludingUserId);

        var result = await command.ExecuteScalarAsync();
        return Convert.ToInt32(result);
    }
}

public record MembershipRow(Guid Id, Guid RoleId, string RoleKey);

// Pure decision rules extracted from MembershipService's SQL-backed
// methods (ChangeRoleAsync/RemoveMemberAsync/HandleAccountDeletionAsync)
// specifically so the actual last-admin-protection RULE is unit-testable
// without a live Postgres instance - see OrgAuthorizationService.
// ApplyOverrides' identical reasoning.
public static class LastAdminProtection
{
    // remainingActiveAdmins already excludes the member being changed/
    // removed (see MembershipService.CountActiveAdminsOnConnectionAsync's
    // own "excludingMemberId" parameter) - true means the action must be
    // refused. A non-admin member being removed/demoted always passes 0
    // remaining-admins-excluding-them as irrelevant to whether admins
    // remain, so callers only invoke this when the target IS (or is
    // becoming not-) an admin.
    public static bool WouldLeaveOrganizationWithoutAdmin(int remainingActiveAdmins) =>
        remainingActiveAdmins == 0;
}

public record MemberSummary(Guid Id, string UserId, string RoleKey, string RoleDisplayName, DateTime JoinedAtUtc);

public class AccountDeletionCheckResult
{
    public bool Success { get; private init; }

    public static AccountDeletionCheckResult Allowed() => new() { Success = true };
    public static AccountDeletionCheckResult Blocked() => new() { Success = false };
}

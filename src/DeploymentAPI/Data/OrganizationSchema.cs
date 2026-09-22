using Npgsql;

namespace DeploymentAPI.Data;

// Idempotent DDL + seed data for the organizations/roles/permissions
// feature - a genuinely relational addition to a backend that otherwise
// has exactly two Postgres tables (portal_settings, data_protection_keys),
// both single-blob/keyring stores. See the "Organizations, Roles &
// Permissions" plan for the full design; this file only creates structure
// and seeds the three fixed system roles + their permission matrix. It is
// called once from Program.cs, only when DATABASE_URL is configured -
// organizations are a Postgres-required feature (no local-JSON-file
// fallback the way SettingsService has one), matching how Hosting
// Observability/Database Management already degrade without a real DB.
//
// CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS throughout, same
// idempotency convention SettingsService/DatabaseManagementService already
// use for portal_settings/data_protection_keys - safe to call on every
// startup, safe under concurrent instances racing to create the same table.
public static class OrganizationSchema
{
    public static async Task EnsureCreatedAsync(string connectionString)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        await ExecuteAsync(connection, """
            CREATE TABLE IF NOT EXISTS organizations (
                id UUID PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                description TEXT NULL,
                account_type TEXT NOT NULL CHECK (account_type IN ('personal','organization')),
                owner_user_id TEXT NOT NULL,
                created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
                deleted_at_utc TIMESTAMPTZ NULL
            )
            """);
        await ExecuteAsync(connection, "CREATE UNIQUE INDEX IF NOT EXISTS ux_organizations_slug ON organizations (slug)");
        await ExecuteAsync(connection, "CREATE INDEX IF NOT EXISTS ix_organizations_owner ON organizations (owner_user_id)");
        // One Personal org per user, enforced at the DB level - a double-
        // login race hits this via ON CONFLICT DO NOTHING rather than
        // creating a duplicate (see OrganizationService.
        // EnsureOwnsPersonalOrganizationAsync).
        await ExecuteAsync(connection,
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_organizations_personal_owner ON organizations (owner_user_id) WHERE account_type = 'personal'");

        await ExecuteAsync(connection, """
            CREATE TABLE IF NOT EXISTS roles (
                id UUID PRIMARY KEY,
                organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
                key TEXT NOT NULL,
                display_name TEXT NOT NULL,
                is_system BOOLEAN NOT NULL DEFAULT false,
                created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """);
        // Only the 3 system roles (organization_id IS NULL) are seeded
        // today - the nullable column exists so a future per-org custom
        // role is additive, not a migration, but custom roles are out of
        // scope for now.
        await ExecuteAsync(connection, "CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_system_key ON roles (key) WHERE organization_id IS NULL");

        await ExecuteAsync(connection, """
            CREATE TABLE IF NOT EXISTS permissions (
                id UUID PRIMARY KEY,
                key TEXT NOT NULL UNIQUE,
                resource TEXT NOT NULL,
                action TEXT NOT NULL,
                description TEXT NOT NULL
            )
            """);

        await ExecuteAsync(connection, """
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
                granted_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (role_id, permission_id)
            )
            """);

        await ExecuteAsync(connection, """
            CREATE TABLE IF NOT EXISTS organization_members (
                id UUID PRIMARY KEY,
                organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                user_id TEXT NOT NULL,
                role_id UUID NOT NULL REFERENCES roles(id),
                status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
                invited_by_user_id TEXT NULL,
                joined_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
                removed_at_utc TIMESTAMPTZ NULL
            )
            """);
        // Partial unique - one ACTIVE membership row per user+org. A
        // removed-then-reinvited user gets a fresh row rather than
        // resurrecting the old one, so membership history stays intact.
        await ExecuteAsync(connection,
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_org_members_active ON organization_members (organization_id, user_id) WHERE status = 'active'");
        await ExecuteAsync(connection, "CREATE INDEX IF NOT EXISTS ix_org_members_user ON organization_members (user_id)");
        await ExecuteAsync(connection, "CREATE INDEX IF NOT EXISTS ix_org_members_org ON organization_members (organization_id)");

        await ExecuteAsync(connection, """
            CREATE TABLE IF NOT EXISTS member_permissions (
                id UUID PRIMARY KEY,
                organization_member_id UUID NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
                permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
                effect TEXT NOT NULL CHECK (effect IN ('grant','deny')),
                granted_by_user_id TEXT NOT NULL,
                created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """);
        await ExecuteAsync(connection,
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_member_permissions ON member_permissions (organization_member_id, permission_id)");

        await ExecuteAsync(connection, """
            CREATE TABLE IF NOT EXISTS invitations (
                id UUID PRIMARY KEY,
                organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                email TEXT NOT NULL,
                role_id UUID NOT NULL REFERENCES roles(id),
                token_hash TEXT NOT NULL UNIQUE,
                invited_by_user_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
                created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
                expires_at_utc TIMESTAMPTZ NOT NULL,
                accepted_at_utc TIMESTAMPTZ NULL,
                accepted_by_user_id TEXT NULL
            )
            """);
        await ExecuteAsync(connection,
            "CREATE INDEX IF NOT EXISTS ix_invitations_pending_email ON invitations (organization_id, email) WHERE status = 'pending'");

        await ExecuteAsync(connection, """
            CREATE TABLE IF NOT EXISTS organization_credentials (
                id UUID PRIMARY KEY,
                organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                provider TEXT NOT NULL,
                name TEXT NOT NULL,
                config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                secret_encrypted TEXT NULL,
                created_by_user_id TEXT NOT NULL,
                created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """);
        await ExecuteAsync(connection, "CREATE INDEX IF NOT EXISTS ix_org_credentials_provider ON organization_credentials (organization_id, provider)");

        await ExecuteAsync(connection, """
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY,
                organization_id UUID NULL REFERENCES organizations(id),
                actor_user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                target_type TEXT NULL,
                target_id TEXT NULL,
                metadata_json JSONB NULL,
                ip_address TEXT NULL,
                created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """);
        await ExecuteAsync(connection, "CREATE INDEX IF NOT EXISTS ix_audit_logs_org_time ON audit_logs (organization_id, created_at_utc DESC)");
        await ExecuteAsync(connection, "CREATE INDEX IF NOT EXISTS ix_audit_logs_actor ON audit_logs (actor_user_id)");

        await SeedRolesAndPermissionsAsync(connection);
    }

    private static async Task ExecuteAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    // (key, resource, action, description) - the fixed permission catalog.
    // Presence of a role_permissions row means "granted"; there's no
    // separate NONE/READ/WRITE level column (see the plan's schema
    // section for why separate keys per level was chosen over an ordinal
    // enum: credentials.use vs credentials.read is what lets a Contributor
    // deploy using a credential without ever seeing it).
    private static readonly (string Key, string Resource, string Action, string Description)[] PermissionCatalog =
    [
        ("organization.manage", "organization", "manage", "Rename, update, or delete the organization"),
        ("members.manage", "members", "manage", "Invite, remove, or change the role of organization members"),
        ("roles.manage", "roles", "manage", "Reserved for future custom role management"),
        ("credentials.read", "credentials", "read", "View organization credential metadata (never secret values)"),
        ("credentials.write", "credentials", "write", "Create or update organization credentials"),
        ("credentials.delete", "credentials", "delete", "Delete organization credentials"),
        ("credentials.use", "credentials", "use", "Deploy using organization credentials without viewing them"),
        ("deployments.execute", "deployments", "execute", "Trigger deployments for the organization"),
        ("deployments.view", "deployments", "view", "View deployment activity for the organization"),
        ("audit_logs.view", "audit_logs", "view", "View the organization's audit log"),
        // Phase 5 - cloud services (AWS/Azure resource actions). read
        // covers list/detail/metrics; write covers start/stop/scale/create/
        // delete/firewall-rule changes - see CloudServicesController's
        // ResolveAwsCredentialsAsync/ResolveAzureCredentialsAsync, which
        // infer which one applies from the request's own HTTP verb.
        ("cloud_services.read", "cloud_services", "read", "View this organization's cloud service resources"),
        ("cloud_services.write", "cloud_services", "write", "Manage (start/stop/scale/create/delete) this organization's cloud service resources")
    ];

    // The 3 fixed system roles and the permission keys each one grants -
    // see the plan's seeded matrix. Contributor gets credentials.use +
    // deployments.execute/view but NOT credentials.read - the "can deploy
    // with a credential without seeing it" requirement.
    private static readonly (string Key, string DisplayName, string[] PermissionKeys)[] SystemRoles =
    [
        ("admin", "Admin", PermissionCatalog.Select(p => p.Key).ToArray()),
        ("contributor", "Contributor", ["credentials.use", "deployments.execute", "deployments.view", "cloud_services.read"]),
        ("read", "Read", ["credentials.read", "deployments.view", "cloud_services.read"])
    ];

    private static async Task SeedRolesAndPermissionsAsync(NpgsqlConnection connection)
    {
        foreach (var permission in PermissionCatalog)
        {
            await using var command = new NpgsqlCommand(
                "INSERT INTO permissions (id, key, resource, action, description) VALUES (@id, @key, @resource, @action, @description) " +
                "ON CONFLICT (key) DO NOTHING",
                connection);

            command.Parameters.AddWithValue("id", Guid.NewGuid());
            command.Parameters.AddWithValue("key", permission.Key);
            command.Parameters.AddWithValue("resource", permission.Resource);
            command.Parameters.AddWithValue("action", permission.Action);
            command.Parameters.AddWithValue("description", permission.Description);

            await command.ExecuteNonQueryAsync();
        }

        foreach (var role in SystemRoles)
        {
            await using var command = new NpgsqlCommand(
                "INSERT INTO roles (id, organization_id, key, display_name, is_system) VALUES (@id, NULL, @key, @displayName, true) " +
                "ON CONFLICT (key) WHERE organization_id IS NULL DO NOTHING",
                connection);

            command.Parameters.AddWithValue("id", Guid.NewGuid());
            command.Parameters.AddWithValue("key", role.Key);
            command.Parameters.AddWithValue("displayName", role.DisplayName);

            await command.ExecuteNonQueryAsync();
        }

        // Re-read the now-seeded (or already-existing) rows to resolve
        // real ids for the role_permissions matrix - simpler and just as
        // safe as trying to thread the ids seeded above through, since a
        // second app instance racing this same startup path may have
        // already inserted them under different ids via ON CONFLICT.
        var roleIds = new Dictionary<string, Guid>(StringComparer.Ordinal);
        var permissionIds = new Dictionary<string, Guid>(StringComparer.Ordinal);

        await using (var command = new NpgsqlCommand("SELECT id, key FROM roles WHERE is_system", connection))
        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
                roleIds[reader.GetString(1)] = reader.GetGuid(0);
        }

        await using (var command = new NpgsqlCommand("SELECT id, key FROM permissions", connection))
        await using (var reader = await command.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
                permissionIds[reader.GetString(1)] = reader.GetGuid(0);
        }

        foreach (var role in SystemRoles)
        {
            if (!roleIds.TryGetValue(role.Key, out var roleId))
                continue;

            foreach (var permissionKey in role.PermissionKeys)
            {
                if (!permissionIds.TryGetValue(permissionKey, out var permissionId))
                    continue;

                await using var command = new NpgsqlCommand(
                    "INSERT INTO role_permissions (role_id, permission_id) VALUES (@roleId, @permissionId) ON CONFLICT DO NOTHING",
                    connection);

                command.Parameters.AddWithValue("roleId", roleId);
                command.Parameters.AddWithValue("permissionId", permissionId);

                await command.ExecuteNonQueryAsync();
            }
        }
    }
}

using System.Text.Json;
using DeploymentAPI.DTOs;
using Microsoft.AspNetCore.DataProtection;
using Npgsql;
using NpgsqlTypes;

namespace DeploymentAPI.Services;

// Organization-scoped credentials (GitHub/AWS/Azure/etc.) - a NEW,
// additive store for Organization accounts, sitting entirely alongside
// (not replacing) SettingsService's existing per-user credential sections
// (UserGitHubCredentials, UserAwsCredentials, ...), which remain what a
// Personal account's resources mean. Same IDataProtector purpose string as
// SettingsService.Protect/Unprotect ("DeploymentPortal.Credentials.v1") -
// same key ring, same encryption convention, not a second bespoke scheme.
//
// API responses built from this service NEVER include the secret,
// decrypted or not - only {id, provider, name, config, configured}. Only
// GetGitHubCredentialForDeployAsync (used internally by the deploy
// pipeline, never returned as an API response field) ever calls Unprotect.
public class OrgCredentialService
{
    private readonly SettingsService _settings;
    private readonly IDataProtector _protector;

    public OrgCredentialService(SettingsService settings, IDataProtectionProvider dataProtectionProvider)
    {
        _settings = settings;
        _protector = dataProtectionProvider.CreateProtector("DeploymentPortal.Credentials.v1");
    }

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connectionString = _settings.GetDatabaseConnectionString()
            ?? throw new InvalidOperationException("Organizations require DATABASE_URL to be configured.");

        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        return connection;
    }

    public async Task<List<OrganizationCredentialDto>> ListAsync(Guid organizationId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT id, provider, name, config_json, secret_encrypted, created_at_utc, updated_at_utc " +
            "FROM organization_credentials WHERE organization_id = @orgId ORDER BY created_at_utc",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);

        var results = new List<OrganizationCredentialDto>();

        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
            results.Add(MapRow(reader));

        return results;
    }

    public async Task<(bool Success, string? Error, OrganizationCredentialDto? Credential)> CreateAsync(
        Guid organizationId, string userId, SaveOrganizationCredentialRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Provider))
            return (false, "A provider is required.", null);

        if (string.IsNullOrWhiteSpace(request.Name))
            return (false, "A name is required.", null);

        await using var connection = await OpenAsync();

        var id = Guid.NewGuid();
        var configJson = request.Config?.GetRawText() ?? "{}";
        var secretEncrypted = string.IsNullOrWhiteSpace(request.Secret) ? null : _protector.Protect(request.Secret.Trim());

        await using var command = new NpgsqlCommand(
            "INSERT INTO organization_credentials (id, organization_id, provider, name, config_json, secret_encrypted, created_by_user_id) " +
            "VALUES (@id, @orgId, @provider, @name, @config, @secret, @userId)",
            connection);

        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("orgId", organizationId);
        command.Parameters.AddWithValue("provider", request.Provider.Trim().ToLowerInvariant());
        command.Parameters.AddWithValue("name", request.Name.Trim());
        command.Parameters.Add(new NpgsqlParameter("config", NpgsqlDbType.Jsonb) { Value = configJson });
        command.Parameters.AddWithValue("secret", (object?)secretEncrypted ?? DBNull.Value);
        command.Parameters.AddWithValue("userId", userId);

        await command.ExecuteNonQueryAsync();

        return (true, null, await GetAsync(organizationId, id));
    }

    // Blank Config/Secret keep whatever was already saved - same
    // convention SettingsService's own Save*CredentialsAsync methods use
    // throughout (e.g. SaveUserGitHubCredentialsAsync's token field).
    public async Task<bool> UpdateAsync(Guid organizationId, Guid credentialId, SaveOrganizationCredentialRequestDto request)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "UPDATE organization_credentials SET " +
            "name = COALESCE(NULLIF(@name, ''), name), " +
            "config_json = CASE WHEN @configProvided THEN @config::jsonb ELSE config_json END, " +
            "secret_encrypted = CASE WHEN @secretProvided THEN @secret ELSE secret_encrypted END, " +
            "updated_at_utc = now() " +
            "WHERE id = @id AND organization_id = @orgId",
            connection);

        command.Parameters.AddWithValue("id", credentialId);
        command.Parameters.AddWithValue("orgId", organizationId);
        command.Parameters.AddWithValue("name", request.Name?.Trim() ?? string.Empty);
        command.Parameters.AddWithValue("configProvided", request.Config != null);
        command.Parameters.Add(new NpgsqlParameter("config", NpgsqlDbType.Jsonb) { Value = request.Config?.GetRawText() ?? "{}" });
        command.Parameters.AddWithValue("secretProvided", !string.IsNullOrWhiteSpace(request.Secret));
        command.Parameters.AddWithValue("secret",
            string.IsNullOrWhiteSpace(request.Secret) ? DBNull.Value : (object)_protector.Protect(request.Secret.Trim()));

        var rows = await command.ExecuteNonQueryAsync();
        return rows > 0;
    }

    public async Task<bool> DeleteAsync(Guid organizationId, Guid credentialId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "DELETE FROM organization_credentials WHERE id = @id AND organization_id = @orgId",
            connection);

        command.Parameters.AddWithValue("id", credentialId);
        command.Parameters.AddWithValue("orgId", organizationId);

        var rows = await command.ExecuteNonQueryAsync();
        return rows > 0;
    }

    public async Task<OrganizationCredentialDto?> GetAsync(Guid organizationId, Guid credentialId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT id, provider, name, config_json, secret_encrypted, created_at_utc, updated_at_utc " +
            "FROM organization_credentials WHERE id = @id AND organization_id = @orgId",
            connection);

        command.Parameters.AddWithValue("id", credentialId);
        command.Parameters.AddWithValue("orgId", organizationId);

        await using var reader = await command.ExecuteReaderAsync();

        return await reader.ReadAsync() ? MapRow(reader) : null;
    }

    // Internal use only by the deploy pipeline (DeploymentController) -
    // the one place this service actually decrypts a secret. Picks the
    // organization's single "github" credential (Phase 2 doesn't support
    // more than one GitHub connection per org, matching the plan's "the
    // organization's shared repo" scope). Null Owner/Repository/token
    // means "not configured yet" - the caller decides how to respond.
    public async Task<OrgGitHubCredential?> GetGitHubCredentialForDeployAsync(Guid organizationId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT config_json, secret_encrypted FROM organization_credentials " +
            "WHERE organization_id = @orgId AND provider = 'github' ORDER BY created_at_utc LIMIT 1",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);

        await using var reader = await command.ExecuteReaderAsync();

        if (!await reader.ReadAsync())
            return null;

        var configJson = reader.GetString(0);
        var secretEncrypted = reader.IsDBNull(1) ? null : reader.GetString(1);

        using var doc = JsonDocument.Parse(configJson);
        var owner = doc.RootElement.TryGetProperty("owner", out var ownerEl) ? ownerEl.GetString() ?? string.Empty : string.Empty;
        var repository = doc.RootElement.TryGetProperty("repository", out var repoEl) ? repoEl.GetString() ?? string.Empty : string.Empty;

        var token = string.IsNullOrEmpty(secretEncrypted) ? null : _protector.Unprotect(secretEncrypted);

        return new OrgGitHubCredential(owner, repository, token);
    }

    // Phase 5 - same "internal use only, never a decrypted secret in an API
    // response" rule as GetGitHubCredentialForDeployAsync above. Picks the
    // org's single "aws" credential (one AWS connection per org, matching
    // the "organization's shared credential" model this feature
    // introduces). Returns the same UserAwsCredentials shape
    // SettingsService.GetUserAwsCredentialsAsync already returns for the
    // per-user path, so CloudServiceManagementService (stateless, takes
    // credentials as a plain parameter) needs no changes at all - only the
    // caller (CloudServicesController) decides which source to build one
    // from. Session/MFA/SSO fields are always null here - an org-level
    // credential is a plain long-term access key, not an interactive
    // per-browser MFA/SSO session tied to one visitor.
    public async Task<UserAwsCredentials?> GetAwsCredentialForUseAsync(Guid organizationId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT config_json, secret_encrypted FROM organization_credentials " +
            "WHERE organization_id = @orgId AND provider = 'aws' ORDER BY created_at_utc LIMIT 1",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);

        await using var reader = await command.ExecuteReaderAsync();

        if (!await reader.ReadAsync())
            return null;

        var configJson = reader.GetString(0);
        var secretEncrypted = reader.IsDBNull(1) ? null : reader.GetString(1);

        using var doc = JsonDocument.Parse(configJson);
        var accessKeyId = doc.RootElement.TryGetProperty("accessKeyId", out var akEl) ? akEl.GetString() : null;
        var region = doc.RootElement.TryGetProperty("region", out var regionEl) ? regionEl.GetString() : null;

        var secretAccessKey = string.IsNullOrEmpty(secretEncrypted) ? null : _protector.Unprotect(secretEncrypted);

        return new UserAwsCredentials(
            accessKeyId, secretAccessKey, region, null, null, null, null, null, null, null, null);
    }

    // Same reasoning as GetAwsCredentialForUseAsync above, for the org's
    // single "azure" credential.
    public async Task<UserAzureCredentials?> GetAzureCredentialForUseAsync(Guid organizationId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT config_json, secret_encrypted FROM organization_credentials " +
            "WHERE organization_id = @orgId AND provider = 'azure' ORDER BY created_at_utc LIMIT 1",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);

        await using var reader = await command.ExecuteReaderAsync();

        if (!await reader.ReadAsync())
            return null;

        var configJson = reader.GetString(0);
        var secretEncrypted = reader.IsDBNull(1) ? null : reader.GetString(1);

        using var doc = JsonDocument.Parse(configJson);
        var tenantId = doc.RootElement.TryGetProperty("tenantId", out var tenantEl) ? tenantEl.GetString() : null;
        var clientId = doc.RootElement.TryGetProperty("clientId", out var clientEl) ? clientEl.GetString() : null;
        var subscriptionId = doc.RootElement.TryGetProperty("subscriptionId", out var subEl) ? subEl.GetString() : null;

        var clientSecret = string.IsNullOrEmpty(secretEncrypted) ? null : _protector.Unprotect(secretEncrypted);

        return new UserAzureCredentials(tenantId, clientId, clientSecret, subscriptionId);
    }

    private static OrganizationCredentialDto MapRow(NpgsqlDataReader reader)
    {
        var configJson = reader.GetString(3);
        var secretEncrypted = reader.IsDBNull(4) ? null : reader.GetString(4);

        return new OrganizationCredentialDto
        {
            Id = reader.GetGuid(0),
            Provider = reader.GetString(1),
            Name = reader.GetString(2),
            Config = JsonDocument.Parse(configJson).RootElement.Clone(),
            Configured = !string.IsNullOrEmpty(secretEncrypted),
            CreatedAtUtc = reader.GetDateTime(5),
            UpdatedAtUtc = reader.GetDateTime(6)
        };
    }
}

// Deploy-time only - never serialized directly into an API response (see
// this file's own header comment).
public record OrgGitHubCredential(string Owner, string Repository, string? PersonalAccessToken);

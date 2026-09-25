using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Npgsql;

namespace DeploymentAPI.Services;

// Org-scoped Terraform configuration file storage/editing - deliberately
// STORAGE AND EDITING ONLY. No terraform binary is invoked anywhere in
// this app, no plan/apply, no state file, no execution of any kind - this
// is a place to write and organize .tf text, the same way a Credentials
// entry stores connection info without this app ever calling out to AWS
// on its own initiative. Running arbitrary infrastructure changes is a
// materially different, much higher-risk feature (a real execution
// sandbox, a state backend, credential injection into that sandbox) that
// was explicitly scoped OUT when this was built - see the "Organizations,
// Roles & Permissions" work this sits alongside. See also
// SettingsService's personal (non-org) Terraform file storage, which
// shares TerraformFileNaming's validation but persists to the JSONB
// settings blob instead of this table - a deliberately separate, simpler
// path for a single user's own files rather than an organization's.
public class TerraformFileService
{
    private readonly SettingsService _settings;

    public TerraformFileService(SettingsService settings)
    {
        _settings = settings;
    }

    // Pure - no DB dependency, unit-testable in isolation (see
    // OrgAuthorizationService.ApplyOverrides' identical reasoning).
    internal static (bool Valid, string? Error) ValidateFileName(string? fileName) =>
        TerraformFileNaming.ValidateFileName(fileName);

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var connectionString = _settings.GetDatabaseConnectionString()
            ?? throw new InvalidOperationException("Organizations require DATABASE_URL to be configured.");

        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        return connection;
    }

    public async Task<List<TerraformFileSummaryDto>> ListAsync(Guid organizationId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT id, file_name, length(content), created_at_utc, updated_at_utc, updated_by_user_id " +
            "FROM terraform_files WHERE organization_id = @orgId ORDER BY file_name",
            connection);

        command.Parameters.AddWithValue("orgId", organizationId);

        var results = new List<TerraformFileSummaryDto>();

        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            results.Add(new TerraformFileSummaryDto
            {
                Id = reader.GetGuid(0),
                FileName = reader.GetString(1),
                ContentLength = reader.GetInt32(2),
                CreatedAtUtc = reader.GetDateTime(3),
                UpdatedAtUtc = reader.GetDateTime(4),
                UpdatedByUserId = reader.GetString(5)
            });
        }

        return results;
    }

    public async Task<TerraformFileDetailDto?> GetAsync(Guid organizationId, Guid fileId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "SELECT id, file_name, content, created_at_utc, updated_at_utc, updated_by_user_id " +
            "FROM terraform_files WHERE id = @id AND organization_id = @orgId",
            connection);

        command.Parameters.AddWithValue("id", fileId);
        command.Parameters.AddWithValue("orgId", organizationId);

        await using var reader = await command.ExecuteReaderAsync();

        if (!await reader.ReadAsync())
            return null;

        var content = reader.GetString(2);

        return new TerraformFileDetailDto
        {
            Id = reader.GetGuid(0),
            FileName = reader.GetString(1),
            Content = content,
            ContentLength = content.Length,
            CreatedAtUtc = reader.GetDateTime(3),
            UpdatedAtUtc = reader.GetDateTime(4),
            UpdatedByUserId = reader.GetString(5)
        };
    }

    public async Task<(bool Success, string? Error, TerraformFileDetailDto? File)> CreateAsync(
        Guid organizationId, string userId, string? fileName, string? content)
    {
        var (valid, error) = ValidateFileName(fileName);

        if (!valid)
            return (false, error, null);

        await using var connection = await OpenAsync();

        var id = Guid.NewGuid();

        await using (var existsCommand = new NpgsqlCommand(
            "SELECT 1 FROM terraform_files WHERE organization_id = @orgId AND file_name = @fileName", connection))
        {
            existsCommand.Parameters.AddWithValue("orgId", organizationId);
            existsCommand.Parameters.AddWithValue("fileName", fileName!.Trim());

            if (await existsCommand.ExecuteScalarAsync() != null)
                return (false, "A file with that name already exists.", null);
        }

        await using (var command = new NpgsqlCommand(
            "INSERT INTO terraform_files (id, organization_id, file_name, content, created_by_user_id, updated_by_user_id) " +
            "VALUES (@id, @orgId, @fileName, @content, @userId, @userId)",
            connection))
        {
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("orgId", organizationId);
            command.Parameters.AddWithValue("fileName", fileName.Trim());
            command.Parameters.AddWithValue("content", content ?? string.Empty);
            command.Parameters.AddWithValue("userId", userId);

            await command.ExecuteNonQueryAsync();
        }

        return (true, null, await GetAsync(organizationId, id));
    }

    public async Task<bool> UpdateAsync(Guid organizationId, Guid fileId, string userId, string? content)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "UPDATE terraform_files SET content = @content, updated_by_user_id = @userId, updated_at_utc = now() " +
            "WHERE id = @id AND organization_id = @orgId",
            connection);

        command.Parameters.AddWithValue("content", content ?? string.Empty);
        command.Parameters.AddWithValue("userId", userId);
        command.Parameters.AddWithValue("id", fileId);
        command.Parameters.AddWithValue("orgId", organizationId);

        var rows = await command.ExecuteNonQueryAsync();
        return rows > 0;
    }

    public async Task<bool> DeleteAsync(Guid organizationId, Guid fileId)
    {
        await using var connection = await OpenAsync();

        await using var command = new NpgsqlCommand(
            "DELETE FROM terraform_files WHERE id = @id AND organization_id = @orgId", connection);

        command.Parameters.AddWithValue("id", fileId);
        command.Parameters.AddWithValue("orgId", organizationId);

        var rows = await command.ExecuteNonQueryAsync();
        return rows > 0;
    }
}

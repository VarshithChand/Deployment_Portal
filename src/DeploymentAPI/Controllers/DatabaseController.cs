using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Settings -> Database. Every action here runs through AdminGate.
// DenyUnlessSuperAdminAsync, NOT the regular DenyUnlessAdminAsync — being on
// the general admin allowlist is explicitly not enough for this feature, it
// is restricted to one specific GitHub identity (see AdminGate). The browser
// never talks to Postgres directly: every query/mutation goes through
// DatabaseManagementService, which validates every table/column identifier
// against real database metadata (or a strict regex for brand-new
// identifiers) before it ever reaches a SQL string, and always binds values
// as parameters. There is no "run arbitrary SQL" endpoint anywhere here.
//
// This page never auto-connects using this app's own DATABASE_URL, even for
// the super-admin - it requires the same explicit database credential the
// Hosting Providers -> Database tab can connect (see
// SettingsService.GetPortalDatabaseConnectionAsync / Settings > Credentials
// > Database), resolved fresh on every request and always passed explicitly
// to DatabaseManagementService. That's a deliberate difference from the
// Hosting Providers tab, which DOES fall back to DATABASE_URL by default -
// this page is the admin's own database *management* console (row edit/
// insert/delete, table creation), so it stays consistent with every other
// credential in this app: nothing is ever implicitly connected, even for
// the person who could technically reach it anyway.
[ApiController]
[Route("api/database")]
public class DatabaseController : ControllerBase
{
    private const string NotConnectedMessage =
        "Not connected — connect a database credential in Settings → Credentials → Database first.";

    private readonly DatabaseManagementService _db;
    private readonly SettingsService _settings;
    private readonly ActivityLogService _log;

    public DatabaseController(DatabaseManagementService db, SettingsService settings, ActivityLogService log)
    {
        _db = db;
        _settings = settings;
        _log = log;
    }

    // Mutations are logged with WHAT happened (actor/action/table/result),
    // never the actual row values — those can hold arbitrary application
    // data, which is exactly the "sensitive field values" the audit log is
    // required to never capture.
    private void AppendAuditLog(string actor, string action, string resource, bool success, string? detail)
    {
        var outcome = success ? "succeeded" : "failed";
        var suffix = string.IsNullOrWhiteSpace(detail) ? "" : $" ({detail})";

        if (success)
            _log.LogInfo("Database", $"{actor} — {action} on \"{resource}\" {outcome}{suffix}");
        else
            _log.LogError("Database", $"{actor} — {action} on \"{resource}\" {outcome}{suffix}");
    }

    private async Task<string> ResolveActorAsync() =>
        await AdminGate.ResolveCallerLoginAsync(this) ?? "unknown";

    // The one place this controller ever decides what database it's
    // talking to - the explicitly-connected portal credential, or nothing.
    // No DATABASE_URL fallback here on purpose (see class comment).
    private async Task<string?> ResolveConnectionStringAsync()
    {
        var (_, connectionString) = await _settings.GetPortalDatabaseConnectionAsync();
        return string.IsNullOrWhiteSpace(connectionString) ? null : connectionString;
    }

    [HttpGet("health")]
    public async Task<IActionResult> GetHealth()
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "view database health");
        if (denied != null) return denied;

        var connectionString = await ResolveConnectionStringAsync();

        if (connectionString == null)
            return Ok(new DatabaseInspectionHealthDto { Connected = false, Error = NotConnectedMessage });

        return Ok(await _db.GetHealthAsync(connectionString));
    }

    [HttpGet("schemas")]
    public async Task<IActionResult> GetSchemas()
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "view schemas");
        if (denied != null) return denied;

        var connectionString = await ResolveConnectionStringAsync();

        return Ok(connectionString == null ? new DatabaseSchemaListDto() : await _db.GetSchemasAsync(connectionString));
    }

    [HttpGet("tables")]
    public async Task<IActionResult> GetTables([FromQuery] string? schema)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "view tables");
        if (denied != null) return denied;

        var connectionString = await ResolveConnectionStringAsync();

        return Ok(connectionString == null ? new DatabaseTableListDto() : await _db.GetTablesAsync(schema, connectionString));
    }

    [HttpGet("overview")]
    public async Task<IActionResult> GetOverview()
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "view the database overview");
        if (denied != null) return denied;

        var connectionString = await ResolveConnectionStringAsync();

        return Ok(await _db.GetOverviewAsync(connectionString));
    }

    [HttpGet("tables/{schema}/{table}")]
    public async Task<IActionResult> GetTableDetail(string schema, string table)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "view table structure");
        if (denied != null) return denied;

        var connectionString = await ResolveConnectionStringAsync();

        if (connectionString == null)
            return NotFound(new { message = NotConnectedMessage });

        var detail = await _db.GetTableDetailAsync(schema, table, connectionString);
        return detail == null ? NotFound(new { message = "Table not found." }) : Ok(detail);
    }

    [HttpGet("tables/{schema}/{table}/rows")]
    public async Task<IActionResult> GetRows(string schema, string table, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] string? search = null)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "browse table data");
        if (denied != null) return denied;

        var connectionString = await ResolveConnectionStringAsync();

        if (connectionString == null)
            return Ok(new DatabaseRowsResultDto { Page = page, PageSize = pageSize, Error = NotConnectedMessage });

        return Ok(await _db.GetRowsAsync(schema, table, page, pageSize, search, connectionString));
    }

    [HttpPost("rows")]
    public async Task<IActionResult> InsertRow([FromBody] DatabaseInsertRowRequestDto request)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "insert a row");
        if (denied != null) return denied;

        var connectionString = await ResolveConnectionStringAsync();

        if (connectionString == null)
            return Ok(new DatabaseMutationResultDto { Success = false, Error = NotConnectedMessage });

        var actor = await ResolveActorAsync();
        var result = await _db.InsertRowAsync(request, connectionString);

        AppendAuditLog(actor, "Insert row", $"{request.Schema}.{request.Table}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpPut("rows")]
    public async Task<IActionResult> UpdateRow([FromBody] DatabaseUpdateRowRequestDto request)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "edit a row");
        if (denied != null) return denied;

        var connectionString = await ResolveConnectionStringAsync();

        if (connectionString == null)
            return Ok(new DatabaseMutationResultDto { Success = false, Error = NotConnectedMessage });

        var actor = await ResolveActorAsync();
        var result = await _db.UpdateRowAsync(request, connectionString);

        AppendAuditLog(actor, "Update row", $"{request.Schema}.{request.Table}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("rows")]
    public async Task<IActionResult> DeleteRow([FromBody] DatabaseDeleteRowRequestDto request)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "delete a row");
        if (denied != null) return denied;

        var connectionString = await ResolveConnectionStringAsync();

        if (connectionString == null)
            return Ok(new DatabaseMutationResultDto { Success = false, Error = NotConnectedMessage });

        var actor = await ResolveActorAsync();
        var result = await _db.DeleteRowAsync(request, connectionString);

        AppendAuditLog(actor, "Delete row", $"{request.Schema}.{request.Table}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("tables")]
    public async Task<IActionResult> CreateTable([FromBody] DatabaseCreateTableRequestDto request)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "create a table");
        if (denied != null) return denied;

        var connectionString = await ResolveConnectionStringAsync();

        if (connectionString == null)
            return Ok(new DatabaseMutationResultDto { Success = false, Error = NotConnectedMessage });

        var actor = await ResolveActorAsync();
        var result = await _db.CreateTableAsync(request, connectionString);

        AppendAuditLog(actor, "Create table", $"{request.Schema}.{request.TableName}", result.Success, result.Error);

        return Ok(result);
    }
}

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
[ApiController]
[Route("api/database")]
public class DatabaseController : ControllerBase
{
    private readonly DatabaseManagementService _db;
    private readonly ActivityLogService _log;

    public DatabaseController(DatabaseManagementService db, ActivityLogService log)
    {
        _db = db;
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

    [HttpGet("health")]
    public async Task<IActionResult> GetHealth()
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "view database health");
        if (denied != null) return denied;

        return Ok(await _db.GetHealthAsync());
    }

    [HttpGet("schemas")]
    public async Task<IActionResult> GetSchemas()
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "view schemas");
        if (denied != null) return denied;

        return Ok(await _db.GetSchemasAsync());
    }

    [HttpGet("tables")]
    public async Task<IActionResult> GetTables([FromQuery] string? schema)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "view tables");
        if (denied != null) return denied;

        return Ok(await _db.GetTablesAsync(schema));
    }

    [HttpGet("overview")]
    public async Task<IActionResult> GetOverview()
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "view the database overview");
        if (denied != null) return denied;

        return Ok(await _db.GetOverviewAsync());
    }

    [HttpGet("tables/{schema}/{table}")]
    public async Task<IActionResult> GetTableDetail(string schema, string table)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "view table structure");
        if (denied != null) return denied;

        var detail = await _db.GetTableDetailAsync(schema, table);
        return detail == null ? NotFound(new { message = "Table not found." }) : Ok(detail);
    }

    [HttpGet("tables/{schema}/{table}/rows")]
    public async Task<IActionResult> GetRows(string schema, string table, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] string? search = null)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "browse table data");
        if (denied != null) return denied;

        return Ok(await _db.GetRowsAsync(schema, table, page, pageSize, search));
    }

    [HttpPost("rows")]
    public async Task<IActionResult> InsertRow([FromBody] DatabaseInsertRowRequestDto request)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "insert a row");
        if (denied != null) return denied;

        var actor = await ResolveActorAsync();
        var result = await _db.InsertRowAsync(request);

        AppendAuditLog(actor, "Insert row", $"{request.Schema}.{request.Table}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpPut("rows")]
    public async Task<IActionResult> UpdateRow([FromBody] DatabaseUpdateRowRequestDto request)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "edit a row");
        if (denied != null) return denied;

        var actor = await ResolveActorAsync();
        var result = await _db.UpdateRowAsync(request);

        AppendAuditLog(actor, "Update row", $"{request.Schema}.{request.Table}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("rows")]
    public async Task<IActionResult> DeleteRow([FromBody] DatabaseDeleteRowRequestDto request)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "delete a row");
        if (denied != null) return denied;

        var actor = await ResolveActorAsync();
        var result = await _db.DeleteRowAsync(request);

        AppendAuditLog(actor, "Delete row", $"{request.Schema}.{request.Table}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("tables")]
    public async Task<IActionResult> CreateTable([FromBody] DatabaseCreateTableRequestDto request)
    {
        var denied = await AdminGate.DenyUnlessSuperAdminAsync(this, "create a table");
        if (denied != null) return denied;

        var actor = await ResolveActorAsync();
        var result = await _db.CreateTableAsync(request);

        AppendAuditLog(actor, "Create table", $"{request.Schema}.{request.TableName}", result.Success, result.Error);

        return Ok(result);
    }
}

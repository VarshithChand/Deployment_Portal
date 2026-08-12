using System.Text.Json;

namespace DeploymentAPI.DTOs;

// Every DTO backing Settings -> Database (see DatabaseManagementService /
// DatabaseController). Deliberately generic — this app's real Postgres
// footprint today is a single JSONB-blob table (portal_settings), so none
// of this assumes any particular schema; everything here is shaped by what
// information_schema/pg_catalog actually reports at request time.

// Named distinctly from the existing DatabaseHealthDto (Smoke Tests' own
// simple connectivity check) — this one backs the richer Settings ->
// Database health card (version, size, table count, masked connection),
// a different shape for a different page.
public class DatabaseInspectionHealthDto
{
    public bool Connected { get; set; }
    public string? Error { get; set; }
    public string? Version { get; set; }
    public string? DatabaseName { get; set; }
    public string? CurrentSchema { get; set; }
    public int TableCount { get; set; }
    public string? DatabaseSizePretty { get; set; }
    public long LatencyMs { get; set; }

    // Masked connection info — host/port/database name only, never the
    // username or password (see spec's "never expose credentials" rule).
    public string? MaskedConnection { get; set; }
}

public class DatabaseSchemaListDto
{
    public List<string> Schemas { get; set; } = new();
    public string DefaultSchema { get; set; } = "public";
}

public class DatabaseTableSummaryDto
{
    public string Schema { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public long ApproxRowCount { get; set; }
    public int ColumnCount { get; set; }
    public string? SizePretty { get; set; }
    public bool HasPrimaryKey { get; set; }
}

public class DatabaseTableListDto
{
    public List<DatabaseTableSummaryDto> Tables { get; set; } = new();
}

public class DatabaseColumnDto
{
    public string Name { get; set; } = string.Empty;
    public string DataType { get; set; } = string.Empty;
    public bool IsNullable { get; set; }
    public string? DefaultValue { get; set; }
    public bool IsPrimaryKey { get; set; }
    public int OrdinalPosition { get; set; }
}

public class DatabaseIndexDto
{
    public string Name { get; set; } = string.Empty;
    public List<string> Columns { get; set; } = new();
    public bool IsUnique { get; set; }
    public bool IsPrimary { get; set; }
}

public class DatabaseForeignKeyDto
{
    public string ConstraintName { get; set; } = string.Empty;
    public string Column { get; set; } = string.Empty;
    public string ForeignSchema { get; set; } = string.Empty;
    public string ForeignTable { get; set; } = string.Empty;
    public string ForeignColumn { get; set; } = string.Empty;
}

public class DatabaseUniqueConstraintDto
{
    public string ConstraintName { get; set; } = string.Empty;
    public List<string> Columns { get; set; } = new();
}

public class DatabaseTableDetailDto
{
    public string Schema { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public List<DatabaseColumnDto> Columns { get; set; } = new();
    public List<string> PrimaryKeyColumns { get; set; } = new();
    public List<DatabaseForeignKeyDto> ForeignKeys { get; set; } = new();
    public List<DatabaseUniqueConstraintDto> UniqueConstraints { get; set; } = new();
    public List<DatabaseIndexDto> Indexes { get; set; } = new();
    public long ApproxRowCount { get; set; }
    public string? SizePretty { get; set; }
}

// Row values are returned as plain strings (already formatted server-side)
// rather than typed objects — the frontend renders a dynamic table and
// never needs to know Postgres types to display them; NULL is represented
// as a real null so the UI can render it distinctly from an empty string.
public class DatabaseRowsResultDto
{
    public List<string> Columns { get; set; } = new();
    public List<Dictionary<string, string?>> Rows { get; set; } = new();
    public long TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public string? Error { get; set; }
}

public class DatabaseMutationResultDto
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public string? Message { get; set; }
}

public class DatabaseNewColumnDto
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public bool Nullable { get; set; } = true;
    public bool PrimaryKey { get; set; }
    public string? DefaultValue { get; set; }
}

public class DatabaseCreateTableRequestDto
{
    public string Schema { get; set; } = "public";
    public string TableName { get; set; } = string.Empty;
    public List<DatabaseNewColumnDto> Columns { get; set; } = new();
}

public class DatabaseInsertRowRequestDto
{
    public string Schema { get; set; } = "public";
    public string Table { get; set; } = string.Empty;
    public Dictionary<string, JsonElement> Values { get; set; } = new();
}

public class DatabaseUpdateRowRequestDto
{
    public string Schema { get; set; } = "public";
    public string Table { get; set; } = string.Empty;
    public string PrimaryKeyColumn { get; set; } = string.Empty;
    public string PrimaryKeyValue { get; set; } = string.Empty;
    public Dictionary<string, JsonElement> Values { get; set; } = new();
}

public class DatabaseDeleteRowRequestDto
{
    public string Schema { get; set; } = "public";
    public string Table { get; set; } = string.Empty;
    public string PrimaryKeyColumn { get; set; } = string.Empty;
    public string PrimaryKeyValue { get; set; } = string.Empty;
}

public class DatabaseApplicationTableStatusDto
{
    public string Name { get; set; } = string.Empty;
    public bool Exists { get; set; }
    public string Note { get; set; } = string.Empty;
}

public class DatabaseOverviewDto
{
    public List<DatabaseApplicationTableStatusDto> ApplicationTables { get; set; } = new();
    public string MigrationStatus { get; set; } = string.Empty;
}

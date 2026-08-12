using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using DeploymentAPI.DTOs;
using Npgsql;
using NpgsqlTypes;

namespace DeploymentAPI.Services;

// Backs Settings -> Database (see DatabaseController). Reuses the exact
// DATABASE_URL connection string SettingsService already parses — this
// service never touches DATABASE_URL itself, so there's only ever one place
// that turns it into a connection string. Every query here is either a
// read against information_schema/pg_catalog (safe, no user input in the
// SQL text) or a mutation whose table/column identifiers have just been
// checked against that same real metadata (or, for CREATE TABLE's brand
// new identifiers, a strict regex) before being quoted into the SQL text —
// values are always sent as bound parameters, never interpolated. There is
// deliberately no path anywhere in this file that runs arbitrary,
// caller-supplied SQL.
public class DatabaseManagementService
{
    private readonly string? _connectionString;

    private static readonly Regex IdentifierRegex = new(@"^[a-zA-Z_][a-zA-Z0-9_]{0,62}$", RegexOptions.Compiled);

    private static readonly HashSet<string> AllowedColumnTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "text", "varchar", "char", "integer", "smallint", "bigint", "boolean",
        "numeric", "real", "double precision", "uuid", "json", "jsonb",
        "date", "timestamp", "timestamptz", "time"
    };

    private static readonly HashSet<string> SafeDefaultExpressions = new(StringComparer.OrdinalIgnoreCase)
    {
        "current_timestamp", "current_date", "now()", "gen_random_uuid()", "true", "false"
    };

    // The one table this application's own code actually creates (see
    // SettingsService.HydrateLocalFileFromDatabaseAsync's
    // "CREATE TABLE IF NOT EXISTS portal_settings") — the "Application
    // Tables" cross-reference is built from this, not an invented list.
    private static readonly string[] KnownApplicationTables = { "portal_settings" };

    public DatabaseManagementService(SettingsService settings)
    {
        _connectionString = settings.GetDatabaseConnectionString();
    }

    public bool IsConfigured => !string.IsNullOrEmpty(_connectionString);

    private async Task<NpgsqlConnection> OpenAsync()
    {
        var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();
        return conn;
    }

    private static string QuoteIdent(string ident) => "\"" + ident.Replace("\"", "\"\"") + "\"";

    private static bool IsValidNewIdentifier(string? name) =>
        !string.IsNullOrWhiteSpace(name) && IdentifierRegex.IsMatch(name);

    // ---- Health -----------------------------------------------------

    public async Task<DatabaseInspectionHealthDto> GetHealthAsync()
    {
        if (!IsConfigured)
        {
            return new DatabaseInspectionHealthDto
            {
                Connected = false,
                Error = "DATABASE_URL is not configured — this deployment is running on the local settings file, which has no relational database to inspect."
            };
        }

        var stopwatch = Stopwatch.StartNew();

        try
        {
            await using var conn = await OpenAsync();

            await using (var pingCommand = new NpgsqlCommand("SELECT 1", conn))
                await pingCommand.ExecuteScalarAsync();

            stopwatch.Stop();

            string? version = null;
            string? dbName = null;
            string? currentSchema = null;
            string? sizePretty = null;
            var tableCount = 0;

            await using (var cmd = new NpgsqlCommand(
                "SELECT version(), current_database(), current_schema(), " +
                "pg_size_pretty(pg_database_size(current_database())), " +
                "(SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
                " WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') " +
                " AND n.nspname NOT LIKE 'pg\\_toast%' AND n.nspname NOT LIKE 'pg\\_temp%')",
                conn))
            await using (var reader = await cmd.ExecuteReaderAsync())
            {
                if (await reader.ReadAsync())
                {
                    version = reader.IsDBNull(0) ? null : reader.GetString(0);
                    dbName = reader.IsDBNull(1) ? null : reader.GetString(1);
                    currentSchema = reader.IsDBNull(2) ? null : reader.GetString(2);
                    sizePretty = reader.IsDBNull(3) ? null : reader.GetString(3);
                    tableCount = reader.IsDBNull(4) ? 0 : Convert.ToInt32(reader.GetValue(4));
                }
            }

            return new DatabaseInspectionHealthDto
            {
                Connected = true,
                Version = version,
                DatabaseName = dbName,
                CurrentSchema = currentSchema,
                DatabaseSizePretty = sizePretty,
                TableCount = tableCount,
                LatencyMs = stopwatch.ElapsedMilliseconds,
                MaskedConnection = BuildMaskedConnection()
            };
        }
        catch (Exception ex)
        {
            return new DatabaseInspectionHealthDto { Connected = false, Error = ex.Message };
        }
    }

    // Host/port/database name only — never the username or password (see
    // section on never exposing credentials to the frontend).
    private string? BuildMaskedConnection()
    {
        if (_connectionString == null) return null;

        try
        {
            var builder = new NpgsqlConnectionStringBuilder(_connectionString);
            return $"{builder.Host}:{builder.Port}/{builder.Database}";
        }
        catch
        {
            return null;
        }
    }

    // ---- Schemas / tables --------------------------------------------

    public async Task<DatabaseSchemaListDto> GetSchemasAsync()
    {
        var result = new DatabaseSchemaListDto();

        if (!IsConfigured) return result;

        await using var conn = await OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT schema_name FROM information_schema.schemata " +
            "WHERE schema_name NOT IN ('pg_catalog','information_schema') " +
            "AND schema_name NOT LIKE 'pg\\_toast%' AND schema_name NOT LIKE 'pg\\_temp%' " +
            "ORDER BY schema_name", conn);

        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
            result.Schemas.Add(reader.GetString(0));

        return result;
    }

    private async Task<bool> SchemaExistsAsync(NpgsqlConnection conn, string schema)
    {
        await using var cmd = new NpgsqlCommand(
            "SELECT 1 FROM information_schema.schemata WHERE schema_name = @s", conn);
        cmd.Parameters.AddWithValue("s", schema);
        return await cmd.ExecuteScalarAsync() != null;
    }

    private async Task<bool> TableExistsAsync(NpgsqlConnection conn, string schema, string table)
    {
        await using var cmd = new NpgsqlCommand(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = @s AND table_name = @t " +
            "AND table_type = 'BASE TABLE'", conn);
        cmd.Parameters.AddWithValue("s", schema);
        cmd.Parameters.AddWithValue("t", table);
        return await cmd.ExecuteScalarAsync() != null;
    }

    // column_name -> data_type, straight from information_schema — the
    // source of truth every mutating method below validates caller-supplied
    // column names against before building any SQL.
    private async Task<Dictionary<string, string>> GetColumnTypesAsync(NpgsqlConnection conn, string schema, string table)
    {
        var result = new Dictionary<string, string>();

        await using var cmd = new NpgsqlCommand(
            "SELECT column_name, data_type FROM information_schema.columns " +
            "WHERE table_schema = @s AND table_name = @t", conn);
        cmd.Parameters.AddWithValue("s", schema);
        cmd.Parameters.AddWithValue("t", table);

        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
            result[reader.GetString(0)] = reader.GetString(1);

        return result;
    }

    private async Task<List<string>> GetPrimaryKeyColumnsAsync(NpgsqlConnection conn, string schema, string table)
    {
        var result = new List<string>();

        await using var cmd = new NpgsqlCommand(
            "SELECT kcu.column_name FROM information_schema.table_constraints tc " +
            "JOIN information_schema.key_column_usage kcu " +
            "  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema " +
            "WHERE tc.table_schema = @s AND tc.table_name = @t AND tc.constraint_type = 'PRIMARY KEY' " +
            "ORDER BY kcu.ordinal_position", conn);
        cmd.Parameters.AddWithValue("s", schema);
        cmd.Parameters.AddWithValue("t", table);

        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
            result.Add(reader.GetString(0));

        return result;
    }

    public async Task<DatabaseTableListDto> GetTablesAsync(string? schema)
    {
        var result = new DatabaseTableListDto();

        if (!IsConfigured) return result;

        var resolvedSchema = string.IsNullOrWhiteSpace(schema) ? "public" : schema;

        await using var conn = await OpenAsync();

        if (!await SchemaExistsAsync(conn, resolvedSchema))
            return result;

        await using var cmd = new NpgsqlCommand(
            "SELECT c.relname, n.nspname, " +
            "COALESCE(s.n_live_tup, GREATEST(c.reltuples::bigint, 0)) AS approx_rows, " +
            "pg_size_pretty(pg_total_relation_size(c.oid)), " +
            "(SELECT COUNT(*) FROM information_schema.columns col " +
            " WHERE col.table_schema = n.nspname AND col.table_name = c.relname), " +
            "EXISTS (SELECT 1 FROM information_schema.table_constraints tc " +
            " WHERE tc.table_schema = n.nspname AND tc.table_name = c.relname AND tc.constraint_type = 'PRIMARY KEY') " +
            "FROM pg_class c " +
            "JOIN pg_namespace n ON n.oid = c.relnamespace " +
            "LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid " +
            "WHERE c.relkind IN ('r','p') AND n.nspname = @schema " +
            "ORDER BY c.relname", conn);

        cmd.Parameters.AddWithValue("schema", resolvedSchema);

        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            result.Tables.Add(new DatabaseTableSummaryDto
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                ApproxRowCount = reader.IsDBNull(2) ? 0 : Convert.ToInt64(reader.GetValue(2)),
                SizePretty = reader.IsDBNull(3) ? null : reader.GetString(3),
                ColumnCount = reader.IsDBNull(4) ? 0 : Convert.ToInt32(reader.GetValue(4)),
                HasPrimaryKey = !reader.IsDBNull(5) && reader.GetBoolean(5)
            });
        }

        return result;
    }

    public async Task<DatabaseTableDetailDto?> GetTableDetailAsync(string schema, string table)
    {
        if (!IsConfigured) return null;

        await using var conn = await OpenAsync();

        if (!await TableExistsAsync(conn, schema, table))
            return null;

        var detail = new DatabaseTableDetailDto { Schema = schema, Name = table };

        var pkColumns = await GetPrimaryKeyColumnsAsync(conn, schema, table);
        detail.PrimaryKeyColumns = pkColumns;

        await using (var cmd = new NpgsqlCommand(
            "SELECT column_name, data_type, is_nullable, column_default, ordinal_position " +
            "FROM information_schema.columns WHERE table_schema = @s AND table_name = @t " +
            "ORDER BY ordinal_position", conn))
        {
            cmd.Parameters.AddWithValue("s", schema);
            cmd.Parameters.AddWithValue("t", table);

            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var name = reader.GetString(0);

                detail.Columns.Add(new DatabaseColumnDto
                {
                    Name = name,
                    DataType = reader.GetString(1),
                    IsNullable = reader.GetString(2) == "YES",
                    DefaultValue = reader.IsDBNull(3) ? null : reader.GetString(3),
                    OrdinalPosition = reader.GetInt32(4),
                    IsPrimaryKey = pkColumns.Contains(name)
                });
            }
        }

        await using (var cmd = new NpgsqlCommand(
            "SELECT tc.constraint_name, kcu.column_name, ccu.table_schema, ccu.table_name, ccu.column_name " +
            "FROM information_schema.table_constraints tc " +
            "JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema " +
            "JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema " +
            "WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = @s AND tc.table_name = @t", conn))
        {
            cmd.Parameters.AddWithValue("s", schema);
            cmd.Parameters.AddWithValue("t", table);

            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                detail.ForeignKeys.Add(new DatabaseForeignKeyDto
                {
                    ConstraintName = reader.GetString(0),
                    Column = reader.GetString(1),
                    ForeignSchema = reader.GetString(2),
                    ForeignTable = reader.GetString(3),
                    ForeignColumn = reader.GetString(4)
                });
            }
        }

        var uniqueGroups = new Dictionary<string, DatabaseUniqueConstraintDto>();

        await using (var cmd = new NpgsqlCommand(
            "SELECT tc.constraint_name, kcu.column_name FROM information_schema.table_constraints tc " +
            "JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema " +
            "WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = @s AND tc.table_name = @t " +
            "ORDER BY tc.constraint_name, kcu.ordinal_position", conn))
        {
            cmd.Parameters.AddWithValue("s", schema);
            cmd.Parameters.AddWithValue("t", table);

            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var name = reader.GetString(0);

                if (!uniqueGroups.TryGetValue(name, out var group))
                {
                    group = new DatabaseUniqueConstraintDto { ConstraintName = name };
                    uniqueGroups[name] = group;
                    detail.UniqueConstraints.Add(group);
                }

                group.Columns.Add(reader.GetString(1));
            }
        }

        await using (var cmd = new NpgsqlCommand(
            "SELECT ic.relname, ix.indisunique, ix.indisprimary, " +
            "(SELECT array_agg(a.attname ORDER BY x.ord) FROM unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ord) " +
            " JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = x.attnum) " +
            "FROM pg_index ix " +
            "JOIN pg_class ic ON ic.oid = ix.indexrelid " +
            "JOIN pg_class tcls ON tcls.oid = ix.indrelid " +
            "JOIN pg_namespace n ON n.oid = tcls.relnamespace " +
            "WHERE n.nspname = @s AND tcls.relname = @t ORDER BY ic.relname", conn))
        {
            cmd.Parameters.AddWithValue("s", schema);
            cmd.Parameters.AddWithValue("t", table);

            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                detail.Indexes.Add(new DatabaseIndexDto
                {
                    Name = reader.GetString(0),
                    IsUnique = reader.GetBoolean(1),
                    IsPrimary = reader.GetBoolean(2),
                    Columns = reader.IsDBNull(3) ? new List<string>() : ((string[])reader.GetValue(3)).ToList()
                });
            }
        }

        await using (var cmd = new NpgsqlCommand(
            "SELECT pg_size_pretty(pg_total_relation_size(quote_ident(@s) || '.' || quote_ident(@t))), " +
            "COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname = @s AND relname = @t), 0)", conn))
        {
            cmd.Parameters.AddWithValue("s", schema);
            cmd.Parameters.AddWithValue("t", table);

            await using var reader = await cmd.ExecuteReaderAsync();

            if (await reader.ReadAsync())
            {
                detail.SizePretty = reader.IsDBNull(0) ? null : reader.GetString(0);
                detail.ApproxRowCount = reader.IsDBNull(1) ? 0 : Convert.ToInt64(reader.GetValue(1));
            }
        }

        return detail;
    }

    // ---- Row browsing (server-side pagination — the one explicit,
    // scoped exception to this project's otherwise client-side pagination
    // policy, since a Postgres table can be arbitrarily large) ----------

    public async Task<DatabaseRowsResultDto> GetRowsAsync(string schema, string table, int page, int pageSize, string? search)
    {
        var result = new DatabaseRowsResultDto { Page = page, PageSize = pageSize };

        if (!IsConfigured)
        {
            result.Error = "Database is not configured.";
            return result;
        }

        await using var conn = await OpenAsync();

        if (!await TableExistsAsync(conn, schema, table))
        {
            result.Error = "Table not found.";
            return result;
        }

        var columnTypes = await GetColumnTypesAsync(conn, schema, table);
        var columns = columnTypes.Keys.ToList();
        result.Columns = columns;

        if (columns.Count == 0)
            return result;

        var pkColumns = await GetPrimaryKeyColumnsAsync(conn, schema, table);
        var orderBy = (pkColumns.Count > 0 ? pkColumns : columns)
            .Select(QuoteIdent);

        var whereClause = "";

        if (!string.IsNullOrWhiteSpace(search))
        {
            var casts = columns.Select(c => $"CAST({QuoteIdent(c)} AS TEXT) ILIKE @search");
            whereClause = " WHERE " + string.Join(" OR ", casts);
        }

        await using (var countCmd = new NpgsqlCommand(
            $"SELECT COUNT(*) FROM {QuoteIdent(schema)}.{QuoteIdent(table)}{whereClause}", conn))
        {
            if (!string.IsNullOrWhiteSpace(search))
                countCmd.Parameters.AddWithValue("search", $"%{search}%");

            result.TotalCount = Convert.ToInt64(await countCmd.ExecuteScalarAsync());
        }

        var safePageSize = Math.Clamp(pageSize <= 0 ? 50 : pageSize, 1, 200);
        var safePage = Math.Max(page, 1);
        var offset = (safePage - 1) * safePageSize;

        var selectSql = $"SELECT {string.Join(", ", columns.Select(QuoteIdent))} " +
            $"FROM {QuoteIdent(schema)}.{QuoteIdent(table)}{whereClause} " +
            $"ORDER BY {string.Join(", ", orderBy)} LIMIT @limit OFFSET @offset";

        await using (var cmd = new NpgsqlCommand(selectSql, conn))
        {
            if (!string.IsNullOrWhiteSpace(search))
                cmd.Parameters.AddWithValue("search", $"%{search}%");

            cmd.Parameters.AddWithValue("limit", safePageSize);
            cmd.Parameters.AddWithValue("offset", offset);

            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var row = new Dictionary<string, string?>();

                for (var i = 0; i < columns.Count; i++)
                    row[columns[i]] = FormatCellValue(reader.IsDBNull(i) ? null : reader.GetValue(i));

                result.Rows.Add(row);
            }
        }

        return result;
    }

    // Booleans are lower-cased ("true"/"false", not C#'s default "True"/
    // "False") so a value read back here round-trips cleanly into the
    // row-edit form's <option value="true"/"false"> without a case
    // mismatch leaving the dropdown looking unset.
    private static string? FormatCellValue(object? raw) => raw switch
    {
        null => null,
        bool b => b ? "true" : "false",
        DateTime dt => dt.ToString("o"),
        DateTimeOffset dto => dto.ToString("o"),
        byte[] bytes => Convert.ToBase64String(bytes),
        _ => raw.ToString()
    };

    // ---- Row mutations --------------------------------------------------

    public async Task<DatabaseMutationResultDto> InsertRowAsync(DatabaseInsertRowRequestDto request)
    {
        if (!IsConfigured) return Fail("Database is not configured.");
        if (request.Values.Count == 0) return Fail("No values provided.");

        await using var conn = await OpenAsync();

        if (!await TableExistsAsync(conn, request.Schema, request.Table))
            return Fail("Table not found.");

        var columnTypes = await GetColumnTypesAsync(conn, request.Schema, request.Table);
        var unknown = request.Values.Keys.Where(k => !columnTypes.ContainsKey(k)).ToList();

        if (unknown.Count > 0)
            return Fail($"Unknown column(s): {string.Join(", ", unknown)}");

        var columnNames = request.Values.Keys.ToList();
        var paramNames = columnNames.Select((_, i) => $"p{i}").ToList();

        var sql = $"INSERT INTO {QuoteIdent(request.Schema)}.{QuoteIdent(request.Table)} " +
            $"({string.Join(", ", columnNames.Select(QuoteIdent))}) " +
            $"VALUES ({string.Join(", ", paramNames.Select(p => "@" + p))})";

        try
        {
            await using var cmd = new NpgsqlCommand(sql, conn);

            for (var i = 0; i < columnNames.Count; i++)
                cmd.Parameters.Add(BuildParameter(paramNames[i], request.Values[columnNames[i]], columnTypes[columnNames[i]]));

            await cmd.ExecuteNonQueryAsync();
            return new DatabaseMutationResultDto { Success = true, Message = "Row inserted." };
        }
        catch (PostgresException ex)
        {
            return Fail(ex.MessageText);
        }
        catch (FormatException ex)
        {
            return Fail($"Invalid value: {ex.Message}");
        }
    }

    public async Task<DatabaseMutationResultDto> UpdateRowAsync(DatabaseUpdateRowRequestDto request)
    {
        if (!IsConfigured) return Fail("Database is not configured.");
        if (request.Values.Count == 0) return Fail("No values provided.");

        await using var conn = await OpenAsync();

        if (!await TableExistsAsync(conn, request.Schema, request.Table))
            return Fail("Table not found.");

        var columnTypes = await GetColumnTypesAsync(conn, request.Schema, request.Table);

        if (!columnTypes.ContainsKey(request.PrimaryKeyColumn))
            return Fail("Unknown primary key column.");

        var unknown = request.Values.Keys.Where(k => !columnTypes.ContainsKey(k)).ToList();

        if (unknown.Count > 0)
            return Fail($"Unknown column(s): {string.Join(", ", unknown)}");

        var columnNames = request.Values.Keys.ToList();
        var paramNames = columnNames.Select((_, i) => $"p{i}").ToList();

        var setClause = string.Join(", ", columnNames.Select((c, i) => $"{QuoteIdent(c)} = @{paramNames[i]}"));

        var sql = $"UPDATE {QuoteIdent(request.Schema)}.{QuoteIdent(request.Table)} SET {setClause} " +
            $"WHERE {QuoteIdent(request.PrimaryKeyColumn)} = @pk";

        try
        {
            await using var cmd = new NpgsqlCommand(sql, conn);

            for (var i = 0; i < columnNames.Count; i++)
                cmd.Parameters.Add(BuildParameter(paramNames[i], request.Values[columnNames[i]], columnTypes[columnNames[i]]));

            cmd.Parameters.Add(BuildStringParameter("pk", request.PrimaryKeyValue, columnTypes[request.PrimaryKeyColumn]));

            var affected = await cmd.ExecuteNonQueryAsync();

            return affected > 0
                ? new DatabaseMutationResultDto { Success = true, Message = "Row updated." }
                : Fail("No row matched the given primary key.");
        }
        catch (PostgresException ex)
        {
            return Fail(ex.MessageText);
        }
        catch (FormatException ex)
        {
            return Fail($"Invalid value: {ex.Message}");
        }
    }

    public async Task<DatabaseMutationResultDto> DeleteRowAsync(DatabaseDeleteRowRequestDto request)
    {
        if (!IsConfigured) return Fail("Database is not configured.");

        await using var conn = await OpenAsync();

        if (!await TableExistsAsync(conn, request.Schema, request.Table))
            return Fail("Table not found.");

        var columnTypes = await GetColumnTypesAsync(conn, request.Schema, request.Table);

        if (!columnTypes.ContainsKey(request.PrimaryKeyColumn))
            return Fail("Unknown primary key column.");

        var sql = $"DELETE FROM {QuoteIdent(request.Schema)}.{QuoteIdent(request.Table)} " +
            $"WHERE {QuoteIdent(request.PrimaryKeyColumn)} = @pk";

        try
        {
            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.Add(BuildStringParameter("pk", request.PrimaryKeyValue, columnTypes[request.PrimaryKeyColumn]));

            var affected = await cmd.ExecuteNonQueryAsync();

            return affected > 0
                ? new DatabaseMutationResultDto { Success = true, Message = "Row deleted." }
                : Fail("No row matched the given primary key.");
        }
        catch (PostgresException ex)
        {
            return Fail(ex.MessageText);
        }
    }

    public async Task<DatabaseMutationResultDto> CreateTableAsync(DatabaseCreateTableRequestDto request)
    {
        if (!IsConfigured) return Fail("Database is not configured.");

        if (!IsValidNewIdentifier(request.TableName))
            return Fail("Invalid table name — use letters, numbers, and underscores, starting with a letter or underscore.");

        if (request.Columns == null || request.Columns.Count == 0)
            return Fail("At least one column is required.");

        var seenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var columnDefs = new List<string>();
        var pkColumns = new List<string>();

        foreach (var col in request.Columns)
        {
            if (!IsValidNewIdentifier(col.Name))
                return Fail($"Invalid column name: '{col.Name}'.");

            if (!seenNames.Add(col.Name))
                return Fail($"Duplicate column name: '{col.Name}'.");

            if (!AllowedColumnTypes.Contains(col.Type))
                return Fail($"Unsupported column type: '{col.Type}'.");

            var def = $"{QuoteIdent(col.Name)} {col.Type.ToUpperInvariant()}";

            if (!col.Nullable)
                def += " NOT NULL";

            if (!string.IsNullOrWhiteSpace(col.DefaultValue))
            {
                if (!IsSafeDefaultExpression(col.DefaultValue))
                    return Fail($"Unsupported default value for column '{col.Name}'.");

                def += $" DEFAULT {col.DefaultValue.Trim()}";
            }

            columnDefs.Add(def);

            if (col.PrimaryKey)
                pkColumns.Add(col.Name);
        }

        var schema = string.IsNullOrWhiteSpace(request.Schema) ? "public" : request.Schema;

        await using var conn = await OpenAsync();

        if (!await SchemaExistsAsync(conn, schema))
            return Fail($"Schema '{schema}' does not exist.");

        if (await TableExistsAsync(conn, schema, request.TableName))
            return Fail($"Table '{request.TableName}' already exists in schema '{schema}'.");

        var sql = $"CREATE TABLE {QuoteIdent(schema)}.{QuoteIdent(request.TableName)} (" +
            string.Join(", ", columnDefs) +
            (pkColumns.Count > 0 ? $", PRIMARY KEY ({string.Join(", ", pkColumns.Select(QuoteIdent))})" : "") +
            ")";

        try
        {
            await using var cmd = new NpgsqlCommand(sql, conn);
            await cmd.ExecuteNonQueryAsync();
            return new DatabaseMutationResultDto { Success = true, Message = $"Table '{schema}.{request.TableName}' created." };
        }
        catch (PostgresException ex)
        {
            return Fail(ex.MessageText);
        }
    }

    // ---- Application tables / migration awareness -----------------------

    public async Task<DatabaseOverviewDto> GetOverviewAsync()
    {
        var overview = new DatabaseOverviewDto
        {
            MigrationStatus = "No migration framework (e.g. EF Core Migrations, Flyway) is used in this project. " +
                "The schema is created directly in application code — see SettingsService." +
                "HydrateLocalFileFromDatabaseAsync's `CREATE TABLE IF NOT EXISTS portal_settings` — " +
                "so there is no migration history to report."
        };

        if (!IsConfigured)
        {
            foreach (var name in KnownApplicationTables)
            {
                overview.ApplicationTables.Add(new DatabaseApplicationTableStatusDto
                {
                    Name = name,
                    Exists = false,
                    Note = "Database not configured."
                });
            }

            return overview;
        }

        await using var conn = await OpenAsync();

        foreach (var name in KnownApplicationTables)
        {
            var exists = await TableExistsAsync(conn, "public", name);

            overview.ApplicationTables.Add(new DatabaseApplicationTableStatusDto
            {
                Name = name,
                Exists = exists,
                Note = exists
                    ? "Created by SettingsService on startup when DATABASE_URL is set."
                    : "Not present — expected once DATABASE_URL is configured and the app has started at least once."
            });
        }

        return overview;
    }

    // ---- Value conversion helpers -----------------------------------

    private static NpgsqlParameter BuildParameter(string name, JsonElement el, string pgType)
    {
        var param = new NpgsqlParameter { ParameterName = name };

        if (el.ValueKind == JsonValueKind.Null)
        {
            param.Value = DBNull.Value;
            return param;
        }

        switch (pgType)
        {
            case "jsonb":
                param.NpgsqlDbType = NpgsqlDbType.Jsonb;
                param.Value = el.ValueKind == JsonValueKind.String ? el.GetString()! : el.GetRawText();
                break;

            case "json":
                param.NpgsqlDbType = NpgsqlDbType.Json;
                param.Value = el.ValueKind == JsonValueKind.String ? el.GetString()! : el.GetRawText();
                break;

            case "boolean":
                param.Value = el.ValueKind is JsonValueKind.True or JsonValueKind.False
                    ? el.GetBoolean()
                    : bool.Parse(el.GetString()!);
                break;

            case "integer":
            case "smallint":
            case "bigint":
                param.Value = el.ValueKind == JsonValueKind.Number ? el.GetInt64() : long.Parse(el.GetString()!);
                break;

            case "numeric":
            case "real":
            case "double precision":
                param.Value = el.ValueKind == JsonValueKind.Number ? el.GetDouble() : double.Parse(el.GetString()!);
                break;

            case "uuid":
                param.Value = Guid.Parse(el.GetString()!);
                break;

            case "date":
            case "timestamp without time zone":
            case "timestamp with time zone":
                param.Value = DateTime.Parse(el.GetString()!);
                break;

            default:
                param.Value = el.ValueKind == JsonValueKind.String ? el.GetString()! : el.GetRawText();
                break;
        }

        return param;
    }

    private static NpgsqlParameter BuildStringParameter(string name, string raw, string pgType)
    {
        var param = new NpgsqlParameter { ParameterName = name };

        param.Value = pgType switch
        {
            "boolean" => bool.Parse(raw),
            "integer" or "smallint" or "bigint" => long.Parse(raw),
            "numeric" or "real" or "double precision" => double.Parse(raw),
            "uuid" => Guid.Parse(raw),
            "date" or "timestamp without time zone" or "timestamp with time zone" => DateTime.Parse(raw),
            _ => raw
        };

        return param;
    }

    private static bool IsSafeDefaultExpression(string expr)
    {
        var trimmed = expr.Trim();

        if (SafeDefaultExpressions.Contains(trimmed)) return true;
        if (Regex.IsMatch(trimmed, @"^-?\d+(\.\d+)?$")) return true;
        if (Regex.IsMatch(trimmed, @"^'[^']*'$")) return true;

        return false;
    }

    private static DatabaseMutationResultDto Fail(string error) => new() { Success = false, Error = error };
}

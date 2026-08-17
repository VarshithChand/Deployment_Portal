import { useEffect, useMemo, useState } from "react";

import {
    getDatabaseHealth, getDatabaseSchemas, getDatabaseTables, getDatabaseOverview, createDatabaseTable
} from "../../services/databaseService";
import usePagination from "../../hooks/usePagination";
import useToast from "../../hooks/useToast";
import SearchBox from "../common/SearchBox";
import Pagination from "../common/Pagination";
import DatabaseTableDetail from "./DatabaseTableDetail";
import DatabaseCreateTableDialog from "./DatabaseCreateTableDialog";
import DatabaseConnectionSection from "./DatabaseConnectionSection";

const PAGE_SIZE = 10;

// Mirrors Settings' own "?view=" pattern one level deeper - "?table=" holds
// "schema.tablename" so a drilled-into table survives a reload, the same
// reason Settings itself keeps "view" in the URL rather than only in state.
function readTableFromUrl() {

    const raw = new URLSearchParams(window.location.search).get("table");
    const dotIndex = raw ? raw.indexOf(".") : -1;

    if (dotIndex <= 0 || dotIndex === raw.length - 1) {
        return null;
    }

    return { schema: raw.slice(0, dotIndex), name: raw.slice(dotIndex + 1) };

}

// Settings -> Database. Restricted server-side to one specific GitHub
// identity (see AdminGate.DenyUnlessSuperAdminAsync) - this component is
// only ever reached after Settings.jsx's own isSuperAdminSession gate, but
// every fetch below still runs into the same real 403 if that ever
// disagrees with the backend (e.g. a stale client-side check).
export default function DatabaseView() {

    const toast = useToast();

    const [health, setHealth] = useState(null);
    const [healthLoading, setHealthLoading] = useState(true);

    const [schemas, setSchemas] = useState(["public"]);
    const [schema, setSchema] = useState("public");

    const [tables, setTables] = useState([]);
    const [tablesLoading, setTablesLoading] = useState(true);

    const [overview, setOverview] = useState(null);

    const [search, setSearch] = useState("");
    const [selectedTable, setSelectedTableState] = useState(readTableFromUrl);
    const [createOpen, setCreateOpen] = useState(false);

    function selectTable(next) {

        setSelectedTableState(next);

        const url = new URL(window.location.href);

        if (next) {
            url.searchParams.set("table", `${next.schema}.${next.name}`);
        }
        else {
            url.searchParams.delete("table");
        }

        window.history.replaceState(null, "", url);

    }

    async function loadHealth() {

        try {
            setHealth(await getDatabaseHealth());
        }
        catch (err) {
            console.error(err);
            setHealth({ connected: false, error: "Unable to reach the Deployment API." });
        }
        finally {
            setHealthLoading(false);
        }

    }

    async function loadSchemas() {

        try {

            const data = await getDatabaseSchemas();
            const list = data.schemas?.length ? data.schemas : ["public"];

            setSchemas(list);

        }
        catch (err) {
            console.error(err);
        }

    }

    async function loadTables(targetSchema) {

        setTablesLoading(true);

        try {
            const data = await getDatabaseTables(targetSchema);
            setTables(data.tables || []);
        }
        catch (err) {
            console.error(err);
            toast.show("Unable to load tables.", "error");
        }
        finally {
            setTablesLoading(false);
        }

    }

    async function loadOverview() {

        try {
            setOverview(await getDatabaseOverview());
        }
        catch (err) {
            console.error(err);
        }

    }

    useEffect(() => {

        loadHealth();
        loadSchemas();
        loadOverview();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {

        loadTables(schema);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schema]);

    // Connecting/clearing the database below changes everything else on
    // this page - re-pull all of it rather than leaving stale "not
    // connected" state showing after a successful connect.
    function handleConnectionChanged() {
        loadHealth();
        loadSchemas();
        loadTables(schema);
        loadOverview();
    }

    // Client-side search + pagination over the tables list - a set of
    // tables in one schema is realistically small (this app's own database
    // has exactly one), unlike a table's actual row data below, which is
    // the one place server-side pagination is used instead (see
    // DatabaseTableDetail).
    const filtered = useMemo(() => {

        const trimmed = search.trim().toLowerCase();

        return trimmed
            ? tables.filter((t) => t.name.toLowerCase().includes(trimmed))
            : tables;

    }, [tables, search]);

    const {
        page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex
    } = usePagination(filtered, PAGE_SIZE);

    useEffect(() => {

        setPage(1);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, schema]);

    async function handleCreateTable(payload) {

        const result = await createDatabaseTable(payload.schema, payload.tableName, payload.columns);

        if (result.success) {
            toast.show(result.message || "Table created.", "success");
            setCreateOpen(false);
            loadTables(schema);
            loadOverview();
            loadHealth();
        }
        else {
            toast.show(result.error || "Failed to create table.", "error");
        }

        return result;

    }

    if (selectedTable) {

        return (
            <DatabaseTableDetail
                schema={selectedTable.schema}
                table={selectedTable.name}
                onBack={() => selectTable(null)}
            />
        );

    }

    return (

        <>

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                Live inspection and management of the PostgreSQL database backing this portal —
                restricted to a single administrator account.
            </p>

            <div className="card">
                <DatabaseConnectionSection onChanged={handleConnectionChanged} />
            </div>

            <div className="card" style={{ marginTop: "18px" }}>

                <h2 className="card-title">Connection Health</h2>

                {healthLoading ? (

                    <p className="empty-state">Checking connection...</p>

                ) : !health?.connected ? (

                    <p className="error-message">
                        {health?.error || "Unable to connect to the database."}
                    </p>

                ) : (

                    <>

                        <div className="cloud-service-stat-grid">

                            <div className="cloud-service-stat-tile">
                                <span>Status</span>
                                <strong>Connected</strong>
                            </div>

                            <div className="cloud-service-stat-tile">
                                <span>Database</span>
                                <strong>{health.databaseName || "—"}</strong>
                            </div>

                            <div className="cloud-service-stat-tile">
                                <span>Schema</span>
                                <strong>{health.currentSchema || "—"}</strong>
                            </div>

                            <div className="cloud-service-stat-tile">
                                <span>Size</span>
                                <strong>{health.databaseSizePretty || "—"}</strong>
                            </div>

                            <div className="cloud-service-stat-tile">
                                <span>Tables</span>
                                <strong>{health.tableCount}</strong>
                            </div>

                            <div className="cloud-service-stat-tile">
                                <span>Latency</span>
                                <strong>{health.latencyMs} ms</strong>
                            </div>

                        </div>

                        <p className="field-hint" style={{ marginTop: "12px", marginBottom: 0 }}>
                            {health.maskedConnection}{health.version ? ` — ${health.version}` : ""}
                        </p>

                    </>

                )}

            </div>

            <br />

            <div className="card">

                <div className="repo-picker-header" style={{ marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ margin: 0 }}>Tables</h2>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
                        + Create Table
                    </button>
                </div>

                {schemas.length > 1 && (

                    <div className="form-group">

                        <label htmlFor="db-schema-select">Schema</label>

                        <select
                            id="db-schema-select"
                            className="form-control"
                            value={schema}
                            onChange={(e) => setSchema(e.target.value)}
                        >
                            {schemas.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>

                    </div>

                )}

                <SearchBox placeholder="Search tables..." value={search} onChange={setSearch} />

                {tablesLoading ? (

                    <p className="empty-state">Loading tables...</p>

                ) : filtered.length === 0 ? (

                    <p className="empty-state">No tables found in this schema.</p>

                ) : (

                    <>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Table</th>
                                        <th className="num">Rows (approx.)</th>
                                        <th className="num">Columns</th>
                                        <th>Size</th>
                                        <th>Primary Key</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {pageItems.map((t) => (

                                        <tr key={t.name}>
                                            <td className="table-row-clickable" onClick={() => selectTable({ schema: t.schema, name: t.name })}>
                                                {t.name}
                                            </td>
                                            <td className="num">{t.approxRowCount}</td>
                                            <td className="num">{t.columnCount}</td>
                                            <td>{t.sizePretty || "—"}</td>
                                            <td>{t.hasPrimaryKey ? "Yes" : "No"}</td>
                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                        </div>

                        <Pagination
                            page={page}
                            pageCount={pageCount}
                            totalCount={totalCount}
                            startIndex={startIndex}
                            endIndex={endIndex}
                            onPageChange={setPage}
                        />

                    </>

                )}

            </div>

            <br />

            <div className="card">

                <h2 className="card-title">Application Tables</h2>

                <p className="field-hint" style={{ marginTop: 0 }}>
                    Tables this application's own code expects to exist, cross-referenced against
                    what's actually in the database.
                </p>

                {!overview ? (

                    <p className="empty-state">Loading...</p>

                ) : (

                    <ul className="cloud-service-detail-list">

                        {overview.applicationTables.map((t) => (

                            <li key={t.name}>
                                <strong>{t.name}</strong> — {t.exists ? "Present" : "Missing"}
                                <span className="field-hint"> ({t.note})</span>
                            </li>

                        ))}

                    </ul>

                )}

            </div>

            <br />

            <div className="card">
                <h2 className="card-title">Migration Status</h2>
                <p className="field-hint" style={{ margin: 0 }}>
                    {overview?.migrationStatus || "Loading..."}
                </p>
            </div>

            <DatabaseCreateTableDialog
                open={createOpen}
                defaultSchema={schema}
                onCancel={() => setCreateOpen(false)}
                onSubmit={handleCreateTable}
            />

        </>

    );

}

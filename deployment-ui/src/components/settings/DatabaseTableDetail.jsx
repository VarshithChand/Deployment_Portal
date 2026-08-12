import { useEffect, useState } from "react";

import {
    getDatabaseTableDetail, getDatabaseRows, insertDatabaseRow, updateDatabaseRow, deleteDatabaseRow
} from "../../services/databaseService";
import useToast from "../../hooks/useToast";
import SearchBox from "../common/SearchBox";
import Pagination from "../common/Pagination";
import TypedConfirmDialog from "../cloudServices/TypedConfirmDialog";
import DatabaseRowFormDialog from "./DatabaseRowFormDialog";

// Row data is paginated server-side, not with the app's usual client-side
// usePagination/Pagination combo - the one deliberate, scoped exception to
// this project's pagination policy, since a Postgres table can hold far
// more rows than are safe to pull into the browser at once (see
// DatabaseManagementService.GetRowsAsync). Everything else on this page -
// and every other list in the app - keeps the normal client-side approach.
const ROW_PAGE_SIZE = 25;

export default function DatabaseTableDetail({ schema, table, onBack }) {

    const toast = useToast();

    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(true);

    const [rowsResult, setRowsResult] = useState(null);
    const [rowsLoading, setRowsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");

    const [addOpen, setAddOpen] = useState(false);
    const [editRow, setEditRow] = useState(null);
    const [deleteRow, setDeleteRowState] = useState(null);
    const [deleting, setDeleting] = useState(false);

    async function loadDetail() {

        setDetailLoading(true);

        try {
            setDetail(await getDatabaseTableDetail(schema, table));
        }
        catch (err) {
            console.error(err);
            toast.show("Unable to load table structure.", "error");
        }
        finally {
            setDetailLoading(false);
        }

    }

    async function loadRows(targetPage, targetSearch) {

        setRowsLoading(true);

        try {
            setRowsResult(await getDatabaseRows(schema, table, targetPage, ROW_PAGE_SIZE, targetSearch));
        }
        catch (err) {
            console.error(err);
            toast.show("Unable to load rows.", "error");
        }
        finally {
            setRowsLoading(false);
        }

    }

    useEffect(() => {

        loadDetail();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schema, table]);

    useEffect(() => {

        loadRows(page, search);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schema, table, page, search]);

    // Same "back to page 1 on filter change" rule the client-side
    // pagination policy requires, applied here even though this list's
    // pagination itself is server-side.
    useEffect(() => {

        setPage(1);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const pkColumns = detail?.primaryKeyColumns || [];

    // Edit/Delete need one unambiguous column+value to target a row -
    // tables with a composite or no primary key are shown read-only rather
    // than guessing which columns to match on.
    const singlePk = pkColumns.length === 1 ? pkColumns[0] : null;

    const pageCount = rowsResult ? Math.max(1, Math.ceil(rowsResult.totalCount / ROW_PAGE_SIZE)) : 1;
    const startIndex = rowsResult ? (rowsResult.page - 1) * ROW_PAGE_SIZE : 0;
    const endIndex = rowsResult ? Math.min(startIndex + rowsResult.rows.length, rowsResult.totalCount) : 0;

    async function handleAddRow(values) {

        const result = await insertDatabaseRow(schema, table, values);

        if (result.success) {
            toast.show(result.message || "Row inserted.", "success");
            setAddOpen(false);
            loadRows(page, search);
        }
        else {
            toast.show(result.error || "Failed to insert row.", "error");
        }

        return result;

    }

    async function handleEditRow(values) {

        if (!editRow || !singlePk) {
            return { success: false, error: "This table has no single primary key to edit by." };
        }

        const result = await updateDatabaseRow(schema, table, singlePk, editRow[singlePk], values);

        if (result.success) {
            toast.show(result.message || "Row updated.", "success");
            setEditRow(null);
            loadRows(page, search);
        }
        else {
            toast.show(result.error || "Failed to update row.", "error");
        }

        return result;

    }

    async function handleDeleteConfirm() {

        if (!deleteRow || !singlePk) return;

        setDeleting(true);

        try {

            const result = await deleteDatabaseRow(schema, table, singlePk, deleteRow[singlePk]);

            if (result.success) {
                toast.show(result.message || "Row deleted.", "success");
                loadRows(page, search);
            }
            else {
                toast.show(result.error || "Failed to delete row.", "error");
            }

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to delete row.", "error");

        }
        finally {

            setDeleting(false);
            setDeleteRowState(null);

        }

    }

    return (

        <>

            <nav className="cloud-service-breadcrumbs" aria-label="Breadcrumb">
                <button type="button" className="cloud-service-breadcrumb-link" onClick={onBack}>Database</button>
                <span className="cloud-service-breadcrumb-sep">/</span>
                <span className="cloud-service-breadcrumb-current">{table}</span>
            </nav>

            <div className="repo-picker-header" style={{ marginBottom: "12px" }}>
                <h1 style={{ margin: 0 }}>{schema}.{table}</h1>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
                    ← Back to Tables
                </button>
            </div>

            {detailLoading ? (

                <div className="card"><p className="empty-state">Loading table structure...</p></div>

            ) : !detail ? (

                <div className="card"><p className="empty-state">Table not found.</p></div>

            ) : (

                <>

                    <div className="card">

                        <h2 className="card-title">Structure</h2>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Column</th>
                                        <th>Type</th>
                                        <th>Nullable</th>
                                        <th>Default</th>
                                        <th>Key</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {detail.columns.map((c) => (

                                        <tr key={c.name}>
                                            <td>{c.name}</td>
                                            <td>{c.dataType}</td>
                                            <td>{c.isNullable ? "Yes" : "No"}</td>
                                            <td className="smoke-test-metric-mono">{c.defaultValue || "—"}</td>
                                            <td>{c.isPrimaryKey ? "PK" : ""}</td>
                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                        </div>

                        <p className="field-hint" style={{ marginBottom: 0 }}>
                            {detail.approxRowCount} row{detail.approxRowCount === 1 ? "" : "s"} (approx.)
                            {detail.sizePretty ? ` — ${detail.sizePretty}` : ""}
                        </p>

                    </div>

                    {(detail.foreignKeys.length > 0 || detail.uniqueConstraints.length > 0 || detail.indexes.length > 0) && (

                        <>

                        <br />

                        <div className="card">

                            <h2 className="card-title">Constraints & Indexes</h2>

                            {detail.foreignKeys.length > 0 && (

                                <>
                                    <h3 className="settings-subhead" style={{ marginTop: 0 }}>Foreign Keys</h3>
                                    <ul className="cloud-service-detail-list">
                                        {detail.foreignKeys.map((fk) => (
                                            <li key={fk.constraintName}>
                                                {fk.column} → {fk.foreignSchema}.{fk.foreignTable}.{fk.foreignColumn}
                                            </li>
                                        ))}
                                    </ul>
                                </>

                            )}

                            {detail.uniqueConstraints.length > 0 && (

                                <>
                                    <h3 className="settings-subhead">Unique Constraints</h3>
                                    <ul className="cloud-service-detail-list">
                                        {detail.uniqueConstraints.map((u) => (
                                            <li key={u.constraintName}>{u.columns.join(", ")}</li>
                                        ))}
                                    </ul>
                                </>

                            )}

                            {detail.indexes.length > 0 && (

                                <>
                                    <h3 className="settings-subhead">Indexes</h3>
                                    <ul className="cloud-service-detail-list">
                                        {detail.indexes.map((ix) => (
                                            <li key={ix.name}>
                                                {ix.name} ({ix.columns.join(", ")})
                                                {ix.isPrimary ? " — primary" : ix.isUnique ? " — unique" : ""}
                                            </li>
                                        ))}
                                    </ul>
                                </>

                            )}

                        </div>

                        </>

                    )}

                    <br />

                    <div className="card">

                        <div className="repo-picker-header" style={{ marginBottom: "12px" }}>
                            <h2 className="card-title" style={{ margin: 0 }}>Rows</h2>
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => setAddOpen(true)}
                                disabled={detail.columns.length === 0}
                            >
                                + Add Row
                            </button>
                        </div>

                        <SearchBox placeholder="Search rows..." value={search} onChange={setSearch} />

                        {rowsLoading ? (

                            <p className="empty-state">Loading rows...</p>

                        ) : rowsResult?.error ? (

                            <p className="error-message">{rowsResult.error}</p>

                        ) : !rowsResult?.rows?.length ? (

                            <p className="empty-state">No rows found.</p>

                        ) : (

                            <>

                                {!singlePk && (
                                    <p className="field-hint">
                                        This table has no single primary key, so rows are shown read-only —
                                        editing/deleting a specific row needs one unambiguous column to target it by.
                                    </p>
                                )}

                                <div className="table-scroll">

                                    <table className="table">

                                        <thead>
                                            <tr>
                                                {rowsResult.columns.map((c) => <th key={c}>{c}</th>)}
                                                <th>Actions</th>
                                            </tr>
                                        </thead>

                                        <tbody>

                                            {rowsResult.rows.map((row, index) => (

                                                <tr key={singlePk ? row[singlePk] : startIndex + index}>

                                                    {rowsResult.columns.map((c) => (
                                                        <td key={c} className="smoke-test-metric-mono">
                                                            {row[c] === null ? <em className="field-hint">NULL</em> : String(row[c])}
                                                        </td>
                                                    ))}

                                                    <td>

                                                        {singlePk ? (

                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-secondary"
                                                                    onClick={() => setEditRow(row)}
                                                                    style={{ marginRight: "6px" }}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-danger"
                                                                    onClick={() => setDeleteRowState(row)}
                                                                >
                                                                    Delete
                                                                </button>
                                                            </>

                                                        ) : (

                                                            <span className="field-hint">—</span>

                                                        )}

                                                    </td>

                                                </tr>

                                            ))}

                                        </tbody>

                                    </table>

                                </div>

                                <Pagination
                                    page={rowsResult.page}
                                    pageCount={pageCount}
                                    totalCount={rowsResult.totalCount}
                                    startIndex={startIndex}
                                    endIndex={endIndex}
                                    onPageChange={setPage}
                                />

                            </>

                        )}

                    </div>

                </>

            )}

            <DatabaseRowFormDialog
                open={addOpen}
                title={`Add Row — ${table}`}
                columns={detail?.columns || []}
                onCancel={() => setAddOpen(false)}
                onSubmit={handleAddRow}
            />

            <DatabaseRowFormDialog
                open={!!editRow}
                title={`Edit Row — ${table}`}
                columns={detail?.columns || []}
                initialValues={editRow}
                lockedColumn={singlePk}
                onCancel={() => setEditRow(null)}
                onSubmit={handleEditRow}
            />

            <TypedConfirmDialog
                open={!!deleteRow}
                title="Delete row?"
                message="This permanently deletes this row. This cannot be undone."
                resourceName="DELETE"
                confirmLabel="Delete"
                loading={deleting}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteRowState(null)}
            />

        </>

    );

}

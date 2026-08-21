import { useEffect, useState } from "react";

// Kept in sync with DatabaseManagementService's AllowedColumnTypes allowlist
// on the backend - this dropdown is just UX convenience, the backend still
// rejects anything outside that same list regardless of what's offered here.
const COLUMN_TYPES = [
    "text", "varchar", "char", "integer", "smallint", "bigint", "boolean",
    "numeric", "real", "double precision", "uuid", "json", "jsonb",
    "date", "timestamp", "timestamptz", "time"
];

function emptyColumn() {
    return { name: "", type: "text", nullable: true, primaryKey: false, defaultValue: "" };
}

// Settings -> Database -> Create Table. Structured column definition only -
// there's no free-text SQL entry anywhere in this form, matching the
// backend's own refusal to run arbitrary SQL (see DatabaseManagementService.
// CreateTableAsync's identifier/type/default validation).
export default function DatabaseCreateTableDialog({ open, defaultSchema, onCancel, onSubmit }) {

    const [schema, setSchema] = useState(defaultSchema || "public");
    const [tableName, setTableName] = useState("");
    const [columns, setColumns] = useState([emptyColumn()]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {

        if (open) {
            setSchema(defaultSchema || "public");
            setTableName("");
            setColumns([emptyColumn()]);
            setError(null);
        }

    }, [open, defaultSchema]);

    useEffect(() => {

        if (!open) return;

        function handleKeyDown(e) {
            if (e.key === "Escape") onCancel();
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);

    }, [open, onCancel]);

    if (!open) {
        return null;
    }

    function updateColumn(index, patch) {
        setColumns((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    }

    function addColumn() {
        setColumns((prev) => [...prev, emptyColumn()]);
    }

    function removeColumn(index) {
        setColumns((prev) => prev.filter((_, i) => i !== index));
    }

    async function handleSubmit(e) {

        e.preventDefault();
        setError(null);

        if (!tableName.trim()) {
            setError("Table name is required.");
            return;
        }

        const cleanColumns = columns
            .filter((c) => c.name.trim())
            .map((c) => ({
                name: c.name.trim(),
                type: c.type,
                nullable: c.nullable,
                primaryKey: c.primaryKey,
                defaultValue: c.defaultValue.trim() || null
            }));

        if (cleanColumns.length === 0) {
            setError("At least one column is required.");
            return;
        }

        setSaving(true);

        try {

            const result = await onSubmit({
                schema: schema.trim() || "public",
                tableName: tableName.trim(),
                columns: cleanColumns
            });

            if (!result?.success) {
                setError(result?.error || "Failed to create table.");
            }

        }
        finally {
            setSaving(false);
        }

    }

    return (

        <div
            className="dialog-backdrop"
            role="presentation"
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >

            <div className="dialog db-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="create-table-title">

                <h2 id="create-table-title">Create Table</h2>

                <form onSubmit={handleSubmit}>

                    <div className="form-group">
                        <label htmlFor="db-create-schema">Schema</label>
                        <input id="db-create-schema" type="text" className="form-control" value={schema} onChange={(e) => setSchema(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label htmlFor="db-create-table-name">Table Name</label>
                        <input
                            id="db-create-table-name"
                            type="text"
                            className="form-control"
                            value={tableName}
                            onChange={(e) => setTableName(e.target.value)}
                            placeholder="my_table"
                            autoFocus
                        />
                    </div>

                    <span className="field-hint" style={{ display: "block", marginBottom: "6px" }}>Columns</span>

                    {columns.map((col, index) => (

                        <fieldset key={index} className="db-column-row" style={{ border: "none", padding: 0, margin: 0 }}>

                            <legend className="visually-hidden">Column {index + 1}</legend>

                            <input
                                type="text"
                                className="form-control"
                                aria-label="Column name"
                                placeholder="column_name"
                                value={col.name}
                                onChange={(e) => updateColumn(index, { name: e.target.value })}
                            />

                            <select
                                className="form-control"
                                value={col.type}
                                onChange={(e) => updateColumn(index, { type: e.target.value })}
                            >
                                {COLUMN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>

                            <label className="db-column-checkbox">
                                <input
                                    type="checkbox"
                                    checked={!col.nullable}
                                    onChange={(e) => updateColumn(index, { nullable: !e.target.checked })}
                                />
                                Required
                            </label>

                            <label className="db-column-checkbox">
                                <input
                                    type="checkbox"
                                    checked={col.primaryKey}
                                    onChange={(e) => updateColumn(index, { primaryKey: e.target.checked })}
                                />
                                Primary Key
                            </label>

                            <input
                                type="text"
                                className="form-control"
                                placeholder="default (optional)"
                                value={col.defaultValue}
                                onChange={(e) => updateColumn(index, { defaultValue: e.target.value })}
                            />

                            <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={() => removeColumn(index)}
                                disabled={columns.length === 1}
                            >
                                Remove
                            </button>

                        </fieldset>

                    ))}

                    <button type="button" className="btn btn-sm btn-secondary" onClick={addColumn} style={{ marginTop: "8px" }}>
                        + Add Column
                    </button>

                    {error && <p className="error-message" style={{ marginTop: "12px" }}>{error}</p>}

                    <div className="button-row" style={{ marginTop: "16px" }}>

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Creating..." : "Create Table"}
                        </button>

                        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
                            Cancel
                        </button>

                    </div>

                </form>

            </div>

        </div>

    );

}

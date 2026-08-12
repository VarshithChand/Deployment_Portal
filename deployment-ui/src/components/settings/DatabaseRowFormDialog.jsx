import { useEffect, useState } from "react";

const NUMERIC_TYPES = ["integer", "smallint", "bigint", "numeric", "real", "double precision"];

function inputTypeFor(dataType) {

    if (dataType.includes("timestamp")) return "datetime-local";
    if (dataType === "date") return "date";
    if (dataType === "time") return "time";
    if (NUMERIC_TYPES.includes(dataType)) return "number";

    return "text";

}

function isJsonType(dataType) {
    return dataType === "json" || dataType === "jsonb";
}

function isBooleanType(dataType) {
    return dataType === "boolean";
}

// ISO 8601 (what the backend returns, see FormatCellValue) trimmed to what
// <input type="datetime-local"> accepts ("YYYY-MM-DDTHH:mm").
function toDisplayValue(raw, dataType) {

    if (raw === null || raw === undefined) return "";
    if (dataType.includes("timestamp") && typeof raw === "string") return raw.slice(0, 16);

    return String(raw);

}

// Shared by Add Row and Edit Row - renders one field per real column
// (dynamically, no fixed-schema assumption) with an input shaped by that
// column's actual Postgres data type. A column left untouched with nothing
// typed in is omitted from what's submitted entirely, which is what lets
// Add Row skip columns that have a safe database default instead of
// forcing a value into every single field.
export default function DatabaseRowFormDialog({ open, title, columns, initialValues, lockedColumn, onCancel, onSubmit }) {

    const [fields, setFields] = useState({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {

        if (!open) return;

        const next = {};

        for (const col of columns) {

            const hasInitial = !!initialValues && Object.prototype.hasOwnProperty.call(initialValues, col.name);
            const initialRaw = hasInitial ? initialValues[col.name] : null;

            next[col.name] = {
                value: hasInitial ? toDisplayValue(initialRaw, col.dataType) : "",
                isNull: hasInitial && initialRaw === null,
                touched: hasInitial
            };

        }

        setFields(next);
        setError(null);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, columns, initialValues]);

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

    function updateField(name, patch) {
        setFields((prev) => ({ ...prev, [name]: { ...prev[name], ...patch, touched: true } }));
    }

    async function handleSubmit(e) {

        e.preventDefault();
        setError(null);

        const values = {};

        for (const col of columns) {

            if (col.name === lockedColumn) continue;

            const field = fields[col.name];

            if (!field || (!field.touched && !field.value)) continue;

            if (field.isNull) {
                values[col.name] = null;
                continue;
            }

            if (isBooleanType(col.dataType)) {

                if (field.value === "") continue;
                values[col.name] = field.value === "true";

            }
            else if (isJsonType(col.dataType)) {

                if (field.value === "") continue;

                try {
                    values[col.name] = JSON.parse(field.value);
                }
                catch {
                    setError(`Column "${col.name}" is not valid JSON.`);
                    return;
                }

            }
            else if (NUMERIC_TYPES.includes(col.dataType)) {

                if (field.value === "") continue;
                values[col.name] = Number(field.value);

            }
            else if (col.dataType.includes("timestamp") || col.dataType === "date") {

                if (field.value === "") continue;
                values[col.name] = new Date(field.value).toISOString();

            }
            else {

                values[col.name] = field.value;

            }

        }

        setSaving(true);

        try {

            const result = await onSubmit(values);

            if (!result?.success) {
                setError(result?.error || "Failed to save.");
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

            <div className="dialog db-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="row-form-title">

                <h2 id="row-form-title">{title}</h2>

                <form onSubmit={handleSubmit}>

                    {columns.map((col) => {

                        const field = fields[col.name] || { value: "", isNull: false };
                        const locked = col.name === lockedColumn;

                        return (

                            <div className="form-group" key={col.name}>

                                <label>
                                    {col.name}
                                    <span className="field-hint">
                                        {" "}({col.dataType}
                                        {col.isPrimaryKey ? ", PK" : ""}
                                        {col.defaultValue ? ", has default" : ""})
                                    </span>
                                </label>

                                {locked ? (

                                    <input type="text" className="form-control" value={field.value} disabled />

                                ) : isBooleanType(col.dataType) ? (

                                    <select
                                        className="form-control"
                                        value={field.isNull ? "" : field.value}
                                        onChange={(e) => updateField(col.name, { value: e.target.value, isNull: false })}
                                    >
                                        <option value="">{col.isNullable ? "NULL" : "Select..."}</option>
                                        <option value="true">true</option>
                                        <option value="false">false</option>
                                    </select>

                                ) : isJsonType(col.dataType) ? (

                                    <textarea
                                        className="form-control"
                                        rows={3}
                                        value={field.isNull ? "" : field.value}
                                        disabled={field.isNull}
                                        onChange={(e) => updateField(col.name, { value: e.target.value, isNull: false })}
                                        placeholder="{}"
                                    />

                                ) : (

                                    <input
                                        type={inputTypeFor(col.dataType)}
                                        className="form-control"
                                        value={field.isNull ? "" : field.value}
                                        disabled={field.isNull}
                                        onChange={(e) => updateField(col.name, { value: e.target.value, isNull: false })}
                                    />

                                )}

                                {!locked && col.isNullable && (

                                    <label className="db-column-checkbox" style={{ marginTop: "4px" }}>
                                        <input
                                            type="checkbox"
                                            checked={field.isNull}
                                            onChange={(e) => updateField(col.name, { isNull: e.target.checked, value: "" })}
                                        />
                                        Set to NULL
                                    </label>

                                )}

                            </div>

                        );

                    })}

                    {error && <p className="error-message">{error}</p>}

                    <div className="button-row" style={{ marginTop: "12px" }}>

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save"}
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

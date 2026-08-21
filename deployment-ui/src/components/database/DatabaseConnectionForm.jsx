import { useEffect, useState } from "react";

import ClearableInput from "../common/ClearableInput";
import useToast from "../../hooks/useToast";
import { getObservabilityCredentialStatus } from "../../services/hostingObservabilityService";

const EMPTY_FORM = { providerLabel: "", connectionString: "" };
const EMPTY_FIELDS = { providerLabel: "", host: "", port: "5432", database: "", username: "", password: "" };

// Shared UI for "connect a Postgres database, live-picked from Render or
// pasted manually" - used by TWO independent connection slots that never
// touch each other (see each caller's own comment for which): the Hosting
// Providers dashboard's Database tab, and Settings > Database's own table
// browser/editor. Every actual read/write goes through whichever service
// functions the caller passes in - this component has no idea which slot
// it's pointed at, it just renders the form and calls back.
//
// The portal-wide Render API credential (root["PortalPaasCredentials"]
// ["render"]) is genuinely shared infrastructure between both callers -
// it's just a bearer token, not tied to either connection slot - so this
// always checks it via the one shared endpoint (getObservabilityCredentialStatus)
// regardless of which caller is rendering.
export default function DatabaseConnectionForm({
    description,
    fallbackNote,
    getStatus,
    saveConnection,
    saveConnectionFields,
    clearConnection,
    getRenderDatabases,
    connectRenderDatabase,
    onChanged
}) {

    const toast = useToast();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [fields, setFields] = useState(EMPTY_FIELDS);
    const [manualMode, setManualMode] = useState("fields");

    const [source, setSource] = useState("render");
    const [renderCredConfigured, setRenderCredConfigured] = useState(false);
    const [renderDatabases, setRenderDatabases] = useState([]);
    const [renderDatabasesLoading, setRenderDatabasesLoading] = useState(false);
    const [selectedRenderDb, setSelectedRenderDb] = useState("");
    const [connecting, setConnecting] = useState(false);

    function refresh() {

        setLoading(true);

        getStatus().then((data) => {

            setStatus(data);
            setForm((f) => ({ ...f, providerLabel: data?.providerLabel || "" }));
            setFields((f) => ({ ...f, providerLabel: data?.providerLabel || "" }));
            setSource(data?.configured && data.providerLabel !== "Render" ? "manual" : "render");
            setLoading(false);

        }).catch((err) => {

            console.error(err);
            setLoading(false);

        });

    }

    // getStatus/etc are the caller's module-level service imports (see
    // credentials/DatabaseConnectionSection.jsx and settings/
    // DatabaseConnectionSection.jsx), stable across renders despite being
    // passed as props - safe to omit from the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(refresh, []);

    useEffect(() => {

        getObservabilityCredentialStatus("render")
            .then((data) => setRenderCredConfigured(!!data?.configured))
            .catch(() => setRenderCredConfigured(false));

    }, []);

    function loadRenderDatabases() {

        setRenderDatabasesLoading(true);

        getRenderDatabases().then((data) => {
            setRenderDatabases(Array.isArray(data) ? data : []);
            setRenderDatabasesLoading(false);
        }).catch((err) => {
            console.error(err);
            setRenderDatabasesLoading(false);
        });

    }

    useEffect(() => {

        if (source === "render" && renderCredConfigured) loadRenderDatabases();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source, renderCredConfigured]);

    async function handleConnectRender() {

        if (!selectedRenderDb) return;

        setConnecting(true);

        try {

            await connectRenderDatabase(selectedRenderDb);
            toast.show("Connected to the selected Render database.", "success");
            setSelectedRenderDb("");
            refresh();
            onChanged?.();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to connect that database.", "error");

        }
        finally {

            setConnecting(false);

        }

    }

    async function handleSaveManual(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveConnection(form);
            toast.show("Database connection saved.", "success");
            setForm((f) => ({ ...f, connectionString: "" }));
            refresh();
            onChanged?.();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save the database connection.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleSaveFields(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveConnectionFields({
                ...fields,
                port: parseInt(fields.port, 10) || 5432
            });
            toast.show("Database connection saved.", "success");
            setFields((f) => ({ ...EMPTY_FIELDS, providerLabel: f.providerLabel }));
            refresh();
            onChanged?.();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save the database connection.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear() {

        try {

            await clearConnection();
            toast.show(`Cleared — ${fallbackNote}`, "success");
            setForm(EMPTY_FORM);
            refresh();
            onChanged?.();

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to clear the database connection.", "error");

        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                Database
                {" "}
                {!loading && status?.configured && (
                    <span className="badge badge-success">Configured</span>
                )}
            </h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                {description}
            </p>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <>

                <div className="button-row" style={{ marginBottom: "14px" }}>

                    <button
                        type="button"
                        className={`btn btn-sm ${source === "render" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setSource("render")}
                    >
                        Render
                    </button>

                    <button
                        type="button"
                        className={`btn btn-sm ${source === "manual" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setSource("manual")}
                    >
                        Other
                    </button>

                </div>

                {source === "render" && (

                    renderCredConfigured ? (

                        <>

                        {renderDatabasesLoading ? (

                            <p className="field-hint">Loading Render databases...</p>

                        ) : renderDatabases.length === 0 ? (

                            <p className="empty-state" style={{ textAlign: "left" }}>
                                No Postgres instances found under the connected Render account.
                            </p>

                        ) : (

                            <div className="form-group">

                                <label htmlFor="render-database">Render Database</label>

                                <select
                                    id="render-database"
                                    className="form-control"
                                    value={selectedRenderDb}
                                    onChange={(e) => setSelectedRenderDb(e.target.value)}
                                >
                                    <option value="">Select a database…</option>
                                    {renderDatabases.map((d) => (
                                        <option key={d.id} value={d.id}>{d.name} — {d.status}</option>
                                    ))}
                                </select>

                            </div>

                        )}

                        <div className="button-row">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleConnectRender}
                                disabled={!selectedRenderDb || connecting}
                            >
                                {connecting ? "Connecting..." : "Connect"}
                            </button>
                        </div>

                        </>

                    ) : (

                        <p className="field-hint">
                            Save a portal-wide Render credential (Render tab on Settings → Credentials)
                            first to pick from a live list of your Render Postgres databases.
                        </p>

                    )

                )}

                {source === "manual" && (

                    <>

                    <div className="button-row" style={{ marginBottom: "12px" }}>

                        <button
                            type="button"
                            className={`btn btn-sm ${manualMode === "fields" ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => setManualMode("fields")}
                        >
                            Fields
                        </button>

                        <button
                            type="button"
                            className={`btn btn-sm ${manualMode === "string" ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => setManualMode("string")}
                        >
                            Connection String
                        </button>

                    </div>

                    {manualMode === "fields" && (

                        <form onSubmit={handleSaveFields}>

                            <div className="form-group">
                                <label htmlFor="db-fields-provider-label">Provider Name</label>
                                <ClearableInput
                                    id="db-fields-provider-label"
                                    placeholder="e.g. CSP, AWS RDS, Supabase, Neon..."
                                    value={fields.providerLabel}
                                    onChange={(e) => setFields({ ...fields, providerLabel: e.target.value })}
                                    onClear={() => setFields({ ...fields, providerLabel: "" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="db-fields-host">Hostname</label>
                                <ClearableInput
                                    id="db-fields-host"
                                    placeholder="dpg-xxxxxxxxxxxxxxxxxxxx-a"
                                    value={fields.host}
                                    onChange={(e) => setFields({ ...fields, host: e.target.value })}
                                    onClear={() => setFields({ ...fields, host: "" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="db-fields-port">Port</label>
                                <ClearableInput
                                    id="db-fields-port"
                                    placeholder="5432"
                                    value={fields.port}
                                    onChange={(e) => setFields({ ...fields, port: e.target.value.replace(/\D/g, "") })}
                                    onClear={() => setFields({ ...fields, port: "5432" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="db-fields-database">Database</label>
                                <ClearableInput
                                    id="db-fields-database"
                                    value={fields.database}
                                    onChange={(e) => setFields({ ...fields, database: e.target.value })}
                                    onClear={() => setFields({ ...fields, database: "" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="db-fields-username">Username</label>
                                <ClearableInput
                                    id="db-fields-username"
                                    value={fields.username}
                                    onChange={(e) => setFields({ ...fields, username: e.target.value })}
                                    onClear={() => setFields({ ...fields, username: "" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="db-fields-password">Password</label>
                                <ClearableInput
                                    id="db-fields-password"
                                    type="password"
                                    value={fields.password}
                                    onChange={(e) => setFields({ ...fields, password: e.target.value })}
                                    onClear={() => setFields({ ...fields, password: "" })}
                                    autoComplete="new-password"
                                />
                            </div>

                            <p className="field-hint">
                                Matches the Hostname/Port/Database/Username/Password fields shown on
                                Render's own "Connections" panel for a database. All 5 are required —
                                this always replaces the saved connection, never a partial update.
                            </p>

                            <div className="button-row">
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? "Saving..." : "Save Database Connection"}
                                </button>
                            </div>

                        </form>

                    )}

                    {manualMode === "string" && (

                        <form onSubmit={handleSaveManual}>

                            <div className="form-group">
                                <label htmlFor="db-string-provider-label">Provider Name</label>
                                <ClearableInput
                                    id="db-string-provider-label"
                                    placeholder="e.g. CSP, AWS RDS, Supabase, Neon..."
                                    value={form.providerLabel}
                                    onChange={(e) => setForm({ ...form, providerLabel: e.target.value })}
                                    onClear={() => setForm({ ...form, providerLabel: "" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="db-connection-string">Connection String</label>
                                <ClearableInput
                                    id="db-connection-string"
                                    type="password"
                                    placeholder={status?.configured ? "Leave blank to keep current connection string" : "postgresql://user:password@host:5432/dbname"}
                                    value={form.connectionString}
                                    onChange={(e) => setForm({ ...form, connectionString: e.target.value })}
                                    onClear={() => setForm({ ...form, connectionString: "" })}
                                    autoComplete="new-password"
                                />
                            </div>

                            <p className="field-hint">
                                Paste the Internal or External Database URL. Render's "PSQL Command"
                                field isn't parsed — use the Fields tab instead if that's all you have.
                            </p>

                            <div className="button-row">
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? "Saving..." : "Save Database Connection"}
                                </button>
                            </div>

                        </form>

                    )}

                    </>

                )}

                {status?.configured && status.maskedConnection && (

                    <p className="field-hint" style={{ marginTop: "12px" }}>
                        Currently pointed at{" "}
                        <span className="smoke-test-metric-mono">{status.maskedConnection}</span>
                        {status.providerLabel && ` (${status.providerLabel})`}
                    </p>

                )}

                {status?.configured && (

                    <div className="button-row" style={{ marginTop: "8px" }}>
                        <button type="button" className="btn btn-danger" onClick={handleClear}>
                            Clear
                        </button>
                    </div>

                )}

                </>

            )}

        </div>

    );

}

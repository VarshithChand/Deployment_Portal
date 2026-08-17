import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import {
    getDatabaseConnectionStatus, saveDatabaseConnection, saveDatabaseConnectionFields, clearDatabaseConnection,
    getRenderDatabases, connectRenderDatabase, getObservabilityCredentialStatus
} from "../../../services/hostingObservabilityService";

const EMPTY_FORM = { providerLabel: "", connectionString: "" };
const EMPTY_FIELDS = { providerLabel: "", host: "", port: "5432", database: "", username: "", password: "" };

// Points the Hosting Providers dashboard's Database tab at a specific
// Postgres instance. Two ways in, same as Frontend/Backend elsewhere on
// this page: a live picker when the provider is one this app actually
// integrates with (Render, the only one with a Postgres product) - the
// server fetches the real connection string itself and never returns it to
// the browser at all - or a manual paste for anything else (an external
// provider this app has no dedicated integration for: "CSP", AWS RDS,
// Supabase, Neon, whatever actually hosts it). Leaving both unset keeps
// the dashboard on this backend's own DATABASE_URL, the default. Portal-
// wide, super-admin only - see HostingObservabilityController's
// database/* actions.
export default function DatabaseConnectionSection() {

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

        getDatabaseConnectionStatus().then((data) => {

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

            await saveDatabaseConnection(form);
            toast.show("Database connection saved.", "success");
            setForm((f) => ({ ...f, connectionString: "" }));
            refresh();

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

            await saveDatabaseConnectionFields({
                ...fields,
                port: parseInt(fields.port, 10) || 5432
            });
            toast.show("Database connection saved.", "success");
            setFields((f) => ({ ...EMPTY_FIELDS, providerLabel: f.providerLabel }));
            refresh();

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

            await clearDatabaseConnection();
            toast.show("Cleared — the dashboard will use this backend's own DATABASE_URL again.", "success");
            setForm(EMPTY_FORM);
            refresh();

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
                Points the Hosting Providers dashboard's Database tab at a specific Postgres
                instance. Leave this unset and the dashboard falls back to this backend's own
                DATABASE_URL, its default. The connection string is only ever used server-side to
                run read queries — never sent to the browser, and never shown back once saved.
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

                                <label>Render Database</label>

                                <select
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
                            Save a portal-wide Render credential (Render tab above) first to pick
                            from a live list of your Render Postgres databases.
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
                                <label>Provider Name</label>
                                <ClearableInput
                                    placeholder="e.g. CSP, AWS RDS, Supabase, Neon..."
                                    value={fields.providerLabel}
                                    onChange={(e) => setFields({ ...fields, providerLabel: e.target.value })}
                                    onClear={() => setFields({ ...fields, providerLabel: "" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label>Hostname</label>
                                <ClearableInput
                                    placeholder="dpg-xxxxxxxxxxxxxxxxxxxx-a"
                                    value={fields.host}
                                    onChange={(e) => setFields({ ...fields, host: e.target.value })}
                                    onClear={() => setFields({ ...fields, host: "" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label>Port</label>
                                <ClearableInput
                                    placeholder="5432"
                                    value={fields.port}
                                    onChange={(e) => setFields({ ...fields, port: e.target.value.replace(/\D/g, "") })}
                                    onClear={() => setFields({ ...fields, port: "5432" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label>Database</label>
                                <ClearableInput
                                    value={fields.database}
                                    onChange={(e) => setFields({ ...fields, database: e.target.value })}
                                    onClear={() => setFields({ ...fields, database: "" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label>Username</label>
                                <ClearableInput
                                    value={fields.username}
                                    onChange={(e) => setFields({ ...fields, username: e.target.value })}
                                    onClear={() => setFields({ ...fields, username: "" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label>Password</label>
                                <ClearableInput
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
                                <label>Provider Name</label>
                                <ClearableInput
                                    placeholder="e.g. CSP, AWS RDS, Supabase, Neon..."
                                    value={form.providerLabel}
                                    onChange={(e) => setForm({ ...form, providerLabel: e.target.value })}
                                    onClear={() => setForm({ ...form, providerLabel: "" })}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label>Connection String</label>
                                <ClearableInput
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
                            Clear (use this backend's own DATABASE_URL)
                        </button>
                    </div>

                )}

                </>

            )}

        </div>

    );

}

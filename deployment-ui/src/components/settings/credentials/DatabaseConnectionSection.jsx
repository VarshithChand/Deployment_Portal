import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import { getDatabaseConnectionStatus, saveDatabaseConnection, clearDatabaseConnection } from "../../../services/hostingObservabilityService";

const EMPTY_FORM = { providerLabel: "", connectionString: "" };

// Points the Hosting Providers dashboard's Database tab at a specific
// Postgres instance, labeled with whatever actually hosts it (e.g. "CSP",
// "AWS RDS", "Supabase", "Neon") - unlike Frontend/Backend, the database
// isn't one of the 4 fixed PaaS providers, so this is a free-text label
// plus a pasted connection string rather than a provider dropdown + token.
// Leaving this unset (the default) points the dashboard at this backend's
// own DATABASE_URL instead - the right answer for most deployments, where
// the monitored database IS the app's own. Portal-wide, super-admin only -
// see HostingObservabilityController's database/connection actions.
export default function DatabaseConnectionSection() {

    const toast = useToast();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        getDatabaseConnectionStatus().then((data) => {
            setStatus(data);
            setForm((f) => ({ ...f, providerLabel: data?.providerLabel || "" }));
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    async function handleSave(e) {

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
                instance — paste its connection string and give it a label naming whatever
                actually hosts it (e.g. "CSP", "AWS RDS", "Supabase", "Neon"). Leave this unset
                and the dashboard falls back to this backend's own DATABASE_URL, its default.
                The connection string is only ever used server-side to run read queries — never
                sent to the browser, and never shown back once saved.
            </p>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <form onSubmit={handleSave}>

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

                    {status?.configured && status.maskedConnection && (
                        <p className="field-hint">
                            Currently pointed at{" "}
                            <span className="smoke-test-metric-mono">{status.maskedConnection}</span>
                        </p>
                    )}

                    <div className="button-row">

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save Database Connection"}
                        </button>

                        {status?.configured && (
                            <button type="button" className="btn btn-danger" onClick={handleClear}>
                                Clear (use this backend's own DATABASE_URL)
                            </button>
                        )}

                    </div>

                </form>

            )}

        </div>

    );

}

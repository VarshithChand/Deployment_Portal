import { useEffect, useState } from "react";

import ClearableInput from "../common/ClearableInput";
import useToast from "../../hooks/useToast";
import useAuth from "../../hooks/useAuth";
import { getPaasStatus, savePaasCredentials, clearPaasCredentials } from "../../services/paasService";

const EMPTY_FORM = { token: "", accountId: "" };
const PIN_SUGGESTION = " Tip: set a screen-lock PIN (Screen Lock tab) to keep this secured.";

// One generic card reused for all four providers (Render/Cloudflare/
// Netlify/Vercel) rather than four near-duplicate components - the only
// real per-provider difference is whether an Account ID field shows, plus
// label/help text. Session-scoped, exactly like AzureLoginSection's own
// AWS/Azure credential form: kept only for this browser, cleared on
// sign-out, never portal-wide.
export default function PaasProviderCard({ provider, label, hasAccountId = false, helpText }) {

    const toast = useToast();
    const { pinConfigured } = useAuth();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        getPaasStatus(provider).then((result) => {

            setStatus(result);
            setLoading(false);

        }).catch((err) => {

            console.error(err);
            setLoading(false);

        });

    }

    useEffect(refresh, [provider]);

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await savePaasCredentials(provider, form);
            toast.show(`${label} connected for this session.` + (pinConfigured ? "" : PIN_SUGGESTION), "success");
            setForm(EMPTY_FORM);
            setEditing(false);
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Unable to connect ${label}.`, "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear() {

        try {

            await clearPaasCredentials(provider);
            toast.show(`${label} disconnected.`, "success");
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Unable to disconnect ${label}.`, "error");

        }

    }

    return (

        <div className="card">

            <h2 className="card-title">
                {label}
                {" "}
                {!loading && status?.configured && (
                    <span className={`badge ${status.found ? "badge-success" : "badge-warning"}`}>
                        {status.found ? "Connected" : "Configured"}
                    </span>
                )}
            </h2>

            {helpText && (
                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>{helpText}</p>
            )}

            {loading && <p className="field-hint">Checking...</p>}

            {!loading && (!status?.configured || editing) && (

                <form onSubmit={handleSave}>

                    <div className="form-group">
                        <label>API Token</label>
                        <ClearableInput
                            type="password"
                            placeholder={status?.configured ? "Leave blank to keep current token" : ""}
                            value={form.token}
                            onChange={(e) => setForm({ ...form, token: e.target.value })}
                            onClear={() => setForm({ ...form, token: "" })}
                            autoComplete="new-password"
                        />
                    </div>

                    {hasAccountId && (

                        <div className="form-group">
                            <label>Account ID</label>
                            <ClearableInput
                                placeholder={status?.configured ? "Leave blank to keep current Account ID" : ""}
                                value={form.accountId}
                                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                                onClear={() => setForm({ ...form, accountId: "" })}
                                autoComplete="off"
                            />
                        </div>

                    )}

                    <div className="button-row">

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Connecting..." : `Connect ${label}`}
                        </button>

                        {editing && (
                            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={saving}>
                                Cancel
                            </button>
                        )}

                    </div>

                </form>

            )}

            {!loading && status?.configured && !editing && (

                <>

                {!status.found && (
                    <p className="error-message">{status.error || `Unable to reach ${label}.`}</p>
                )}

                {status.found && (

                    <>

                    {status.accountLabel && (
                        <p className="field-hint field-hint-good">
                            Signed in as: <strong>{status.accountLabel}</strong>
                        </p>
                    )}

                    {status.services.length === 0 ? (

                        <p className="empty-state" style={{ textAlign: "left" }}>
                            No services/projects found in this {label} account.
                        </p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    <th>Updated</th>
                                </tr>
                            </thead>

                            <tbody>

                                {status.services.map((svc, i) => (

                                    <tr key={i}>
                                        <td>
                                            {svc.url ? (
                                                <a href={svc.url} target="_blank" rel="noreferrer">{svc.name}</a>
                                            ) : svc.name}
                                        </td>
                                        <td>{svc.type || "—"}</td>
                                        <td>{svc.status || "—"}</td>
                                        <td>{svc.updatedAt ? new Date(svc.updatedAt).toLocaleString() : "—"}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                    </>

                )}

                <div className="button-row" style={{ marginTop: "14px" }}>
                    <button type="button" className="btn btn-secondary" onClick={refresh}>Refresh</button>
                    <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
                    <button type="button" className="btn btn-danger" onClick={handleClear}>Disconnect</button>
                </div>

                </>

            )}

        </div>

    );

}

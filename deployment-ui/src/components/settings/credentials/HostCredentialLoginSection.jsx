import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import { getHostRegistryStatus, saveHostRegistryCredentials, clearHostRegistryCredentials } from "../../../services/containerRegistryService";

const EMPTY_FORM = { hostUrl: "", username: "", password: "" };

// Harbor and Nexus's session-scoped credential form - each visitor
// connects their own, isolated from every other visitor. Both are almost
// always self-hosted, plain-username-and-password (Basic auth) registries,
// so one generic component covers both rather than two near-identical
// bespoke ones (see PortalHostCredentials' own comment).
//
// statusFn/saveFn/clearFn default to Container Registry's own Harbor/
// Nexus calls (containerRegistryService.js, /api/containerregistry/...) -
// every existing caller keeps working unchanged. Observability's 10
// standalone tools pass observabilityService.js's own calls instead
// (/api/observability/...) - same PortalHostCredentials storage shape on
// the backend either way, just a different route family, same
// "injectable statusFn/saveFn/clearFn" pattern PortalRegistryLoginSection
// already uses for Azure DevOps/Docker Hub/GHCR.
export default function HostCredentialLoginSection({
    provider, label, hostPlaceholder, passwordLabel, helpText, onCleared,
    statusFn = getHostRegistryStatus,
    saveFn = saveHostRegistryCredentials,
    clearFn = clearHostRegistryCredentials
}) {

    const toast = useToast();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        statusFn(provider).then((result) => {
            setStatus(result);
            setLoading(false);
        });

    }

    useEffect(refresh, [provider]);

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveFn(provider, form);
            toast.show(`${label} credentials saved for this session.`, "success");
            setForm(EMPTY_FORM);
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Unable to save ${label} credentials.`, "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear() {

        try {

            await clearFn(provider);
            toast.show(`${label} credentials cleared.`, "success");
            refresh();
            onCleared?.();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Unable to clear ${label} credentials.`, "error");

        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                {label}
                {" "}
                {!loading && status?.configured && (
                    <span className="badge badge-success">Configured</span>
                )}
            </h3>

            {!loading && status?.configured && status.hostUrl && (
                <p className="field-hint field-hint-good">
                    Instance: <strong>{status.hostUrl}</strong>
                    {status.username && <> as <strong>{status.username}</strong></>}
                </p>
            )}

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                {helpText} Kept for your own session only — isolated from every other
                visitor of the portal.
            </p>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <form onSubmit={handleSave}>

                    <div className="form-group">
                        <label>Host URL</label>
                        <ClearableInput
                            placeholder={status?.hostUrl || hostPlaceholder}
                            value={form.hostUrl}
                            onChange={(e) => setForm({ ...form, hostUrl: e.target.value })}
                            onClear={() => setForm({ ...form, hostUrl: "" })}
                            autoComplete="off"
                            name={`${provider}-host-url`}
                        />
                    </div>

                    <div className="form-group">
                        <label>Username</label>
                        <ClearableInput
                            placeholder={status?.configured ? `Leave blank to keep "${status.username}"` : ""}
                            value={form.username}
                            onChange={(e) => setForm({ ...form, username: e.target.value })}
                            onClear={() => setForm({ ...form, username: "" })}
                            autoComplete="off"
                            name={`${provider}-username`}
                        />
                    </div>

                    <div className="form-group">
                        <label>{passwordLabel}</label>
                        <ClearableInput
                            type="password"
                            placeholder={status?.configured ? "Leave blank to keep current password" : ""}
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            onClear={() => setForm({ ...form, password: "" })}
                            autoComplete="new-password"
                        />
                    </div>

                    <div className="button-row">

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Saving..." : `Save ${label} Credentials`}
                        </button>

                        {status?.configured && (

                            <button type="button" className="btn btn-danger" onClick={handleClear}>
                                Clear Credentials
                            </button>

                        )}

                    </div>

                </form>

            )}

        </div>

    );

}

import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import { getHostRegistryStatus, saveHostRegistryCredentials, clearHostRegistryCredentials } from "../../../services/containerRegistryService";

const EMPTY_FORM = { hostUrl: "", username: "", password: "" };

// Harbor and Nexus's shared, portal-wide credential form - both are
// almost always self-hosted, plain-username-and-password (Basic auth)
// registries, so one generic component covers both rather than two
// near-identical bespoke ones (see PortalHostCredentials' own comment).
export default function HostCredentialLoginSection({ provider, label, hostPlaceholder, passwordLabel, helpText, onCleared }) {

    const toast = useToast();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        getHostRegistryStatus(provider).then((result) => {
            setStatus(result);
            setLoading(false);
        });

    }

    useEffect(refresh, [provider]);

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveHostRegistryCredentials(provider, form);
            toast.show(`${label} credentials saved for the whole portal.`, "success");
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

            await clearHostRegistryCredentials(provider);
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
                {helpText} Shared by the whole portal — saving here requires an admin
                account, and every visitor browses the same repositories once it's set.
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

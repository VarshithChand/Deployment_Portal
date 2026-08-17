import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";

const EMPTY_FORM = { username: "", token: "" };

// Docker Hub and GHCR's shared, portal-wide credential form (see
// ContainerRegistryController) - one admin connects each once, every
// visitor then browses the same repositories/packages on the Container
// Registry hub. Deliberately NOT session-scoped like AwsLoginSection/
// AzureLoginSection/PaasLoginSection above: statusFn/saveFn/clearFn are
// passed in per-provider (containerRegistryService.js) rather than this
// component branching on a provider string itself, since the two providers'
// username/token labels and help text differ enough to be worth spelling
// out at the call site.
export default function PortalRegistryLoginSection({
    label,
    usernameLabel,
    tokenLabel,
    helpText,
    statusFn,
    saveFn,
    clearFn,
    onCleared
}) {

    const toast = useToast();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        statusFn().then((result) => {
            setStatus(result);
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveFn({ accountId: form.username, token: form.token });
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

            await clearFn();
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

            {!loading && status?.configured && status.username && (
                <p className="field-hint field-hint-good">
                    Username: <strong>{status.username}</strong>
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
                        <label>{usernameLabel}</label>
                        <ClearableInput
                            placeholder={status?.configured ? "Leave blank to keep current username" : ""}
                            value={form.username}
                            onChange={(e) => setForm({ ...form, username: e.target.value })}
                            onClear={() => setForm({ ...form, username: "" })}
                            autoComplete="off"
                        />
                    </div>

                    <div className="form-group">
                        <label>{tokenLabel}</label>
                        <ClearableInput
                            type="password"
                            placeholder={status?.configured ? "Leave blank to keep current token" : ""}
                            value={form.token}
                            onChange={(e) => setForm({ ...form, token: e.target.value })}
                            onClear={() => setForm({ ...form, token: "" })}
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

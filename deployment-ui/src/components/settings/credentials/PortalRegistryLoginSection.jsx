import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";

const EMPTY_FORM = { username: "", token: "" };

// Docker Hub/GHCR's and Azure DevOps' credential form (see
// ContainerRegistryController/AzureDevOpsController) - session-scoped (see
// PortalIdentity), same isolation as AwsLoginSection/AzureLoginSection/
// PaasLoginSection above: each visitor connects their own, never shared
// with any other visitor of the portal. statusFn/saveFn/clearFn are passed
// in per-provider (containerRegistryService.js/azureDevOpsService.js)
// rather than this component branching on a provider string itself, since
// each provider's username/token labels and help text differ enough to be
// worth spelling out at the call site.
export default function PortalRegistryLoginSection({
    label,
    usernameLabel,
    // What the saved identifier is called in the "already configured"
    // status line below the heading (e.g. "Username" for Docker Hub/GHCR,
    // "Organization" for Azure Repos) - defaults to usernameLabel itself so
    // existing callers don't need to pass anything new.
    identityLabel,
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
                    {identityLabel || usernameLabel}: <strong>{status.username}</strong>
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

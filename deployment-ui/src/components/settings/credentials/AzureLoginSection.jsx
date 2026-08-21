import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import useAuth from "../../../hooks/useAuth";
import { getMyAzureSettings, saveMyAzureSettings, clearMyAzureCredentials } from "../../../services/settingsService";

const EMPTY_FORM = { tenantId: "", clientId: "", clientSecret: "", subscriptionId: "" };

// See AwsLoginSection's own copy of this for the full reasoning.
const PIN_SUGGESTION = " Tip: set a screen-lock PIN (Screen Lock tab) to keep this secured.";

// Session-scoped (see PortalIdentity) — same isolation as your GitHub
// token, kept only for this browser. Also powers the Environments page's
// live Azure Web App status panel, which reads the exact same saved
// credentials — entering them once here covers both.
export default function AzureLoginSection({ onCleared }) {

    const toast = useToast();
    const { pinConfigured } = useAuth();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        getMyAzureSettings().then((result) => {
            setStatus(result);
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveMyAzureSettings(form);
            toast.show("Azure credentials saved for this session." + (pinConfigured ? "" : PIN_SUGGESTION), "success");
            setForm(EMPTY_FORM);
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save Azure credentials.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear() {

        try {

            await clearMyAzureCredentials();
            toast.show("Azure credentials cleared.", "success");
            refresh();

            // See AwsLoginSection's own handleClear for why this matters -
            // keeps CredentialsView's unlockedProviders Set in sync with
            // the backend's per-provider revoke on Clear.
            onCleared?.();

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to clear Azure credentials.", "error");

        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                Azure
                {" "}
                {!loading && status?.configured && (
                    <span className="badge badge-success">Configured</span>
                )}
            </h3>

            {/* Best-effort (see CloudStatusService.GetAzureIdentityLabelAsync)
                - resolving an App Registration's own display name needs a
                Graph permission that isn't guaranteed to be granted, so this
                simply doesn't appear rather than showing an error when it
                isn't available. */}
            {!loading && status?.identityLabel && (
                <p className="field-hint field-hint-good">
                    Signed in as: <strong>{status.identityLabel}</strong>
                </p>
            )}

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Powers the Environments page's live Azure Web App status. A service
                principal (App Registration) with read access to the Web App is enough.
                Add a Subscription ID too if you want to browse Azure Container Registry
                from Container Registry, or Cloud Services' own Azure page — Web App
                status alone doesn't need one.
            </p>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <form onSubmit={handleSave}>

                    <div className="form-group">
                        <label htmlFor="azure-tenant-id">Tenant ID</label>
                        <ClearableInput
                            id="azure-tenant-id"
                            placeholder={status?.configured ? "Leave blank to keep current tenant" : ""}
                            value={form.tenantId}
                            onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                            onClear={() => setForm({ ...form, tenantId: "" })}
                            autoComplete="off"
                            name="azure-tenant-id"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="azure-client-id">Client ID</label>
                        <ClearableInput
                            id="azure-client-id"
                            placeholder={status?.configured ? "Leave blank to keep current client ID" : ""}
                            value={form.clientId}
                            onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                            onClear={() => setForm({ ...form, clientId: "" })}
                            autoComplete="off"
                            name="azure-client-id"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="azure-client-secret">Client Secret</label>
                        <ClearableInput
                            id="azure-client-secret"
                            type="password"
                            placeholder={status?.configured ? "Leave blank to keep current secret" : ""}
                            value={form.clientSecret}
                            onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                            onClear={() => setForm({ ...form, clientSecret: "" })}
                            autoComplete="new-password"
                        />
                        <p className="field-hint" style={{ marginTop: "6px" }}>
                            Use the secret's <strong>Value</strong>, not its Secret ID — on the App
                            Registration's "Certificates & secrets" page, the Value column is only
                            shown once, right when you create the secret. If you saved the Secret ID
                            (a shorter GUID) by mistake, create a new secret and copy the Value instead.
                        </p>
                    </div>

                    <div className="form-group">
                        <label htmlFor="azure-subscription-id">Subscription ID (optional — for Azure Container Registry)</label>
                        <ClearableInput
                            id="azure-subscription-id"
                            placeholder={status?.subscriptionId ? `Leave blank to keep "${status.subscriptionId}"` : ""}
                            value={form.subscriptionId}
                            onChange={(e) => setForm({ ...form, subscriptionId: e.target.value })}
                            onClear={() => setForm({ ...form, subscriptionId: "" })}
                            autoComplete="off"
                            name="azure-subscription-id"
                        />
                    </div>

                    <div className="button-row">

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save Azure Credentials"}
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

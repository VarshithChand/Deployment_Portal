import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import { getMyAzureSettings, saveMyAzureSettings, clearMyAzureCredentials } from "../../../services/settingsService";

const EMPTY_FORM = { tenantId: "", clientId: "", clientSecret: "" };

// Session-scoped (see PortalIdentity) — same isolation as your GitHub
// token, kept only for this browser. Also powers the Environments page's
// live Azure Web App status panel, which reads the exact same saved
// credentials — entering them once here covers both.
export default function AzureLoginSection() {

    const toast = useToast();

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
            toast.show("Azure credentials saved for this session.", "success");
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
            </p>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <form onSubmit={handleSave}>

                    <div className="form-group">
                        <label>Tenant ID</label>
                        <ClearableInput
                            placeholder={status?.configured ? "Leave blank to keep current tenant" : ""}
                            value={form.tenantId}
                            onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                            onClear={() => setForm({ ...form, tenantId: "" })}
                            autoComplete="off"
                            name="azure-tenant-id"
                        />
                    </div>

                    <div className="form-group">
                        <label>Client ID</label>
                        <ClearableInput
                            placeholder={status?.configured ? "Leave blank to keep current client ID" : ""}
                            value={form.clientId}
                            onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                            onClear={() => setForm({ ...form, clientId: "" })}
                            autoComplete="off"
                            name="azure-client-id"
                        />
                    </div>

                    <div className="form-group">
                        <label>Client Secret</label>
                        <ClearableInput
                            type="password"
                            placeholder={status?.configured ? "Leave blank to keep current secret" : ""}
                            value={form.clientSecret}
                            onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                            onClear={() => setForm({ ...form, clientSecret: "" })}
                            autoComplete="new-password"
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

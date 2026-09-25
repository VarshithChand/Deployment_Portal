import { useEffect, useState } from "react";

import ClearableInput from "../common/ClearableInput";
import CredentialPinGate from "../settings/credentials/CredentialPinGate";
import useToast from "../../hooks/useToast";
import useAuth from "../../hooks/useAuth";
import { getTerraformCredentials, saveTerraformCredentials, clearTerraformCredentials } from "../../services/terraformService";

const EMPTY_FORM = { tenantId: "", clientId: "", clientSecret: "", subscriptionId: "" };

// Same screen-lock PIN gate as every other secret-bearing credential form
// in this app (see CredentialPinGate's own header comment) - "terraform" is
// its own provider key, deliberately separate from "azure", since this is a
// different service principal with a different (likely much broader) trust
// level than the read-only one Settings > Credentials > Azure stores.
export default function TerraformCredentialsSection() {

    const toast = useToast();
    const { pinConfigured } = useAuth();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [unlocked, setUnlocked] = useState(false);

    function refresh() {

        setLoading(true);

        getTerraformCredentials().then((result) => {
            setStatus(result);
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveTerraformCredentials(form);
            toast.show("Terraform credentials saved.", "success");
            setForm(EMPTY_FORM);
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save Terraform credentials.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear() {

        try {

            await clearTerraformCredentials();
            toast.show("Terraform credentials cleared.", "success");
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to clear Terraform credentials.", "error");

        }

    }

    return (

        <CredentialPinGate provider="terraform" unlocked={unlocked} onUnlocked={() => setUnlocked(true)}>

            <div className="settings-subsection">

                <h3 className="settings-subhead">
                    Azure Service Principal
                    {" "}
                    {!loading && status?.configured && (
                        <span className="badge badge-success">Configured</span>
                    )}
                </h3>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    A dedicated App Registration for your Terraform infrastructure - kept separate
                    from the Azure credentials under Settings → Credentials, which are read-only and
                    scoped to status checks. This page never calls out to Azure on its own; these
                    values are stored here purely for your own reference when running Terraform
                    yourself, locally.
                </p>

                {loading ? (

                    <p className="field-hint">Loading...</p>

                ) : (

                    <form onSubmit={handleSave}>

                        <div className="form-group">
                            <label htmlFor="tf-tenant-id">Tenant ID</label>
                            <ClearableInput
                                id="tf-tenant-id"
                                placeholder={status?.configured ? "Leave blank to keep current tenant" : ""}
                                value={form.tenantId}
                                onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                                onClear={() => setForm({ ...form, tenantId: "" })}
                                autoComplete="off"
                                name="tf-tenant-id"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="tf-client-id">Client ID</label>
                            <ClearableInput
                                id="tf-client-id"
                                placeholder={status?.configured ? "Leave blank to keep current client ID" : ""}
                                value={form.clientId}
                                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                                onClear={() => setForm({ ...form, clientId: "" })}
                                autoComplete="off"
                                name="tf-client-id"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="tf-client-secret">Client Secret</label>
                            <ClearableInput
                                id="tf-client-secret"
                                type="password"
                                placeholder={status?.configured ? "Leave blank to keep current secret" : ""}
                                value={form.clientSecret}
                                onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                                onClear={() => setForm({ ...form, clientSecret: "" })}
                                autoComplete="new-password"
                            />
                            <p className="field-hint" style={{ marginTop: "6px" }}>
                                Use the secret's <strong>Value</strong>, not its Secret ID - only shown once, right
                                when you create it on the App Registration's "Certificates &amp; secrets" page.
                            </p>
                        </div>

                        <div className="form-group">
                            <label htmlFor="tf-subscription-id">Subscription ID</label>
                            <ClearableInput
                                id="tf-subscription-id"
                                placeholder={status?.subscriptionId ? "Leave blank to keep current subscription ID" : ""}
                                value={form.subscriptionId}
                                onChange={(e) => setForm({ ...form, subscriptionId: e.target.value })}
                                onClear={() => setForm({ ...form, subscriptionId: "" })}
                                autoComplete="off"
                                name="tf-subscription-id"
                            />
                        </div>

                        <div className="button-row">

                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? "Saving..." : "Save Credentials"}
                            </button>

                            {status?.configured && (

                                <button type="button" className="btn btn-danger" onClick={handleClear}>
                                    Clear Credentials
                                </button>

                            )}

                        </div>

                        {!pinConfigured && (
                            <p className="field-hint" style={{ marginTop: "10px" }}>
                                Tip: set a screen-lock PIN (Settings → Credentials → Screen Lock) to keep this secured.
                            </p>
                        )}

                    </form>

                )}

            </div>

        </CredentialPinGate>

    );

}

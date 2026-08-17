import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import useAuth from "../../../hooks/useAuth";
import { getPaasStatus, savePaasCredentials, clearPaasCredentials } from "../../../services/paasService";

const EMPTY_FORM = { token: "", accountId: "" };

// See AwsLoginSection's own copy of this for the full reasoning.
const PIN_SUGGESTION = " Tip: set a screen-lock PIN (Screen Lock tab) to keep this secured.";

// One generic form reused for Render/Cloudflare/Netlify/Vercel (mirrors
// GcpLoginSection's simple "form always visible, Save + Clear together"
// shape - none of these four need AWS's SSO/MFA-session complexity).
// Session-scoped (see PortalIdentity), same isolation as every other
// credential on this page. Also powers the Hosting Providers page's status
// cards, which read these exact same saved credentials - entering them
// once here covers both.
export default function PaasLoginSection({ provider, label, hasAccountId = false, onCleared }) {

    const toast = useToast();
    const { pinConfigured } = useAuth();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        getPaasStatus(provider).then((result) => {
            setStatus(result);
            setLoading(false);
        });

    }

    useEffect(refresh, [provider]);

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await savePaasCredentials(provider, form);
            toast.show(`${label} credentials saved for this session.` + (pinConfigured ? "" : PIN_SUGGESTION), "success");
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

            await clearPaasCredentials(provider);
            toast.show(`${label} credentials cleared.`, "success");
            refresh();

            // See AwsLoginSection's own handleClear for why this matters -
            // keeps CredentialsView's unlockedProviders Set in sync with
            // the backend's per-provider revoke on Clear.
            onCleared?.();

        }
        catch (err) {

            console.error(err);
            toast.show(`Unable to clear ${label} credentials.`, "error");

        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                {label}
                {" "}
                {!loading && status?.configured && (
                    <span className={`badge ${status.found ? "badge-success" : "badge-warning"}`}>
                        {status.found ? "Connected" : "Configured"}
                    </span>
                )}
            </h3>

            {!loading && status?.configured && status.found && status.accountLabel && (
                <p className="field-hint field-hint-good">
                    Signed in as: <strong>{status.accountLabel}</strong>
                </p>
            )}

            {!loading && status?.configured && !status.found && (
                <p className="error-message">{status.error || `Unable to reach ${label}.`}</p>
            )}

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

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

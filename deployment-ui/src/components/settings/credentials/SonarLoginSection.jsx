import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import { getSonarStatus, saveSonarCredentials, clearSonarCredentials } from "../../../services/sonarService";

const EMPTY_FORM = { hostUrl: "", organization: "", projectKey: "", token: "" };

// SonarQube and SonarCloud's shared form shape - two fully independent,
// session-scoped credentials (each visitor connects their own, isolated
// from every other visitor - see SettingsService.SaveUserSonarCredentialsAsync's
// own comment on why they're split). hasHostUrl distinguishes them: only
// self-hosted SonarQube needs one (no sensible default); SonarCloud's is
// always sonarcloud.io, forced server-side.
export default function SonarLoginSection({ provider, label, hasHostUrl, onCleared }) {

    const toast = useToast();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        getSonarStatus(provider).then((result) => {
            setStatus(result);
            setLoading(false);
        });

    }

    useEffect(refresh, [provider]);

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveSonarCredentials(provider, form);
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

            await clearSonarCredentials(provider);
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

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Powers the Code Quality page's {label} tab — a project and a token with
                permission to read its analysis. The token is only ever used server-side, never
                sent to the browser. Kept for your own session only — isolated from every other
                visitor of the portal.
            </p>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <form onSubmit={handleSave}>

                    {hasHostUrl && (

                        <div className="form-group">
                            <label htmlFor={`${provider}-host-url`}>Host URL</label>
                            <ClearableInput
                                id={`${provider}-host-url`}
                                placeholder={status?.hostUrl || "https://sonarqube.mycompany.com"}
                                value={form.hostUrl}
                                onChange={(e) => setForm({ ...form, hostUrl: e.target.value })}
                                onClear={() => setForm({ ...form, hostUrl: "" })}
                                autoComplete="off"
                                name={`${provider}-host-url`}
                            />
                        </div>

                    )}

                    <div className="form-group">
                        <label htmlFor={`${provider}-organization`}>Organization</label>
                        <ClearableInput
                            id={`${provider}-organization`}
                            placeholder={status?.organization || "your-sonarcloud-org"}
                            value={form.organization}
                            onChange={(e) => setForm({ ...form, organization: e.target.value })}
                            onClear={() => setForm({ ...form, organization: "" })}
                            autoComplete="off"
                            name={`${provider}-organization`}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor={`${provider}-project-key`}>Project Key</label>
                        <ClearableInput
                            id={`${provider}-project-key`}
                            placeholder={status?.projectKey || "VarshithChand_yaml"}
                            value={form.projectKey}
                            onChange={(e) => setForm({ ...form, projectKey: e.target.value })}
                            onClear={() => setForm({ ...form, projectKey: "" })}
                            autoComplete="off"
                            name={`${provider}-project-key`}
                        />
                    </div>

                    <div className="form-group">
                        <label>
                            Token
                            {" "}
                            {status?.configured && (
                                <span className="badge badge-success">Saved</span>
                            )}
                        </label>
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
                            {saving ? "Saving..." : `Save ${label} Settings`}
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

import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import { getJfrogStatus, saveJfrogCredentials, clearJfrogCredentials } from "../../../services/containerRegistryService";

const EMPTY_FORM = { hostUrl: "", token: "" };

// JFrog Artifactory's session-scoped credential form (see
// ContainerRegistryController) - each visitor connects their own, isolated
// from every other visitor. Every Artifactory instance is its own domain
// (unlike Docker Hub/GHCR's fixed hosts), so this needs its own Host URL
// field rather than reusing PortalRegistryLoginSection's generic
// username/token shape.
export default function JfrogLoginSection({ onCleared }) {

    const toast = useToast();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        getJfrogStatus().then((result) => {
            setStatus(result);
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveJfrogCredentials(form);
            toast.show("JFrog credentials saved for this session.", "success");
            setForm(EMPTY_FORM);
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save JFrog credentials.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear() {

        try {

            await clearJfrogCredentials();
            toast.show("JFrog credentials cleared.", "success");
            refresh();
            onCleared?.();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to clear JFrog credentials.", "error");

        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                JFrog Artifactory
                {" "}
                {!loading && status?.configured && (
                    <span className="badge badge-success">Configured</span>
                )}
            </h3>

            {!loading && status?.configured && status.hostUrl && (
                <p className="field-hint field-hint-good">
                    Instance: <strong>{status.hostUrl}</strong>
                </p>
            )}

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Powers the Container Registry hub's JFrog tab — your Artifactory instance's base
                URL (e.g. https://mycompany.jfrog.io/artifactory) and an Access Token with read
                access to its Docker repositories. Kept for your own session only — isolated
                from every other visitor of the portal.
            </p>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <form onSubmit={handleSave}>

                    <div className="form-group">
                        <label>Host URL</label>
                        <ClearableInput
                            placeholder={status?.hostUrl || "https://mycompany.jfrog.io/artifactory"}
                            value={form.hostUrl}
                            onChange={(e) => setForm({ ...form, hostUrl: e.target.value })}
                            onClear={() => setForm({ ...form, hostUrl: "" })}
                            autoComplete="off"
                            name="jfrog-host-url"
                        />
                    </div>

                    <div className="form-group">
                        <label>Access Token</label>
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
                            {saving ? "Saving..." : "Save JFrog Credentials"}
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

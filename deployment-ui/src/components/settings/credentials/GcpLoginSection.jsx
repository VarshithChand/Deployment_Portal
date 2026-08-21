import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import useAuth from "../../../hooks/useAuth";
import { getMyGcpSettings, saveMyGcpSettings, clearMyGcpCredentials } from "../../../services/settingsService";

const EMPTY_FORM = { projectId: "", serviceAccountKeyJson: "", location: "" };

// See AwsLoginSection's own copy of this for the full reasoning.
const PIN_SUGGESTION = " Tip: set a screen-lock PIN (Screen Lock tab) to keep this secured.";

// Session-scoped (see PortalIdentity), same as AWS/Azure above — powers
// Container Registry's Artifact Registry tab (see
// CloudServiceManagementService.GetArtifactRegistryRepositoriesAsync),
// the first feature in this portal to actually read GCP credentials.
export default function GcpLoginSection({ onCleared }) {

    const toast = useToast();
    const { pinConfigured } = useAuth();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        getMyGcpSettings().then((result) => {
            setStatus(result);
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveMyGcpSettings(form);
            toast.show("GCP credentials saved for this session." + (pinConfigured ? "" : PIN_SUGGESTION), "success");
            setForm(EMPTY_FORM);
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save GCP credentials.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear() {

        try {

            await clearMyGcpCredentials();
            toast.show("GCP credentials cleared.", "success");
            refresh();

            // See AwsLoginSection's own handleClear for why this matters -
            // keeps CredentialsView's unlockedProviders Set in sync with
            // the backend's per-provider revoke on Clear.
            onCleared?.();

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to clear GCP credentials.", "error");

        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                GCP
                {" "}
                {!loading && status?.configured && (
                    <span className="badge badge-success">Configured</span>
                )}
            </h3>

            {/* No API call needed for this one - the service account's own
                JSON key already carries its email address (client_email),
                so this is just the backend echoing back a field from what
                you already pasted in, not a live lookup. */}
            {!loading && status?.identityLabel && (
                <p className="field-hint field-hint-good">
                    Service account: <strong>{status.identityLabel}</strong>
                </p>
            )}

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Powers Container Registry's Artifact Registry tab. A service account's JSON
                key is what every GCP server-to-server API authenticates with — grant it
                Artifact Registry Reader if you want to browse images with it.
            </p>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <form onSubmit={handleSave}>

                    <div className="form-group">
                        <label htmlFor="gcp-project-id">Project ID</label>
                        <ClearableInput
                            id="gcp-project-id"
                            placeholder={status?.projectId ? `Leave blank to keep "${status.projectId}"` : "my-gcp-project"}
                            value={form.projectId}
                            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                            onClear={() => setForm({ ...form, projectId: "" })}
                            autoComplete="off"
                            name="gcp-project-id"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="gcp-service-account-key">
                            Service Account Key (JSON)
                            {" "}
                            {status?.configured && (
                                <span className="badge badge-success">Saved</span>
                            )}
                        </label>
                        <textarea
                            id="gcp-service-account-key"
                            className="form-control"
                            rows={6}
                            placeholder={status?.configured ? "Leave blank to keep the current key" : '{ "type": "service_account", ... }'}
                            value={form.serviceAccountKeyJson}
                            onChange={(e) => setForm({ ...form, serviceAccountKeyJson: e.target.value })}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="gcp-location">Location (for Artifact Registry)</label>
                        <ClearableInput
                            id="gcp-location"
                            placeholder={status?.location ? `Leave blank to keep "${status.location}"` : "us-central1"}
                            value={form.location}
                            onChange={(e) => setForm({ ...form, location: e.target.value })}
                            onClear={() => setForm({ ...form, location: "" })}
                            autoComplete="off"
                            name="gcp-location"
                        />
                    </div>

                    <div className="button-row">

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save GCP Credentials"}
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

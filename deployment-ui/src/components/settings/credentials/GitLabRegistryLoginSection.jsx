import { useEffect, useState } from "react";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import {
    getGitLabRegistryStatus, saveGitLabRegistryCredentials, clearGitLabRegistryCredentials
} from "../../../services/containerRegistryService";

const DEFAULT_HOST = "https://gitlab.com";
const EMPTY_FORM = { hostUrl: "", projectId: "", token: "" };

// GitLab Container Registry's session-scoped credential form (see
// ContainerRegistryController) - each visitor connects their own, isolated
// from every other visitor. Unlike Docker Hub/GHCR, GitLab has no single
// "list every registry" call; the registry is scoped to one project, and a
// self-hosted GitLab instance needs its own host too, so this needs its own
// 3-field form rather than reusing PortalRegistryLoginSection's generic
// username/token shape.
export default function GitLabRegistryLoginSection({ onCleared }) {

    const toast = useToast();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    function refresh() {

        setLoading(true);

        getGitLabRegistryStatus().then((result) => {
            setStatus(result);
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    async function handleSave(e) {

        e.preventDefault();
        setSaving(true);

        try {

            await saveGitLabRegistryCredentials(form);
            toast.show("GitLab Registry credentials saved for this session.", "success");
            setForm(EMPTY_FORM);
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save GitLab Registry credentials.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClear() {

        try {

            await clearGitLabRegistryCredentials();
            toast.show("GitLab Registry credentials cleared.", "success");
            refresh();
            onCleared?.();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to clear GitLab Registry credentials.", "error");

        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                GitLab Registry
                {" "}
                {!loading && status?.configured && (
                    <span className="badge badge-success">Configured</span>
                )}
            </h3>

            {!loading && status?.configured && (
                <p className="field-hint field-hint-good">
                    Project: <strong>{status.projectId}</strong> on <strong>{status.hostUrl}</strong>
                </p>
            )}

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Powers the Container Registry hub's GitLab tab — a Personal Access Token with the
                read_registry (or read_api) scope, and the project that owns the registry (numeric
                ID, or the URL-encoded namespace/project path). Kept for your own session only —
                isolated from every other visitor of the portal.
            </p>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <form onSubmit={handleSave}>

                    <div className="form-group">
                        <label htmlFor="gitlab-host-url">Host URL</label>
                        <ClearableInput
                            id="gitlab-host-url"
                            placeholder={status?.hostUrl || DEFAULT_HOST}
                            value={form.hostUrl}
                            onChange={(e) => setForm({ ...form, hostUrl: e.target.value })}
                            onClear={() => setForm({ ...form, hostUrl: DEFAULT_HOST })}
                            autoComplete="off"
                            name="gitlab-host-url"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="gitlab-project-id">Project ID or path</label>
                        <ClearableInput
                            id="gitlab-project-id"
                            placeholder={status?.configured ? `Leave blank to keep "${status.projectId}"` : "e.g. 12345 or mygroup/myproject"}
                            value={form.projectId}
                            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                            onClear={() => setForm({ ...form, projectId: "" })}
                            autoComplete="off"
                            name="gitlab-project-id"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="gitlab-token">Personal Access Token</label>
                        <ClearableInput
                            id="gitlab-token"
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
                            {saving ? "Saving..." : "Save GitLab Registry Credentials"}
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

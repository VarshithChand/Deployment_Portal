import { useEffect, useState } from "react";

import CopyButton from "../../common/CopyButton";
import useToast from "../../../hooks/useToast";
import useConfirm from "../../../hooks/useConfirm";
import useAuth from "../../../hooks/useAuth";
import { getMyApiKeys, createMyApiKey, revokeMyApiKey } from "../../../services/securityService";

// See AwsLoginSection's own copy of this for the full reasoning.
const PIN_SUGGESTION = "Tip: set a screen-lock PIN (Screen Lock tab) to keep this secured.";

// Self-service API key management — the non-admin counterpart to
// Services > Security's admin-only "everyone's keys" panel. Session-
// scoped like GitHub/AWS/Azure/GCP above: only ever the caller's own
// key(s), backed by the /mine endpoints (see SecurityApiKeysController),
// which check ownership server-side too, not just hide the UI for it.
export default function ApiKeySection() {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();
    const { pinConfigured } = useAuth();

    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newKeyName, setNewKeyName] = useState("");
    const [justCreatedKey, setJustCreatedKey] = useState(null);

    function refresh() {

        setLoading(true);

        getMyApiKeys()
            .then((response) => setKeys(Array.isArray(response.data) ? response.data : []))
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));

    }

    useEffect(refresh, []);

    async function handleCreate(e) {

        e.preventDefault();

        try {

            const response = await createMyApiKey(newKeyName.trim() || "Unnamed key");
            setJustCreatedKey(response.data);
            setNewKeyName("");
            refresh();

            if (!pinConfigured) {
                toast.show(PIN_SUGGESTION, "success");
            }

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to create API key.", "error");

        }

    }

    async function handleRevoke(id, name) {

        if (!(await confirm({
            title: "Revoke API key?",
            message: `Revoke '${name}'? Anything using it will stop working immediately.`,
            confirmLabel: "Revoke",
            danger: true
        }))) {
            return;
        }

        try {

            await revokeMyApiKey(id);
            toast.show(`Revoked '${name}'.`, "success");
            refresh();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to revoke API key.", "error");

        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">API Key</h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                A key for calling this portal's own API programmatically — yours alone,
                not shared with or visible to other PAT users.
            </p>

            {justCreatedKey && (

                <div className="repo-preview" style={{ marginBottom: 16, borderColor: "var(--heading-accent)" }}>

                    <p className="repo-preview-description">
                        <strong>{justCreatedKey.name}</strong> created — copy this key now,
                        it won't be shown again:
                    </p>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <code className="commit-sha">{justCreatedKey.key}</code>
                        <CopyButton value={justCreatedKey.key} label="Copy API key" />
                    </div>

                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: 10 }}
                        onClick={() => setJustCreatedKey(null)}
                    >
                        Dismiss
                    </button>

                </div>

            )}

            <form style={{ display: "flex", gap: 10, marginBottom: 20 }} onSubmit={handleCreate}>
                <input
                    className="form-control"
                    placeholder="Key name (e.g. CI pipeline)"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">Create Key</button>
            </form>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : keys.length === 0 ? (

                <p className="empty-state">No API keys yet — create one above.</p>

            ) : (

                <div className="api-key-grid">

                {keys.map((k) => (

                    <div key={k.id} className="repo-preview api-key-card">

                        <div className="api-key-card-header">

                            <strong>{k.name}</strong>

                            <span className={`badge ${k.revoked ? "badge-danger" : "badge-success"}`}>
                                {k.revoked ? "revoked" : "active"}
                            </span>

                        </div>

                        <code className="commit-sha">{k.prefix}...</code>

                        <p className="api-key-card-meta">
                            Created {new Date(k.createdAt).toLocaleDateString()}
                        </p>

                        {!k.revoked && (
                            <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => handleRevoke(k.id, k.name)}
                            >
                                Revoke
                            </button>
                        )}

                    </div>

                ))}

                </div>

            )}

            {dialog}

        </div>

    );

}

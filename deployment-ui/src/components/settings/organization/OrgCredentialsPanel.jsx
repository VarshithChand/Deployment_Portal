import { useEffect, useState } from "react";

import useToast from "../../../hooks/useToast";
import useConfirm from "../../../hooks/useConfirm";
import {
    listOrganizationCredentials, createOrganizationCredential, deleteOrganizationCredential
} from "../../../services/organizationService";

const PROVIDER_FIELDS = {
    // Name + PAT only - no separate Owner/Repository fields. config_json
    // ends up empty for a GitHub credential added this way, which
    // OrgCredentialService.GetGitHubCredentialForDeployAsync already
    // handles (Owner/Repository just come back blank) - DeploymentController's
    // org-scoped deploy path already checks for exactly that and returns
    // "This organization doesn't have a GitHub credential configured yet"
    // rather than failing unexpectedly. In practice this means an
    // org-scoped deploy needs the credential's Owner/Repository added back
    // some other way before it can actually target a repo - this
    // simplification trades that off for a faster "just paste a PAT" add
    // flow, matching how this field set was explicitly requested.
    github: [],
    aws: [
        { key: "accessKeyId", label: "Access Key ID" },
        { key: "region", label: "Region" }
    ],
    azure: [
        { key: "tenantId", label: "Tenant ID" },
        { key: "clientId", label: "Client ID" },
        { key: "subscriptionId", label: "Subscription ID" }
    ]
};

const PROVIDER_SECRET_LABEL = {
    github: "Personal Access Token",
    aws: "Secret Access Key",
    azure: "Client Secret"
};

const emptyForm = { provider: "github", name: "", config: {}, secret: "" };

// Settings > Organizations > Credentials - the frontend for
// OrgCredentialService/OrganizationCredentialsController (built in Phase
// 2, alongside the org-scoped deploy/cloud-services integration, but with
// no UI until now - without this, an org Admin had no way to actually
// populate organization_credentials at all except a raw API call).
// credentials.write-gated for add/delete, credentials.read for viewing the
// masked list - never a secret value in any response this reads.
export default function OrgCredentialsPanel({ orgId, canWrite }) {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [credentials, setCredentials] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    function load() {
        setLoading(true);
        listOrganizationCredentials(orgId)
            .then((result) => setCredentials(result.credentials || []))
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId]);

    function updateConfigField(key, value) {
        setForm((prev) => ({ ...prev, config: { ...prev.config, [key]: value } }));
    }

    async function handleSubmit(e) {

        e.preventDefault();
        setSaving(true);

        try {

            const result = await createOrganizationCredential(orgId, form);

            if (!result.success) {
                toast.show(result.message || "Unable to save credential.", "error");
                return;
            }

            toast.show("Credential saved.", "success");
            setForm(emptyForm);
            setAdding(false);
            load();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to save credential.", "error");
        }
        finally {
            setSaving(false);
        }

    }

    async function handleDelete(credential) {

        if (!(await confirm({
            title: "Delete this credential?",
            message: `"${credential.name}" will no longer be usable for deployments or cloud actions in this organization.`,
            confirmLabel: "Delete Credential",
            danger: true
        }))) {
            return;
        }

        try {
            await deleteOrganizationCredential(orgId, credential.id);
            toast.show("Credential deleted.", "success");
            load();
        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to delete credential.", "error");
        }

    }

    return (

        <div className="settings-subsection">

            {dialog}

            <div className="access-panel-header">
                <h3 className="settings-subhead" style={{ margin: 0 }}>Credentials</h3>
                {canWrite && !adding && (
                    <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                        + Add Credential
                    </button>
                )}
            </div>

            {adding && (

                <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>

                    <div className="form-group">
                        <label htmlFor="cred-provider">Provider</label>
                        <select
                            id="cred-provider"
                            className="form-control"
                            value={form.provider}
                            onChange={(e) => setForm({ ...emptyForm, provider: e.target.value })}
                        >
                            <option value="github">GitHub</option>
                            <option value="aws">AWS</option>
                            <option value="azure">Azure</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="cred-name">Name</label>
                        <input
                            id="cred-name"
                            type="text"
                            className="form-control"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="e.g. Production GitHub"
                            required
                        />
                    </div>

                    {PROVIDER_FIELDS[form.provider].map((field) => (
                        <div className="form-group" key={field.key}>
                            <label htmlFor={`cred-${field.key}`}>{field.label}</label>
                            <input
                                id={`cred-${field.key}`}
                                type="text"
                                className="form-control"
                                value={form.config[field.key] || ""}
                                onChange={(e) => updateConfigField(field.key, e.target.value)}
                            />
                        </div>
                    ))}

                    <div className="form-group">
                        <label htmlFor="cred-secret">{PROVIDER_SECRET_LABEL[form.provider]}</label>
                        <input
                            id="cred-secret"
                            type="password"
                            className="form-control"
                            value={form.secret}
                            onChange={(e) => setForm({ ...form, secret: e.target.value })}
                            autoComplete="off"
                            required
                        />
                    </div>

                    <div className="button-row">
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save Credential"}
                        </button>
                        <button type="button" className="btn" disabled={saving} onClick={() => { setAdding(false); setForm(emptyForm); }}>
                            Cancel
                        </button>
                    </div>

                </form>

            )}

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : credentials.length === 0 ? (

                <p className="empty-state">No credentials configured yet.</p>

            ) : (

                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Provider</th>
                                <th>Status</th>
                                {canWrite && <th><span className="visually-hidden">Actions</span></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {credentials.map((cred) => (
                                <tr key={cred.id}>
                                    <td>{cred.name}</td>
                                    <td><span className="badge">{cred.provider}</span></td>
                                    <td>
                                        <span className={`badge ${cred.configured ? "badge-success" : "badge-secondary"}`}>
                                            {cred.configured ? "Configured" : "Incomplete"}
                                        </span>
                                    </td>
                                    {canWrite && (
                                        <td>
                                            <button type="button" className="btn btn-danger" onClick={() => handleDelete(cred)}>
                                                Delete
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

            )}

        </div>

    );

}

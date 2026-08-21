import { useEffect, useState } from "react";

import formatBytes from "../../utils/formatBytes";
import useToast from "../../hooks/useToast";
import useNavigation from "../../hooks/useNavigation";
import { getEnvironmentCloudStatus } from "../../services/environmentsService";
import { PROVIDER_LABEL } from "./CloudProviderBadge";
import {
    saveMyAwsSettings, clearMyAwsCredentials,
    saveMyAzureSettings, clearMyAzureCredentials
} from "../../services/settingsService";

const EMPTY_AWS_FORM = { accessKeyId: "", secretAccessKey: "", region: "" };
const EMPTY_AZURE_FORM = { tenantId: "", clientId: "", clientSecret: "" };

const PAAS_PROVIDERS = ["render", "cloudflare", "netlify", "vercel"];

// The live AWS ECS/ECR, Azure Web App, or Render/Cloudflare/Netlify/Vercel
// panel on an environment's detail view. AWS/Azure credentials are entered
// right here per browser session (see PortalIdentity/UserAwsCredentials on
// the backend); Render/Cloudflare/Netlify/Vercel credentials live on
// Settings → Credentials instead (see PaasLoginSection) - either way,
// never portal-wide, never sent anywhere except this backend's own calls
// made on your behalf.
export default function CloudStatusPanel({
    environmentName, cloudProvider,
    renderServiceId, cloudflareAccountId, cloudflareProjectName,
    netlifySiteId, vercelProjectId,
    autoDetected, detectionEvidence
}) {

    const toast = useToast();
    const { setTab } = useNavigation();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingCredentials, setEditingCredentials] = useState(false);

    const [awsForm, setAwsForm] = useState(EMPTY_AWS_FORM);
    const [azureForm, setAzureForm] = useState(EMPTY_AZURE_FORM);

    function loadStatus() {

        setLoading(true);

        getEnvironmentCloudStatus(environmentName).then((result) => {

            setStatus(result);
            setLoading(false);

        });

    }

    useEffect(() => {

        setEditingCredentials(false);
        loadStatus();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [environmentName]);

    if (cloudProvider === "none") {

        return (

            <div className="card">

                <h2 className="card-title">
                    Cloud Status
                </h2>

                <p className="empty-state">
                    No AWS, Azure, Render, Cloudflare, Netlify, or Vercel target configured for
                    this environment yet — set one in Settings → Environments, or (for AWS/Azure/
                    Render/Cloudflare) add a deploy step to "{environmentName}"'s workflow and
                    it'll be detected automatically.
                </p>

            </div>

        );

    }

    if (PAAS_PROVIDERS.includes(cloudProvider)) {

        const targetId = {
            render: renderServiceId,
            cloudflare: cloudflareProjectName,
            netlify: netlifySiteId,
            vercel: vercelProjectId
        }[cloudProvider];

        return (

            <div className="card">

                <h2 className="card-title">
                    Cloud Status — {PROVIDER_LABEL[cloudProvider]}
                </h2>

                {cloudProvider === "cloudflare" && cloudflareAccountId && (
                    <div className="info-row">
                        <span>Configured Cloudflare Account ID</span>
                        <strong className="smoke-test-metric-mono">{cloudflareAccountId}</strong>
                    </div>
                )}

                {loading && (
                    <p className="empty-state">Checking...</p>
                )}

                {!loading && !status?.configured && (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Connect your own {PROVIDER_LABEL[cloudProvider]} account in{" "}
                        <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("settings")}>
                            Settings → Credentials
                        </button>
                        {" "}to see this environment's live status.
                    </p>

                )}

                {!loading && status?.configured && !status.found && (
                    <p className="error-message">{status.error || `Unable to reach ${PROVIDER_LABEL[cloudProvider]}.`}</p>
                )}

                {!loading && status?.configured && status.found && status.paasService && (

                    <>

                    <div className="info-row">
                        <span>Name</span>
                        <strong>{status.paasService.name}</strong>
                    </div>

                    <div className="info-row">
                        <span>Type</span>
                        <strong>{status.paasService.type || "—"}</strong>
                    </div>

                    <div className="info-row">
                        <span>Status</span>
                        <strong>{status.paasService.status || "—"}</strong>
                    </div>

                    {status.paasService.url && (
                        <div className="info-row">
                            <span>URL</span>
                            <strong>
                                <a href={status.paasService.url} target="_blank" rel="noreferrer">{status.paasService.url}</a>
                            </strong>
                        </div>
                    )}

                    <div className="info-row">
                        <span>Updated</span>
                        <strong>{status.paasService.updatedAt ? new Date(status.paasService.updatedAt).toLocaleString() : "—"}</strong>
                    </div>

                    {status.metrics?.length > 0 ? (

                        status.metrics.map((series) => (

                            <div key={series.name} style={{ marginTop: "12px" }}>

                                <p className="field-hint">{series.name} ({series.unit})</p>

                                <ul className="field-hint" style={{ paddingLeft: "18px" }}>
                                    {series.points.slice(-5).map((p, i) => (
                                        <li key={i}>{new Date(p.timestamp).toLocaleTimeString()}: {p.value}</li>
                                    ))}
                                </ul>

                            </div>

                        ))

                    ) : (

                        <p className="field-hint" style={{ marginTop: "12px" }}>
                            Usage metrics aren't available for {PROVIDER_LABEL[cloudProvider]} yet.
                        </p>

                    )}

                    </>

                )}

                {!targetId && (
                    <p className="field-hint" style={{ marginTop: "12px" }}>
                        No target configured yet — set one in Settings → Environments.
                    </p>
                )}

                {autoDetected && (
                    <p className="field-hint" style={{ marginTop: "12px" }}>Detected from this environment's pipeline.</p>
                )}

                {detectionEvidence?.length > 0 && (

                    <ul className="field-hint" style={{ margin: "12px 0 0", paddingLeft: "18px" }}>
                        {detectionEvidence.map((line, i) => (
                            <li key={i}>{line}</li>
                        ))}
                    </ul>

                )}

            </div>

        );

    }

    async function handleSaveCredentials(e) {

        e.preventDefault();
        setSaving(true);

        try {

            if (cloudProvider === "aws") {
                await saveMyAwsSettings(awsForm);
            }
            else {
                await saveMyAzureSettings(azureForm);
            }

            toast.show(`${cloudProvider === "aws" ? "AWS" : "Azure"} credentials saved for this session.`, "success");
            setEditingCredentials(false);
            setAwsForm(EMPTY_AWS_FORM);
            setAzureForm(EMPTY_AZURE_FORM);
            loadStatus();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save credentials.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    async function handleClearCredentials() {

        try {

            if (cloudProvider === "aws") {
                await clearMyAwsCredentials();
            }
            else {
                await clearMyAzureCredentials();
            }

            toast.show("Credentials cleared.", "success");
            loadStatus();

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to clear credentials.", "error");

        }

    }

    return (

        <div className="card">

            <h2 className="card-title">
                Cloud Status — {cloudProvider === "aws" ? "AWS" : "Azure"}
            </h2>

            {loading && (
                <p className="empty-state">Checking...</p>
            )}

            {!loading && status && !status.configured && !editingCredentials && (

                <>

                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your {cloudProvider === "aws" ? "AWS" : "Azure"} credentials to see this
                    environment's live status. Kept only for this browser's session, never shared
                    portal-wide.
                </p>

                <button type="button" className="btn btn-primary" onClick={() => setEditingCredentials(true)}>
                    Enter {cloudProvider === "aws" ? "AWS" : "Azure"} Credentials
                </button>

                </>

            )}

            {!loading && editingCredentials && cloudProvider === "aws" && (

                <form onSubmit={handleSaveCredentials}>

                    <div className="form-group">
                        <label htmlFor="cloudstatus-aws-access-key-id">Access Key ID</label>
                        <input
                            id="cloudstatus-aws-access-key-id"
                            className="form-control"
                            value={awsForm.accessKeyId}
                            onChange={(e) => setAwsForm({ ...awsForm, accessKeyId: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="cloudstatus-aws-secret-access-key">Secret Access Key</label>
                        <input
                            id="cloudstatus-aws-secret-access-key"
                            type="password"
                            className="form-control"
                            value={awsForm.secretAccessKey}
                            onChange={(e) => setAwsForm({ ...awsForm, secretAccessKey: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="cloudstatus-aws-region">Region (used if the environment doesn't set its own)</label>
                        <input
                            id="cloudstatus-aws-region"
                            className="form-control"
                            placeholder="us-east-1"
                            value={awsForm.region}
                            onChange={(e) => setAwsForm({ ...awsForm, region: e.target.value })}
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? "Saving..." : "Save & Check"}
                    </button>

                    <button type="button" className="btn" onClick={() => setEditingCredentials(false)} disabled={saving}>
                        Cancel
                    </button>

                </form>

            )}

            {!loading && editingCredentials && cloudProvider === "azure" && (

                <form onSubmit={handleSaveCredentials}>

                    <div className="form-group">
                        <label htmlFor="cloudstatus-azure-tenant-id">Tenant ID</label>
                        <input
                            id="cloudstatus-azure-tenant-id"
                            className="form-control"
                            value={azureForm.tenantId}
                            onChange={(e) => setAzureForm({ ...azureForm, tenantId: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="cloudstatus-azure-client-id">Client ID</label>
                        <input
                            id="cloudstatus-azure-client-id"
                            className="form-control"
                            value={azureForm.clientId}
                            onChange={(e) => setAzureForm({ ...azureForm, clientId: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="cloudstatus-azure-client-secret">Client Secret</label>
                        <input
                            id="cloudstatus-azure-client-secret"
                            type="password"
                            className="form-control"
                            value={azureForm.clientSecret}
                            onChange={(e) => setAzureForm({ ...azureForm, clientSecret: e.target.value })}
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? "Saving..." : "Save & Check"}
                    </button>

                    <button type="button" className="btn" onClick={() => setEditingCredentials(false)} disabled={saving}>
                        Cancel
                    </button>

                </form>

            )}

            {!loading && status && status.configured && (

                <>

                {!status.found && (
                    <p className="error-message">{status.error || "Unable to reach the cloud provider."}</p>
                )}

                {status.found && cloudProvider === "aws" && (

                    <>

                    {status.ecsStatus && (

                        <>

                        <div className="info-row">
                            <span>ECS Service Status</span>
                            <strong>{status.ecsStatus}</strong>
                        </div>

                        <div className="info-row">
                            <span>Tasks</span>
                            <strong>{status.runningCount} running / {status.desiredCount} desired</strong>
                        </div>

                        <div className="info-row">
                            <span>Task Definition</span>
                            <strong className="smoke-test-metric-mono">{status.taskDefinition || "—"}</strong>
                        </div>

                        </>

                    )}

                    {status.ecrImages && status.ecrImages.length > 0 && (

                        <>

                        <p className="field-hint" style={{ marginTop: "12px" }}>Recent ECR images</p>

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Tag</th>
                                    <th>Pushed</th>
                                    <th className="num">Size</th>
                                </tr>
                            </thead>

                            <tbody>

                                {status.ecrImages.map((image, index) => (

                                    <tr key={index}>
                                        <td className="smoke-test-metric-mono">{image.tag || "(untagged)"}</td>
                                        <td>{image.pushedAt ? new Date(image.pushedAt).toLocaleString() : "—"}</td>
                                        <td className="num">{formatBytes(image.sizeBytes)}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                        </>

                    )}

                    </>

                )}

                {status.found && cloudProvider === "azure" && (

                    <>

                    <div className="info-row">
                        <span>State</span>
                        <strong>{status.azureState || "—"}</strong>
                    </div>

                    <div className="info-row">
                        <span>Default Hostname</span>
                        <strong className="smoke-test-metric-mono">{status.azureDefaultHostname || "—"}</strong>
                    </div>

                    <div className="info-row">
                        <span>Last Modified</span>
                        <strong>{status.azureLastModifiedUtc ? new Date(status.azureLastModifiedUtc).toLocaleString() : "—"}</strong>
                    </div>

                    </>

                )}

                <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: "14px" }}
                    onClick={handleClearCredentials}
                >
                    Clear {cloudProvider === "aws" ? "AWS" : "Azure"} Credentials
                </button>

                </>

            )}

        </div>

    );

}

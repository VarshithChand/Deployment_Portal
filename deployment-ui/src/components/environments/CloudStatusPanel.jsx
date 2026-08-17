import { useEffect, useState } from "react";

import formatBytes from "../../utils/formatBytes";
import useToast from "../../hooks/useToast";
import { getEnvironmentCloudStatus } from "../../services/environmentsService";
import { PROVIDER_LABEL } from "./CloudProviderBadge";
import {
    saveMyAwsSettings, clearMyAwsCredentials,
    saveMyAzureSettings, clearMyAzureCredentials
} from "../../services/settingsService";

const EMPTY_AWS_FORM = { accessKeyId: "", secretAccessKey: "", region: "" };
const EMPTY_AZURE_FORM = { tenantId: "", clientId: "", clientSecret: "" };

// The live AWS ECS/ECR or Azure Web App panel on an environment's detail
// view. Credentials are entered here once per browser session (see
// PortalIdentity/UserAwsCredentials on the backend) — never portal-wide,
// never sent anywhere except this backend's own AWS/Azure calls made on
// your behalf. Render/Cloudflare targets are detected and shown (see
// renderServiceId/cloudflareAccountId/cloudflareProjectName) but have no
// live-status integration yet - see EnvironmentsController.GetCloudStatus.
export default function CloudStatusPanel({
    environmentName, cloudProvider,
    renderServiceId, cloudflareAccountId, cloudflareProjectName,
    autoDetected, detectionEvidence
}) {

    const toast = useToast();

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
                    No AWS, Azure, Render, or Cloudflare target configured for this environment
                    yet — set one in Settings → Environments, or add a deploy step to
                    "{environmentName}"'s workflow and it'll be detected automatically.
                </p>

            </div>

        );

    }

    if (cloudProvider === "render" || cloudProvider === "cloudflare") {

        return (

            <div className="card">

                <h2 className="card-title">
                    Cloud Status — {PROVIDER_LABEL[cloudProvider]}
                </h2>

                <p className="empty-state" style={{ textAlign: "left" }}>
                    {autoDetected ? "Detected from this environment's pipeline. " : ""}
                    Live status monitoring isn't available for {PROVIDER_LABEL[cloudProvider]} yet
                    — this is what the pipeline was found to deploy to.
                </p>

                {cloudProvider === "render" && renderServiceId && (
                    <div className="info-row">
                        <span>Render Service ID</span>
                        <strong className="smoke-test-metric-mono">{renderServiceId}</strong>
                    </div>
                )}

                {cloudProvider === "cloudflare" && cloudflareProjectName && (
                    <div className="info-row">
                        <span>Cloudflare Project</span>
                        <strong className="smoke-test-metric-mono">{cloudflareProjectName}</strong>
                    </div>
                )}

                {cloudProvider === "cloudflare" && cloudflareAccountId && (
                    <div className="info-row">
                        <span>Cloudflare Account ID</span>
                        <strong className="smoke-test-metric-mono">{cloudflareAccountId}</strong>
                    </div>
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
                        <label>Access Key ID</label>
                        <input
                            className="form-control"
                            value={awsForm.accessKeyId}
                            onChange={(e) => setAwsForm({ ...awsForm, accessKeyId: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Secret Access Key</label>
                        <input
                            type="password"
                            className="form-control"
                            value={awsForm.secretAccessKey}
                            onChange={(e) => setAwsForm({ ...awsForm, secretAccessKey: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Region (used if the environment doesn't set its own)</label>
                        <input
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
                        <label>Tenant ID</label>
                        <input
                            className="form-control"
                            value={azureForm.tenantId}
                            onChange={(e) => setAzureForm({ ...azureForm, tenantId: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Client ID</label>
                        <input
                            className="form-control"
                            value={azureForm.clientId}
                            onChange={(e) => setAzureForm({ ...azureForm, clientId: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Client Secret</label>
                        <input
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

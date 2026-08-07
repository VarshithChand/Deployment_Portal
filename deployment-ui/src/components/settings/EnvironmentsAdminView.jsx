import { useEffect, useState } from "react";

import { getEnvironments, saveEnvironments, detectDeploymentTarget } from "../../services/environmentsService";
import useToast from "../../hooks/useToast";

const EMPTY_ENVIRONMENT = {
    name: "",
    workflowName: "",
    cloudProvider: "none",
    awsRegion: "",
    ecsCluster: "",
    ecsService: "",
    ecrRepository: "",
    azureSubscriptionId: "",
    azureResourceGroup: "",
    azureWebAppName: ""
};

// Visible to every visitor (the same data the Dashboard card already
// shows everyone) — editing is what's restricted. Non-admins get every
// field read-only and none of the mutating controls, rather than the page
// being hidden outright; the backend enforces the same restriction on
// POST /api/environments regardless, this just avoids a confusing "Admin
// login required" error after someone who can't save fills the form in.
// The cloud target names here are plain configuration, not secrets — the
// credentials that authenticate against them are entered per-visitor on
// the environment's own detail page instead (see CloudStatusPanel), never
// here.
export default function EnvironmentsAdminView({ isAdmin }) {

    const toast = useToast();

    const [environments, setEnvironments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [detectingIndex, setDetectingIndex] = useState(null);
    const [evidenceByIndex, setEvidenceByIndex] = useState({});

    useEffect(() => {

        getEnvironments().then((data) => {

            setEnvironments(Array.isArray(data) ? data : []);
            setLoading(false);

        });

    }, []);

    function updateField(index, field, value) {

        setEnvironments((current) =>
            current.map((env, i) => (i === index ? { ...env, [field]: value } : env))
        );

    }

    function addEnvironment() {
        setEnvironments((current) => [...current, { ...EMPTY_ENVIRONMENT }]);
    }

    function removeEnvironment(index) {
        setEnvironments((current) => current.filter((_, i) => i !== index));
    }

    // Reads the CD workflow's actual YAML to fill in what it really
    // deploys to, instead of the admin having to already know the exact
    // ECS cluster/service or Azure Web App name.
    async function handleDetect(index) {

        const workflowName = environments[index].workflowName.trim();

        if (!workflowName) {
            toast.show("Enter the CD workflow name first.", "error");
            return;
        }

        setDetectingIndex(index);

        try {

            const detected = await detectDeploymentTarget(workflowName);

            if (detected.cloudProvider === "none") {
                toast.show("No AWS or Azure deploy step found in that workflow.", "error");
                setEvidenceByIndex((current) => ({ ...current, [index]: [] }));
                return;
            }

            setEnvironments((current) =>
                current.map((env, i) => {

                    if (i !== index) return env;

                    return {
                        ...env,
                        cloudProvider: detected.cloudProvider,
                        awsRegion: detected.awsRegion || env.awsRegion,
                        ecsCluster: detected.ecsCluster || env.ecsCluster,
                        ecsService: detected.ecsService || env.ecsService,
                        ecrRepository: detected.ecrRepository || env.ecrRepository,
                        azureResourceGroup: detected.azureResourceGroup || env.azureResourceGroup,
                        azureWebAppName: detected.azureWebAppName || env.azureWebAppName
                    };

                })
            );

            setEvidenceByIndex((current) => ({ ...current, [index]: detected.evidence || [] }));
            toast.show("Deployment target detected — review and save.", "success");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to read that workflow.", "error");

        }
        finally {

            setDetectingIndex(null);

        }

    }

    async function handleSave() {

        const cleaned = environments
            .map((env) => ({ ...env, name: env.name.trim(), workflowName: env.workflowName.trim() }))
            .filter((env) => env.name && env.workflowName);

        if (cleaned.length !== environments.length) {
            toast.show("Every environment needs a name and a CD workflow — empty rows were dropped.", "error");
        }

        setSaving(true);

        try {

            const saved = await saveEnvironments(cleaned);
            setEnvironments(saved);
            toast.show("Environment list saved.", "success");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save the environment list.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    if (loading) {
        return <p className="field-hint">Loading environments...</p>;
    }

    return (

        <div className="card">

            <h2 className="card-title">Environments</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Each environment tracks one CD/release workflow's latest run for its commit and
                artifacts. Optionally point it at a real AWS ECS/ECR or Azure Web App — whoever
                opens that environment then enters their own cloud credentials to see live status.
                {!isAdmin && " Only admins can change this list."}
            </p>

            {environments.length === 0 && (
                <p className="empty-state">No environments yet — add one below.</p>
            )}

            {environments.map((env, index) => (

                <div key={index} className="settings-subsection">

                    <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "10px" }}>

                        <h3 className="settings-subhead">Environment {index + 1}</h3>

                        {isAdmin && (

                            <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => removeEnvironment(index)}
                            >
                                Remove
                            </button>

                        )}

                    </div>

                    <div className="form-group">
                        <label>Name</label>
                        <input
                            className="form-control"
                            placeholder="Production"
                            value={env.name}
                            onChange={(e) => updateField(index, "name", e.target.value)}
                            disabled={!isAdmin}
                        />
                    </div>

                    <div className="form-group">
                        <label>CD Workflow Name (must match the workflow's exact name)</label>
                        <input
                            className="form-control"
                            placeholder="Release API"
                            value={env.workflowName}
                            onChange={(e) => updateField(index, "workflowName", e.target.value)}
                            disabled={!isAdmin}
                        />
                    </div>

                    {isAdmin && (

                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ marginBottom: "16px" }}
                            onClick={() => handleDetect(index)}
                            disabled={detectingIndex === index}
                        >
                            {detectingIndex === index ? "Reading pipeline..." : "Detect from Pipeline"}
                        </button>

                    )}

                    {evidenceByIndex[index]?.length > 0 && (

                        <ul className="field-hint" style={{ margin: "0 0 16px", paddingLeft: "18px" }}>
                            {evidenceByIndex[index].map((line, i) => (
                                <li key={i}>{line}</li>
                            ))}
                        </ul>

                    )}

                    <div className="form-group">
                        <label>Cloud Target</label>
                        <select
                            className="form-control"
                            value={env.cloudProvider}
                            onChange={(e) => updateField(index, "cloudProvider", e.target.value)}
                            disabled={!isAdmin}
                        >
                            <option value="none">Not configured</option>
                            <option value="aws">AWS (ECS / ECR)</option>
                            <option value="azure">Azure Web App</option>
                        </select>
                    </div>

                    {env.cloudProvider === "aws" && (

                        <>

                        <div className="form-group">
                            <label>AWS Region</label>
                            <input
                                className="form-control"
                                placeholder="us-east-1"
                                value={env.awsRegion || ""}
                                onChange={(e) => updateField(index, "awsRegion", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        <div className="form-group">
                            <label>ECS Cluster</label>
                            <input
                                className="form-control"
                                value={env.ecsCluster || ""}
                                onChange={(e) => updateField(index, "ecsCluster", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        <div className="form-group">
                            <label>ECS Service</label>
                            <input
                                className="form-control"
                                value={env.ecsService || ""}
                                onChange={(e) => updateField(index, "ecsService", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        <div className="form-group">
                            <label>ECR Repository</label>
                            <input
                                className="form-control"
                                value={env.ecrRepository || ""}
                                onChange={(e) => updateField(index, "ecrRepository", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        </>

                    )}

                    {env.cloudProvider === "azure" && (

                        <>

                        <div className="form-group">
                            <label>Azure Subscription ID</label>
                            <input
                                className="form-control"
                                value={env.azureSubscriptionId || ""}
                                onChange={(e) => updateField(index, "azureSubscriptionId", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        <div className="form-group">
                            <label>Resource Group</label>
                            <input
                                className="form-control"
                                value={env.azureResourceGroup || ""}
                                onChange={(e) => updateField(index, "azureResourceGroup", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        <div className="form-group">
                            <label>Web App Name</label>
                            <input
                                className="form-control"
                                value={env.azureWebAppName || ""}
                                onChange={(e) => updateField(index, "azureWebAppName", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        </>

                    )}

                </div>

            ))}

            {isAdmin && (

                <div className="button-row">

                    <button type="button" className="btn btn-secondary" onClick={addEnvironment}>
                        Add Environment
                    </button>

                    <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : "Save Environments"}
                    </button>

                </div>

            )}

        </div>

    );

}

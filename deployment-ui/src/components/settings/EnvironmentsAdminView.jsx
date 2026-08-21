import { useEffect, useState } from "react";

import { getEnvironments, saveEnvironments, detectDeploymentTarget } from "../../services/environmentsService";
import { getPaasStatus } from "../../services/paasService";
import { PROVIDER_LABEL } from "../environments/CloudProviderBadge";
import useToast from "../../hooks/useToast";
import useNavigation from "../../hooks/useNavigation";

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
    azureWebAppName: "",
    renderServiceId: "",
    cloudflareAccountId: "",
    cloudflareProjectName: "",
    netlifySiteId: "",
    vercelProjectId: ""
};

// The four Hosting Providers - matches PaasHosting.jsx's own provider set.
const PAAS_PROVIDERS = ["render", "cloudflare", "netlify", "vercel"];

// One environment's target-id field for a PaaS provider - a live <select>
// of the CURRENT admin's own connected services when available (see
// paasStatusByIndex below), falling back to a plain text input (so
// someone can still type an id they know even without connecting that
// provider themselves in this session). Pulled out since this same
// picker-or-fallback shape is needed for all four providers.
function PaasServiceIdField({ index, provider, field, label, placeholder, env, isAdmin, updateField, paasStatus, setTab }) {

    const hasLiveList = paasStatus?.configured && paasStatus?.found && paasStatus.services?.length > 0;

    return (

        <div className="form-group">

            <label>{label}</label>

            {hasLiveList ? (

                <select
                    className="form-control"
                    value={env[field] || ""}
                    onChange={(e) => updateField(index, field, e.target.value)}
                    disabled={!isAdmin}
                >
                    <option value="">Select a service…</option>
                    {paasStatus.services.map((s) => (
                        <option key={s.id || s.name} value={s.id || s.name}>{s.name}</option>
                    ))}
                </select>

            ) : (

                <input
                    className="form-control"
                    placeholder={placeholder}
                    value={env[field] || ""}
                    onChange={(e) => updateField(index, field, e.target.value)}
                    disabled={!isAdmin}
                />

            )}

            {isAdmin && !hasLiveList && (

                <p className="field-hint">
                    Connect your own {PROVIDER_LABEL[provider]} account in{" "}
                    <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("settings")}>
                        Settings → Credentials
                    </button>
                    {" "}to pick from a live list instead of typing an id.
                </p>

            )}

        </div>

    );

}

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
    const { setTab } = useNavigation();

    const [environments, setEnvironments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [detectingIndex, setDetectingIndex] = useState(null);
    const [evidenceByIndex, setEvidenceByIndex] = useState({});

    // The current admin's own connected Hosting Provider services, keyed
    // "{rowIndex}:{provider}" - powers PaasServiceIdField's live picker.
    const [paasStatusByIndex, setPaasStatusByIndex] = useState({});

    useEffect(() => {

        getEnvironments().then((data) => {

            setEnvironments(Array.isArray(data) ? data : []);
            setLoading(false);

        });

    }, []);

    // Fetches this admin's own connected-service list for any row whose
    // CloudProvider is one of the four PaaS providers and hasn't been
    // fetched yet - keyed on the joined provider list (not `environments`
    // itself) so typing in an unrelated field on some other row doesn't
    // re-trigger this.
    useEffect(() => {

        if (!isAdmin) return;

        environments.forEach((env, index) => {

            const provider = env.cloudProvider;
            const key = `${index}:${provider}`;

            if (!PAAS_PROVIDERS.includes(provider) || paasStatusByIndex[key] !== undefined)
                return;

            getPaasStatus(provider)
                .then((result) => setPaasStatusByIndex((current) => ({ ...current, [key]: result })))
                .catch(() => setPaasStatusByIndex((current) => ({ ...current, [key]: null })));

        });

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [environments.map((e) => e.cloudProvider).join(","), isAdmin]);

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
                toast.show("No AWS, Azure, Render, or Cloudflare deploy step found in that workflow.", "error");
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
                        azureWebAppName: detected.azureWebAppName || env.azureWebAppName,
                        renderServiceId: detected.renderServiceId || env.renderServiceId,
                        cloudflareAccountId: detected.cloudflareAccountId || env.cloudflareAccountId,
                        cloudflareProjectName: detected.cloudflareProjectName || env.cloudflareProjectName
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
                artifacts. Its cloud target is detected automatically by reading that workflow's
                own YAML (AWS ECS/ECR, Azure Web App, Render, or Cloudflare — Netlify and Vercel
                are never auto-detected) whenever nothing has been explicitly set below — "Detect
                from Pipeline" fills these fields in for you, or pick/type them by hand. Whoever
                opens this environment's detail page then connects their own credentials (AWS/
                Azure right there, Render/Cloudflare/Netlify/Vercel via Settings → Credentials) to
                see live status — and, for Render specifically, real CPU/memory load.
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
                        <label htmlFor={`env-${index}-name`}>Name</label>
                        <input
                            id={`env-${index}-name`}
                            className="form-control"
                            placeholder="Production"
                            value={env.name}
                            onChange={(e) => updateField(index, "name", e.target.value)}
                            disabled={!isAdmin}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor={`env-${index}-workflow-name`}>CD Workflow Name (must match the workflow's exact name)</label>
                        <input
                            id={`env-${index}-workflow-name`}
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
                        <label htmlFor={`env-${index}-cloud-target`}>Cloud Target</label>
                        <select
                            id={`env-${index}-cloud-target`}
                            className="form-control"
                            value={env.cloudProvider}
                            onChange={(e) => updateField(index, "cloudProvider", e.target.value)}
                            disabled={!isAdmin}
                        >
                            <option value="none">Not configured</option>
                            <option value="aws">AWS (ECS / ECR)</option>
                            <option value="azure">Azure Web App</option>
                            <option value="render">Render</option>
                            <option value="cloudflare">Cloudflare</option>
                            <option value="netlify">Netlify</option>
                            <option value="vercel">Vercel</option>
                        </select>
                    </div>

                    {env.cloudProvider === "aws" && (

                        <>

                        <div className="form-group">
                            <label htmlFor={`env-${index}-aws-region`}>AWS Region</label>
                            <input
                                id={`env-${index}-aws-region`}
                                className="form-control"
                                placeholder="us-east-1"
                                value={env.awsRegion || ""}
                                onChange={(e) => updateField(index, "awsRegion", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor={`env-${index}-ecs-cluster`}>ECS Cluster</label>
                            <input
                                id={`env-${index}-ecs-cluster`}
                                className="form-control"
                                value={env.ecsCluster || ""}
                                onChange={(e) => updateField(index, "ecsCluster", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor={`env-${index}-ecs-service`}>ECS Service</label>
                            <input
                                id={`env-${index}-ecs-service`}
                                className="form-control"
                                value={env.ecsService || ""}
                                onChange={(e) => updateField(index, "ecsService", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor={`env-${index}-ecr-repository`}>ECR Repository</label>
                            <input
                                id={`env-${index}-ecr-repository`}
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
                            <label htmlFor={`env-${index}-azure-subscription-id`}>Azure Subscription ID</label>
                            <input
                                id={`env-${index}-azure-subscription-id`}
                                className="form-control"
                                value={env.azureSubscriptionId || ""}
                                onChange={(e) => updateField(index, "azureSubscriptionId", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor={`env-${index}-azure-resource-group`}>Resource Group</label>
                            <input
                                id={`env-${index}-azure-resource-group`}
                                className="form-control"
                                value={env.azureResourceGroup || ""}
                                onChange={(e) => updateField(index, "azureResourceGroup", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor={`env-${index}-azure-webapp-name`}>Web App Name</label>
                            <input
                                id={`env-${index}-azure-webapp-name`}
                                className="form-control"
                                value={env.azureWebAppName || ""}
                                onChange={(e) => updateField(index, "azureWebAppName", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        </>

                    )}

                    {env.cloudProvider === "render" && (

                        <PaasServiceIdField
                            index={index}
                            provider="render"
                            field="renderServiceId"
                            label="Render Service"
                            placeholder="srv-xxxxxxxxxxxxxxxxxxxx"
                            env={env}
                            isAdmin={isAdmin}
                            updateField={updateField}
                            paasStatus={paasStatusByIndex[`${index}:render`]}
                            setTab={setTab}
                        />

                    )}

                    {env.cloudProvider === "cloudflare" && (

                        <>

                        {/* This is the ADMIN's OWN Cloudflare Account ID (from their
                            Settings → Credentials connection, needed just to fetch the
                            live picker below) - not necessarily the same account this
                            environment's Cloudflare Project actually lives under, so it
                            stays a plain field rather than being folded into the picker. */}
                        <div className="form-group">
                            <label htmlFor={`env-${index}-cloudflare-account-id`}>Cloudflare Account ID</label>
                            <input
                                id={`env-${index}-cloudflare-account-id`}
                                className="form-control"
                                value={env.cloudflareAccountId || ""}
                                onChange={(e) => updateField(index, "cloudflareAccountId", e.target.value)}
                                disabled={!isAdmin}
                            />
                        </div>

                        <PaasServiceIdField
                            index={index}
                            provider="cloudflare"
                            field="cloudflareProjectName"
                            label="Cloudflare Project"
                            placeholder="my-pages-project"
                            env={env}
                            isAdmin={isAdmin}
                            updateField={updateField}
                            paasStatus={paasStatusByIndex[`${index}:cloudflare`]}
                            setTab={setTab}
                        />

                        </>

                    )}

                    {env.cloudProvider === "netlify" && (

                        <PaasServiceIdField
                            index={index}
                            provider="netlify"
                            field="netlifySiteId"
                            label="Netlify Site"
                            placeholder="my-site-name"
                            env={env}
                            isAdmin={isAdmin}
                            updateField={updateField}
                            paasStatus={paasStatusByIndex[`${index}:netlify`]}
                            setTab={setTab}
                        />

                    )}

                    {env.cloudProvider === "vercel" && (

                        <PaasServiceIdField
                            index={index}
                            provider="vercel"
                            field="vercelProjectId"
                            label="Vercel Project"
                            placeholder="my-project-name"
                            env={env}
                            isAdmin={isAdmin}
                            updateField={updateField}
                            paasStatus={paasStatusByIndex[`${index}:vercel`]}
                            setTab={setTab}
                        />

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

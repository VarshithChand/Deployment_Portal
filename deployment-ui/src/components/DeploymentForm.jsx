import { useEffect, useState } from "react";
import { deploy } from "../services/deploymentService";
import { getWorkflowInputs, getWorkflowYaml, getLastRun, explainPipeline } from "../services/githubService";

import ConfirmDialog from "./ConfirmDialog";
import YamlViewerDialog from "./YamlViewerDialog";
import PipelineExplanationDialog from "./PipelineExplanationDialog";
import ProgressBar from "./ProgressBar";
import SearchBox from "./common/SearchBox";
import ComboBox from "./common/ComboBox";
import ClearableInput from "./common/ClearableInput";
import DeploymentSummary from "./deployment/DeploymentSummary";
import DeploymentProgress from "./deployment/DeploymentProgress";

import useToast from "../hooks/useToast";
import useAuth from "../hooks/useAuth";
import useNavigation from "../hooks/useNavigation";

function formatInputLabel(name) {

    return name
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

}

export default function DeploymentForm({

    branches,
    artifacts,
    workflows

}) {

    const [mode, setMode] = useState("CI");

    const [branch, setBranch] = useState("");
    const [workflow, setWorkflow] = useState("");

    // Populated from the selected workflow's own YAML — null while loading /
    // no workflow selected, [] once loaded if it declares no inputs at all.
    const [workflowInputs, setWorkflowInputs] = useState(null);
    const [workflowInputsLoading, setWorkflowInputsLoading] = useState(false);

    // One value per declared input, keyed by that input's own name — this is
    // what actually gets sent, so the keys always match what the workflow expects.
    const [inputValues, setInputValues] = useState({});

    const [selectedArtifacts, setSelectedArtifacts] = useState([]);

    const [deploying, setDeploying] = useState(false);
    const [runId, setRunId] = useState(null);

    // What the selected workflow (on the selected branch, if any) did last
    // time — shown in Deployment Summary so you can see the previous run's
    // outcome and artifact before triggering it again.
    const [lastRun, setLastRun] = useState(null);
    const [lastRunLoading, setLastRunLoading] = useState(false);

    const [confirm, setConfirm] = useState(false);

    // "View YAML" dialog — shows the selected workflow file's raw source,
    // fetched from the same repo-contents call GetWorkflowInputsAsync parses.
    const [yamlOpen, setYamlOpen] = useState(false);
    const [yamlLoading, setYamlLoading] = useState(false);
    const [yamlError, setYamlError] = useState("");
    const [yamlContent, setYamlContent] = useState("");

    // "Explain Pipeline" dialog — a plain-English summary of the same
    // workflow file, fetched only when actually opened (see PipelineExplanationService).
    const [explainOpen, setExplainOpen] = useState(false);
    const [explainLoading, setExplainLoading] = useState(false);
    const [explainError, setExplainError] = useState("");
    const [explanation, setExplanation] = useState("");
    const [explanationSource, setExplanationSource] = useState("");

    /* -----------------------------
       Search States
    ------------------------------*/

    const [artifactSearch, setArtifactSearch] = useState("");

    const toast = useToast();
    const { githubTokenConfigured } = useAuth();
    const { setTab } = useNavigation();

    // Whether a workflow needs an inputs form has nothing to do with which
    // CI/CD bucket it's browsed under — that's just a name-based heuristic
    // (see classifyWorkflow below) for filtering the dropdown, and plenty of
    // workflows that read as "CI" by name (build/test — including a Docker
    // image smoke test) still declare required workflow_dispatch inputs.
    // This used to be `mode !== "CI"`, which skipped fetching a CI-bucketed
    // workflow's inputs entirely and silently dispatched it with none —
    // GitHub then rejects the run for whatever inputs it actually required.
    // Driven by the fetch below instead: true only once the selected
    // workflow's own declared inputs come back non-empty.
    const showInputs = Array.isArray(workflowInputs) && workflowInputs.length > 0;

    function toggleArtifact(name) {

        setSelectedArtifacts((prev) =>

            prev.includes(name)
                ? prev.filter((a) => a !== name)
                : [...prev, name]

        );

    }

    function setInputValue(name, value) {

        setInputValues((prev) => ({ ...prev, [name]: value }));

    }

    /* -----------------------------
       Filtered Lists
    ------------------------------*/

    const filteredArtifacts = artifacts.filter(artifact =>

        artifact.name
            .toLowerCase()
            .includes(artifactSearch.toLowerCase())

    );

    // Workflows are split into CI / CD / CI+CD by name — repos don't reliably
    // label these consistently, so this is a heuristic: a workflow mentioning
    // both a CI-ish and a CD-ish term (e.g. "Build & Release") is treated as a
    // combined pipeline rather than forced into just one bucket.
    const classifyWorkflow = (item) => {

        const text = `${item.name} ${item.path || ""}`;

        const hasCi = /\bci\b/i.test(text) || /\bbuild\b/i.test(text) || /\btest\b/i.test(text);
        const hasCd = /\bcd\b/i.test(text) || /\brelease\b/i.test(text) || /\bdeploy\b/i.test(text);

        if (hasCi && hasCd) {
            return "CI+CD";
        }

        if (hasCi) {
            return "CI";
        }

        // No clear signal either way — default to CD, since most pipelines
        // that aren't obviously "CI" are deploy/release-oriented in practice.
        return "CD";

    };

    const modeWorkflows = workflows.filter((item) => classifyWorkflow(item) === mode);

    function handleModeChange(nextMode) {

        setMode(nextMode);
        setWorkflow("");

    }

    // Pre-selects a workflow from "?workflow=" in the URL (e.g. a README
    // badge linking to .../?tab=deploy&workflow=release-admin.yml) - lands
    // here with that workflow, its own real mode tab, and its real declared
    // inputs already showing, instead of making someone find it in the
    // dropdown themselves. Matches by bare filename or full path, either
    // side case-insensitive, since a link only needs to get the filename
    // right. Runs once workflows have loaded; a param that doesn't match
    // anything is silently ignored, same as never having been there.
    useEffect(() => {

        if (workflows.length === 0) return;

        const requested = new URLSearchParams(window.location.search).get("workflow");
        if (!requested) return;

        const target = requested.toLowerCase();

        const match = workflows.find((item) => {
            const path = item.path.toLowerCase();
            return path === target || path.endsWith(`/${target}`);
        });

        if (!match) return;

        setMode(classifyWorkflow(match));
        setWorkflow(match.path);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workflows]);

    /* -----------------------------
       Fetch the selected workflow's declared inputs — always, regardless
       of CI/CD mode (see showInputs above for why this can't be
       conditional on mode without silently dropping required inputs).
    ------------------------------*/

    useEffect(() => {

        if (!workflow) {

            setWorkflowInputs(null);
            setInputValues({});
            setSelectedArtifacts([]);

            return;

        }

        let cancelled = false;

        setWorkflowInputsLoading(true);
        setWorkflowInputs(null);

        getWorkflowInputs(workflow, branch)
            .then((response) => {

                if (cancelled) {
                    return;
                }

                const inputs = Array.isArray(response.data) ? response.data : [];

                setWorkflowInputs(inputs);
                setSelectedArtifacts([]);

                const seeded = {};

                inputs.forEach((input) => {
                    seeded[input.name] = input.default ?? (input.type === "boolean" ? "true" : "");
                });

                setInputValues(seeded);

            })
            .catch((err) => {

                console.error(err);

                if (!cancelled) {
                    setWorkflowInputs([]);
                    setInputValues({});
                }

            })
            .finally(() => {

                if (!cancelled) {
                    setWorkflowInputsLoading(false);
                }

            });

        return () => {
            cancelled = true;
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workflow, branch]);

    useEffect(() => {

        if (!workflow) {
            setLastRun(null);
            return;
        }

        let cancelled = false;

        setLastRunLoading(true);

        getLastRun(workflow, branch)
            .then((response) => {

                if (!cancelled) {
                    setLastRun(response.data);
                }

            })
            .catch((err) => {

                console.error(err);

                if (!cancelled) {
                    setLastRun(null);
                }

            })
            .finally(() => {

                if (!cancelled) {
                    setLastRunLoading(false);
                }

            });

        return () => {
            cancelled = true;
        };

    }, [workflow, branch]);

    const artifactInput = (workflowInputs || []).find((i) => /artifact/i.test(i.name));

    // Only treat a "docker/image"-named input as a free-form registry path —
    // if the workflow itself declares fixed `options` (e.g. a `type: choice`
    // input like test-docker-image.yml's `image`), it renders through the
    // generic select dropdown below instead so its value always matches one
    // of the workflow's own declared choices.
    const dockerInput = (workflowInputs || []).find(
        (i) => /docker|image/i.test(i.name) && !(i.options && i.options.length > 0)
    );

    const clusterInputs = (workflowInputs || []).filter((i) => /cluster/i.test(i.name));

    const otherInputs = (workflowInputs || []).filter((i) =>
        i !== artifactInput && i !== dockerInput && !clusterInputs.includes(i)
    );

    // Keep the recognized artifact input's value in sync with the multi-select
    // picker, joined the same way the workflow file expects a string input.
    useEffect(() => {

        if (artifactInput) {
            setInputValue(artifactInput.name, selectedArtifacts.join(","));
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedArtifacts, artifactInput?.name]);

    /* -----------------------------
       View YAML
    ------------------------------*/

    function handleViewYaml() {

        if (!workflow) {
            return;
        }

        setYamlOpen(true);
        setYamlLoading(true);
        setYamlError("");
        setYamlContent("");

        getWorkflowYaml(workflow, branch)
            .then((response) => {
                setYamlContent(response.data?.content || "");
            })
            .catch((err) => {
                console.error(err);
                setYamlError(err.response?.data?.message || "Unable to load this workflow's YAML file.");
            })
            .finally(() => {
                setYamlLoading(false);
            });

    }

    /* -----------------------------
       Explain Pipeline
    ------------------------------*/

    function handleExplainPipeline() {

        if (!workflow) {
            return;
        }

        setExplainOpen(true);
        setExplainLoading(true);
        setExplainError("");
        setExplanation("");

        explainPipeline(workflow, branch)
            .then((response) => {
                setExplanation(response.data?.explanation || "");
                setExplanationSource(response.data?.source || "");
            })
            .catch((err) => {
                console.error(err);
                setExplainError(err.response?.data?.message || "Unable to explain this pipeline.");
            })
            .finally(() => {
                setExplainLoading(false);
            });

    }

    /* -----------------------------
       Deploy
    ------------------------------*/

    // Browsing (viewing repos, artifacts, history) works anonymously, but
    // GitHub always requires an authenticated request to trigger a workflow —
    // catching that here sends people straight to Settings instead of letting
    // them fill out the whole form and only find out from a failed request.
    function handleDeployClick() {

        if (!githubTokenConfigured) {

            toast.show(
                "A GitHub Personal Access Token is required to trigger deployments. Add one in Settings.",
                "error"
            );

            setTab("settings");
            return;

        }

        setConfirm(true);

    }

    const handleDeploy = async () => {

        if (!branch) {

            toast.show("Please select a branch.", "error");
            return;

        }

        if (!workflow) {

            toast.show("Please select a workflow.", "error");
            return;

        }

        if (showInputs) {

            if (workflowInputsLoading || workflowInputs === null) {

                toast.show("Please wait for the workflow's inputs to load.", "error");
                return;

            }

            for (const input of workflowInputs) {

                const value = inputValues[input.name];

                if (input.required && (!value || value.trim() === "")) {

                    toast.show(`Please fill in "${formatInputLabel(input.name)}".`, "error");
                    return;

                }

            }

        }

        try {

            setDeploying(true);
            setRunId(null);

            const request = {

                mode,

                branch,

                workflow,

                inputs: showInputs ? inputValues : {}

            };

            console.log(

                "Deployment Request",

                request

            );

            const response = await deploy(request);
            const result = response.data;

            if (result?.success) {

                setRunId(result.runId || null);

                toast.show(

                    result.message || "Deployment Triggered Successfully",

                    "success"

                );

            }
            else {

                toast.show(

                    result?.message || "Deployment Failed",

                    "error"

                );

            }

        }
        catch (error) {

            console.error(error);

            toast.show(

                error.response?.data?.message || "Deployment Failed",

                "error"

            );

        }
        finally {

            setDeploying(false);

        }

    };

    /* -----------------------------
       Dynamic Input Renderers
    ------------------------------*/

    function renderArtifactInput(input) {

        return (

            <div className="form-group" key={input.name}>

                <label>
                    Artifacts
                    {" "}
                    {selectedArtifacts.length > 0 && (
                        <span className="badge badge-info">
                            {selectedArtifacts.length} selected
                        </span>
                    )}
                </label>

                <SearchBox

                    placeholder="Search Artifact..."

                    value={artifactSearch}

                    onChange={setArtifactSearch}

                />

                {

                    filteredArtifacts.length === 0 ? (

                        <p className="empty-state">
                            No Artifact Found
                        </p>

                    ) : (

                        <div className="checkbox-list">

                            {filteredArtifacts.map((item) => (

                                <label key={item.id} className="checkbox-list-item">

                                    <input
                                        type="checkbox"
                                        checked={selectedArtifacts.includes(item.name)}
                                        onChange={() => toggleArtifact(item.name)}
                                    />

                                    &nbsp;{item.name}

                                </label>

                            ))}

                        </div>

                    )

                }

            </div>

        );

    }

    function renderDockerInput(input) {

        return (

            <div className="form-group" key={input.name}>

                <label>Docker Image</label>

                <ClearableInput

                    placeholder="registry/repository:tag"

                    value={inputValues[input.name] ?? ""}

                    onChange={(e) => setInputValue(input.name, e.target.value)}
                    onClear={() => setInputValue(input.name, "")}

                />

            </div>

        );

    }

    function renderClusterInput(input) {

        const checked = (inputValues[input.name] ?? "") === "true";

        return (

            <label key={input.name} className="checkbox-list-item" style={{ display: "block" }}>

                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setInputValue(input.name, e.target.checked ? "true" : "false")}
                />

                &nbsp;{formatInputLabel(input.name)}

            </label>

        );

    }

    function renderGenericInput(input) {

        const value = inputValues[input.name] ?? "";

        if (input.type === "boolean") {

            return (

                <div className="form-group" key={input.name}>

                    <label>
                        <input
                            type="checkbox"
                            checked={value === "true"}
                            onChange={(e) => setInputValue(input.name, e.target.checked ? "true" : "false")}
                        />
                        &nbsp;{formatInputLabel(input.name)}
                    </label>

                </div>

            );

        }

        if (input.options && input.options.length > 0) {

            return (

                <div className="form-group" key={input.name}>

                    <label>{formatInputLabel(input.name)}</label>

                    <select
                        className="form-control"
                        value={value}
                        onChange={(e) => setInputValue(input.name, e.target.value)}
                    >

                        {input.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}

                    </select>

                </div>

            );

        }

        return (

            <div className="form-group" key={input.name}>

                <label>
                    {formatInputLabel(input.name)}
                    {input.required && " *"}
                </label>

                <ClearableInput
                    placeholder={input.description || ""}
                    value={value}
                    onChange={(e) => setInputValue(input.name, e.target.value)}
                    onClear={() => setInputValue(input.name, "")}
                />

            </div>

        );

    }

    return (

        <>

        <div className="deploy-panel">

            <div className="card">

                <h2 className="card-title">

                    Deployment Configuration

                </h2>

                {!githubTokenConfigured && (

                    <div className="error-message">

                        You're browsing in public view. Triggering a deployment needs a GitHub
                        Personal Access Token —{" "}
                        <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>
                            add one in Settings
                        </a>.

                    </div>

                )}

                {/* ==========================
                    CI / CD Mode
                =========================== */}

                <div className="form-group">

                    <label>Mode</label>

                    <div className="mode-toggle">

                        <button
                            type="button"
                            className={`mode-toggle-option ${mode === "CI" ? "active" : ""}`}
                            onClick={() => handleModeChange("CI")}
                        >
                            CI
                        </button>

                        <button
                            type="button"
                            className={`mode-toggle-option ${mode === "CD" ? "active" : ""}`}
                            onClick={() => handleModeChange("CD")}
                        >
                            CD
                        </button>

                        <button
                            type="button"
                            className={`mode-toggle-option ${mode === "CI+CD" ? "active" : ""}`}
                            onClick={() => handleModeChange("CI+CD")}
                        >
                            CI+CD
                        </button>

                    </div>

                </div>

                {/* ==========================
                    Branch
                =========================== */}

                <div className="form-group">

                    <label>Branch</label>

                    <ComboBox

                        options={branches.map((item) => ({ value: item.name, label: item.name }))}
                        value={branch}
                        onChange={setBranch}
                        placeholder="Search or select a branch..."
                        emptyLabel="No branch found"

                    />

                </div>

                {/* ==========================
                    Workflow
                =========================== */}

                <div className="form-group">

                    <label>Workflow</label>

                    <p className="field-hint">

                        {

                            mode === "CI"

                                ? "Showing pipelines that look like CI (build/test) only."

                                : mode === "CD"

                                    ? "Showing pipelines that look like release/deploy only."

                                    : "Showing pipelines that combine CI and CD (e.g. \"Build & Release\")."

                        }

                    </p>

                    <ComboBox

                        options={modeWorkflows.map((item) => ({ value: item.path, label: item.name }))}
                        value={workflow}
                        onChange={setWorkflow}
                        placeholder="Search or select a workflow..."
                        emptyLabel={`No ${mode} workflow found`}

                    />

                    {workflow && (

                        <>

                        <button
                            type="button"
                            className="btn btn-link"
                            onClick={handleViewYaml}
                        >
                            View YAML
                        </button>

                        <button
                            type="button"
                            className="btn btn-link"
                            onClick={handleExplainPipeline}
                        >
                            Explain Pipeline
                        </button>

                        </>

                    )}

                </div>

                {showInputs && workflow && (

                    <>

                        {workflowInputsLoading && (

                            <p className="field-hint">Loading workflow inputs...</p>

                        )}

                        {!workflowInputsLoading && workflowInputs && workflowInputs.length === 0 && (

                            <p className="field-hint">This workflow doesn't declare any inputs.</p>

                        )}

                        {!workflowInputsLoading && artifactInput && renderArtifactInput(artifactInput)}

                        {!workflowInputsLoading && dockerInput && renderDockerInput(dockerInput)}

                        {!workflowInputsLoading && otherInputs.map((input) => renderGenericInput(input))}

                        {!workflowInputsLoading && clusterInputs.length > 0 && (

                            <div className="form-group">

                                <label>Clusters</label>

                                {clusterInputs.map((input) => renderClusterInput(input))}

                            </div>

                        )}

                    </>

                )}

                {/* ==========================
                    Deploy Button
                =========================== */}

                <button
                    type="button"

                    className="btn btn-success"

                    disabled={deploying}

                    onClick={handleDeployClick}

                >

                    {

                        deploying

                            ? (showInputs ? "Deploying..." : "Running...")

                            : (showInputs ? "Deploy" : "Run CI")

                    }

                </button>

            </div>

            <DeploymentSummary

                mode={mode}

                branch={branch}

                workflow={workflow}

                workflowInputs={showInputs ? workflowInputs : null}

                inputValues={inputValues}

                lastRun={lastRun}

                lastRunLoading={lastRunLoading}

            />

        </div>

            <YamlViewerDialog

                open={yamlOpen}
                path={workflow}
                loading={yamlLoading}
                error={yamlError}
                content={yamlContent}
                onClose={() => setYamlOpen(false)}

            />

            <PipelineExplanationDialog

                open={explainOpen}
                workflowName={modeWorkflows.find((item) => item.path === workflow)?.name}
                loading={explainLoading}
                error={explainError}
                explanation={explanation}
                source={explanationSource}
                onClose={() => setExplainOpen(false)}

            />

            <ConfirmDialog

                open={confirm}

                title={showInputs ? "Deploy Application" : "Run CI"}

                message={

                    showInputs

                        ? "Are you sure you want to deploy with these inputs?"

                        : "Are you sure you want to run this workflow on the selected branch?"

                }

                onConfirm={() => {

                    setConfirm(false);

                    handleDeploy();

                }}

                onCancel={() =>

                    setConfirm(false)

                }

            />

            <ProgressBar

                visible={deploying && !runId}

            />

            <DeploymentProgress

                runId={runId}

            />

        </>

    );

}

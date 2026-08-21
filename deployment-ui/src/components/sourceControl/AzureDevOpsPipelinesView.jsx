import { useEffect, useMemo, useState } from "react";

import {
    getAzureDevOpsPipelines, getAzureDevOpsPipelineDetail, getAzureDevOpsPipelineParameters,
    getAzureDevOpsBranches, getAzureDevOpsRuns, runAzureDevOpsPipeline
} from "../../services/azureDevOpsService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import ComboBox from "../common/ComboBox";
import useAzureDevOpsProject from "../../hooks/useAzureDevOpsProject";
import useNavigation from "../../hooks/useNavigation";
import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";

const PAGE_SIZE = 10;

// Pipelines are split into CI / CD / CI+CD by name - Azure DevOps doesn't
// label these consistently either, so this is the exact same heuristic
// DeploymentForm.jsx's own classifyWorkflow already uses for GitHub
// Actions workflows, applied to a pipeline's name/folder instead of a
// workflow's name/path. Kept as a separate copy rather than importing
// classifyWorkflow directly - the two providers' underlying data shapes
// differ enough (folder vs. path) that duplicating this dozen-line
// heuristic reads clearer than threading a shared helper across an
// unrelated GitHub-only component.
function classifyPipeline(item) {

    const text = `${item.name} ${item.folder || ""}`;

    const hasCi = /\bci\b/i.test(text) || /\bbuild\b/i.test(text) || /\btest\b/i.test(text);
    const hasCd = /\bcd\b/i.test(text) || /\brelease\b/i.test(text) || /\bdeploy\b/i.test(text);

    if (hasCi && hasCd) {
        return "CI+CD";
    }

    if (hasCi) {
        return "CI";
    }

    return "CD";

}

// Azure Pipelines' own declared parameter types that actually map onto a
// plain input control - step/job/stage and their List variants are
// YAML-authoring-time constructs (literal pipeline stage/job definitions)
// with no meaningful "value" a visitor could type into a form, so those
// are left out of the rendered form entirely rather than guessing at a
// control for them.
const RENDERABLE_PARAM_TYPES = new Set(["boolean", "string", "number"]);

function formatParamLabel(name) {

    return name
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

}

// Azure DevOps run state/result as a colored badge - its own small helper
// rather than reusing StatusBadge (that one speaks GitHub Actions'
// queued/in_progress/success/failure vocabulary specifically) or StateBadge
// (AWS resource states) - Azure Pipelines uses a different pair of fields
// entirely (State while running, Result only once State is "completed").
function RunStatusBadge({ state, result }) {

    const value = (result || state || "").toLowerCase();

    const className = value === "succeeded"
        ? "badge badge-success"
        : value === "failed"
            ? "badge badge-danger"
            : value === "canceled" || value === "canceling"
                ? "badge badge-secondary"
                : value === "partiallysucceeded"
                    ? "badge badge-warning"
                    : "badge badge-info";

    return <span className={className}>{result || state}</span>;

}

// Mirrors DeploymentSummary.jsx's own shape exactly (Mode/Branch/Workflow,
// then a "Previous Run" section) so the Pipelines page reads as the same
// pattern as GitHub's own Deploy page, just Azure DevOps-flavored -
// Pipeline instead of Workflow, and this page's own run/parameter
// vocabulary instead of GitHub Actions'.
function PipelineSummary({ mode, pipelineName, branch, parameters, paramValues, latestRun }) {

    return (

        <div className="card">

            <h2 className="card-title">Pipeline Summary</h2>

            <div className="info-row">
                <span>Mode</span>
                <strong>
                    <span className="badge badge-info">{mode}</span>
                </strong>
            </div>

            <div className="info-row">
                <span>Branch</span>
                <strong>{branch || "-"}</strong>
            </div>

            <div className="info-row">
                <span>Pipeline</span>
                <strong>{pipelineName || "-"}</strong>
            </div>

            {(parameters || []).filter((p) => RENDERABLE_PARAM_TYPES.has(p.type)).map((p) => (

                <div className="info-row" key={p.name}>
                    <span>{p.displayName || formatParamLabel(p.name)}</span>
                    <strong>
                        {p.type === "boolean" ? (
                            <span className={paramValues[p.name] === "true" ? "status-success" : "status-failed"}>
                                {paramValues[p.name] === "true" ? "Enabled" : "Disabled"}
                            </span>
                        ) : (paramValues[p.name] || "-")}
                    </strong>
                </div>

            ))}

            {pipelineName && (

                <>

                <h2 className="card-title" style={{ marginTop: "20px" }}>Previous Run</h2>

                {!latestRun ? (
                    <p className="empty-state">This pipeline hasn't run yet.</p>
                ) : (

                    <>

                    <div className="info-row">
                        <span>Status</span>
                        <strong><RunStatusBadge state={latestRun.state} result={latestRun.result} /></strong>
                    </div>

                    <div className="info-row">
                        <span>Created</span>
                        <strong>{latestRun.createdDate ? new Date(latestRun.createdDate).toLocaleString() : "-"}</strong>
                    </div>

                    <div className="info-row">
                        <span>Finished</span>
                        <strong>{latestRun.finishedDate ? new Date(latestRun.finishedDate).toLocaleString() : "-"}</strong>
                    </div>

                    {latestRun.webUrl && (
                        <div className="info-row">
                            <span>Link</span>
                            <strong><a href={latestRun.webUrl} target="_blank" rel="noreferrer">Open in Azure DevOps →</a></strong>
                        </div>
                    )}

                    </>

                )}

                </>

            )}

        </div>

    );

}

// Azure DevOps' Pipelines sub-page - a two-panel "Pipeline Configuration" +
// "Pipeline Summary" layout deliberately mirroring GitHub's own Deploy
// page (DeploymentForm.jsx/DeploymentSummary.jsx - same .deploy-panel grid,
// same live-updating summary alongside the form) rather than a bespoke
// shape, plus a self-service "Run pipeline" action below both (the calling
// session's own credential and its real Execute permission on Azure
// DevOps' own side is the auth boundary, same posture as EC2/ECR mutating
// actions elsewhere in this app - see RunPipelineAsync's own comment). The
// project itself is picked once on the Dashboard sub-page and shared via
// AzureDevOpsProjectContext - this page no longer asks for one separately.
export default function AzureDevOpsPipelinesView() {

    const { setTab } = useNavigation();
    const { project } = useAzureDevOpsProject();
    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [pipelines, setPipelines] = useState(null);
    const [pipelinesLoading, setPipelinesLoading] = useState(false);

    const [mode, setMode] = useState("CI");
    const [pipelineId, setPipelineId] = useState("");

    const [branches, setBranches] = useState(null);
    const [branchesLoading, setBranchesLoading] = useState(false);
    const [branch, setBranch] = useState("");

    const [parameters, setParameters] = useState(null);
    const [parametersLoading, setParametersLoading] = useState(false);
    const [paramValues, setParamValues] = useState({});

    const [runs, setRuns] = useState(null);
    const [runsLoading, setRunsLoading] = useState(false);

    const [running, setRunning] = useState(false);

    useEffect(() => {

        setPipelineId("");
        setBranches(null);
        setBranch("");
        setParameters(null);
        setParamValues({});
        setRuns(null);

        if (!project) {
            setPipelines(null);
            return;
        }

        setPipelinesLoading(true);

        getAzureDevOpsPipelines(project.name).then((data) => {
            setPipelines(data);
            setPipelinesLoading(false);
        }).catch((err) => {
            console.error(err);
            setPipelines({ configured: false, error: "Unable to load pipelines." });
            setPipelinesLoading(false);
        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id]);

    function handleModeChange(nextMode) {

        setMode(nextMode);
        setPipelineId("");
        setBranches(null);
        setBranch("");
        setParameters(null);
        setParamValues({});
        setRuns(null);

    }

    // Picking a pipeline kicks off three independent fetches: its own run
    // history (same as before), its linked repository's branches, and its
    // own declared parameters (a pipeline's basic list entry carries
    // neither its repository nor its YAML file's parameters - see
    // GetPipelineDetailAsync/GetPipelineParametersAsync's own comments on
    // why each needs its own dedicated call). Branches and parameters both
    // depend on the same pipeline-detail fetch (repositoryId for branches,
    // repositoryId+yamlPath for parameters), so they're chained off one
    // shared call rather than two separate detail fetches.
    function handleSelectPipeline(nextId) {

        setPipelineId(nextId);
        setBranch("");
        setBranches(null);
        setParameters(null);
        setParamValues({});
        setRuns(null);

        if (!nextId) return;

        const idNum = Number(nextId);

        setRunsLoading(true);

        getAzureDevOpsRuns(project.name, idNum).then((data) => {
            setRuns(data);
            setRunsLoading(false);
        }).catch((err) => {
            console.error(err);
            setRuns({ configured: false, error: "Unable to load run history." });
            setRunsLoading(false);
        });

        setBranchesLoading(true);
        setParametersLoading(true);

        getAzureDevOpsPipelineDetail(project.name, idNum).then((detail) => {

            if (!detail.repositoryId) {
                setBranches({ configured: true, branches: [] });
                setBranchesLoading(false);
                setParameters({ configured: true, parameters: [] });
                setParametersLoading(false);
                return;
            }

            getAzureDevOpsBranches(project.name, detail.repositoryId).then((data) => {
                setBranches(data);
                setBranchesLoading(false);
            }).catch((err) => {
                console.error(err);
                setBranches({ configured: false, error: "Unable to load branches." });
                setBranchesLoading(false);
            });

            if (!detail.yamlPath) {
                setParameters({ configured: true, parameters: [] });
                setParametersLoading(false);
                return;
            }

            getAzureDevOpsPipelineParameters(project.name, detail.repositoryId, detail.yamlPath).then((data) => {

                setParameters(data);
                setParametersLoading(false);

                const defaults = {};

                (data?.parameters || [])
                    .filter((p) => RENDERABLE_PARAM_TYPES.has(p.type))
                    .forEach((p) => { defaults[p.name] = p.default ?? (p.type === "boolean" ? "false" : ""); });

                setParamValues(defaults);

            }).catch((err) => {
                console.error(err);
                setParameters({ configured: false, error: "Unable to load pipeline parameters." });
                setParametersLoading(false);
            });

        }).catch((err) => {
            console.error(err);
            setBranches({ configured: false, error: "Unable to load branches." });
            setBranchesLoading(false);
            setParameters({ configured: false, error: "Unable to load pipeline parameters." });
            setParametersLoading(false);
        });

    }

    function setParamValue(name, value) {

        setParamValues((prev) => ({ ...prev, [name]: value }));

    }

    async function handleRunPipeline() {

        const selectedPipeline = modeFilteredPipelines.find((p) => String(p.id) === pipelineId);

        if (!selectedPipeline) return;

        if (!(await confirm({
            title: `Run "${selectedPipeline.name}"?`,
            message: branch
                ? `Starts a new run of this pipeline against the "${branch}" branch, using your own connected Azure DevOps credential.`
                : "Starts a new run against this pipeline's own configured default branch, using your own connected Azure DevOps credential.",
            confirmLabel: "Run Pipeline",
            danger: false
        }))) {
            return;
        }

        setRunning(true);

        try {

            const result = await runAzureDevOpsPipeline(project.name, selectedPipeline.id, branch || undefined, paramValues);

            if (result.success) {
                toast.show(result.message || "Run started.", "success");
                handleSelectPipeline(pipelineId);
            }
            else {
                toast.show(result.error || "Unable to start the run.", "error");
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to start the run.", "error");

        }
        finally {

            setRunning(false);

        }

    }

    const modeFilteredPipelines = useMemo(
        () => (pipelines?.pipelines || []).filter((p) => classifyPipeline(p) === mode),
        [pipelines, mode]
    );

    const selectedPipeline = modeFilteredPipelines.find((p) => String(p.id) === pipelineId);

    const runsList = runs?.runs || [];
    const {
        page: runsPage, setPage: setRunsPage, pageCount: runsPageCount, pageItems: runsPageItems,
        totalCount: runsTotalCount, startIndex: runsStartIndex, endIndex: runsEndIndex
    } = usePagination(runsList, PAGE_SIZE);

    if (!project) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Pick an Azure DevOps project on the{" "}
                    <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("dashboard")}>Dashboard</button>
                    {" "}first.
                </p>
            </div>
        );

    }

    return (

        <>

        {dialog}

        <div className="deploy-panel">

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>Pipeline Configuration</h2>
                    <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("dashboard")}>Change project</button>
                </div>

                <p className="field-hint" style={{ marginTop: 0 }}>{project.name}</p>

                {pipelinesLoading ? (

                    <p className="field-hint">Loading pipelines...</p>

                ) : !pipelines?.configured || pipelines.error ? (

                    <p className="error-message">{pipelines?.error || "Azure DevOps is not configured."}</p>

                ) : (

                    <>

                    <fieldset className="form-group" style={{ border: "none", padding: 0, margin: 0 }}>

                        <legend className="field-hint" style={{ padding: 0, marginBottom: "6px" }}>Mode</legend>

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

                    </fieldset>

                    <div className="form-group">

                        <label htmlFor="ado-pipeline-branch">Branch</label>

                        <ComboBox
                            id="ado-pipeline-branch"
                            options={(branches?.branches || []).map((b) => ({ value: b.name, label: b.name }))}
                            value={branch}
                            onChange={setBranch}
                            placeholder="Search or select a branch..."
                            emptyLabel={pipelineId ? "No branch found" : "Pick a pipeline first"}
                        />

                    </div>

                    <div className="form-group">

                        <label htmlFor="ado-pipeline-select">Pipeline</label>

                        <p className="field-hint">
                            {mode === "CI"
                                ? "Showing pipelines that look like CI (build/test) only."
                                : mode === "CD"
                                    ? "Showing pipelines that look like release/deploy only."
                                    : "Showing pipelines that combine CI and CD (e.g. \"Build & Release\")."}
                        </p>

                        <ComboBox
                            id="ado-pipeline-select"
                            options={modeFilteredPipelines.map((p) => ({ value: String(p.id), label: p.name }))}
                            value={pipelineId}
                            onChange={handleSelectPipeline}
                            placeholder="Search or select a pipeline..."
                            emptyLabel={`No ${mode} pipeline found`}
                        />

                    </div>

                    {pipelineId && (

                        <>

                        {branchesLoading && <p className="field-hint">Loading branches...</p>}
                        {branches?.error && <p className="field-hint">{branches.error}</p>}

                        {parametersLoading ? (

                            <p className="field-hint">Loading pipeline parameters...</p>

                        ) : parameters?.error ? (

                            <p className="field-hint">{parameters.error}</p>

                        ) : (parameters?.parameters || []).filter((p) => RENDERABLE_PARAM_TYPES.has(p.type)).length > 0 && (

                            <fieldset className="form-group" style={{ border: "none", padding: 0, margin: 0 }}>

                                <legend className="field-hint" style={{ padding: 0, fontWeight: 600 }}>Parameters</legend>

                                <p className="field-hint">
                                    Declared by this pipeline's own YAML file, same as Azure DevOps' own "Run pipeline" dialog.
                                </p>

                                {parameters.parameters.filter((p) => RENDERABLE_PARAM_TYPES.has(p.type)).map((p) => (

                                    p.type === "boolean" ? (

                                        <label key={p.name} className="checkbox-list-item" style={{ display: "block" }}>
                                            <input
                                                type="checkbox"
                                                checked={paramValues[p.name] === "true"}
                                                onChange={(e) => setParamValue(p.name, e.target.checked ? "true" : "false")}
                                            />
                                            &nbsp;{p.displayName || p.name}
                                        </label>

                                    ) : p.values && p.values.length > 0 ? (

                                        <div key={p.name} style={{ marginBottom: "10px" }}>
                                            <label htmlFor={`ado-param-${p.name}`} style={{ display: "block" }}>{p.displayName || p.name}</label>
                                            <ComboBox
                                                id={`ado-param-${p.name}`}
                                                options={p.values.map((v) => ({ value: v, label: v }))}
                                                value={paramValues[p.name] || ""}
                                                onChange={(value) => setParamValue(p.name, value)}
                                                placeholder={`Search or select ${p.displayName || p.name}...`}
                                                emptyLabel="No matching value"
                                            />
                                        </div>

                                    ) : (

                                        <div key={p.name} className="form-group" style={{ marginBottom: "10px" }}>
                                            <label htmlFor={`ado-param-${p.name}`}>{p.displayName || p.name}</label>
                                            <input
                                                id={`ado-param-${p.name}`}
                                                type={p.type === "number" ? "number" : "text"}
                                                className="form-control"
                                                value={paramValues[p.name] || ""}
                                                onChange={(e) => setParamValue(p.name, e.target.value)}
                                            />
                                        </div>

                                    )

                                ))}

                            </fieldset>

                        )}

                        </>

                    )}

                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!pipelineId || running}
                        onClick={handleRunPipeline}
                    >
                        {running ? "Starting..." : "Run Pipeline"}
                    </button>

                    </>

                )}

            </div>

            <PipelineSummary
                mode={mode}
                pipelineName={selectedPipeline?.name}
                branch={branch}
                parameters={parameters?.parameters}
                paramValues={paramValues}
                latestRun={runsList[0]}
            />

        </div>

        {pipelineId && (

            <div className="card" style={{ marginTop: "20px" }}>

                <h2 className="card-title">Run History</h2>

                {runsLoading ? (

                    <p className="field-hint">Loading run history...</p>

                ) : !runs?.configured || runs.error ? (

                    <p className="error-message">{runs?.error || "Unable to load run history."}</p>

                ) : runsList.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No runs for this pipeline yet.</p>

                ) : (

                    <>

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Run</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Finished</th>
                                </tr>
                            </thead>

                            <tbody>

                                {runsPageItems.map((run) => (

                                    <tr key={run.id}>
                                        <td>
                                            {run.webUrl ? (
                                                <a href={run.webUrl} target="_blank" rel="noreferrer">{run.name || `#${run.id}`}</a>
                                            ) : (run.name || `#${run.id}`)}
                                        </td>
                                        <td><RunStatusBadge state={run.state} result={run.result} /></td>
                                        <td>{run.createdDate ? new Date(run.createdDate).toLocaleString() : "—"}</td>
                                        <td>{run.finishedDate ? new Date(run.finishedDate).toLocaleString() : "—"}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                    <Pagination
                        page={runsPage}
                        pageCount={runsPageCount}
                        totalCount={runsTotalCount}
                        startIndex={runsStartIndex}
                        endIndex={runsEndIndex}
                        onPageChange={setRunsPage}
                    />

                    </>

                )}

            </div>

        )}

        </>

    );

}

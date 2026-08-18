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

// Azure DevOps run state/result as a colored badge - its own small helper
// rather than reusing StatusBadge (that one speaks GitHub Actions'
// queued/in_progress/success/failure vocabulary specifically) or StateBadge
// (AWS resource states) - Azure Pipelines uses a different pair of fields
// entirely (State while running, Result only once State is "completed").
// Azure Pipelines' own declared parameter types that actually map onto a
// plain input control - step/job/stage and their List variants are
// YAML-authoring-time constructs (literal pipeline stage/job definitions)
// with no meaningful "value" a visitor could type into a form, so those
// are left out of the rendered form entirely rather than guessing at a
// control for them.
const RENDERABLE_PARAM_TYPES = new Set(["boolean", "string", "number"]);

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

// Azure DevOps' Pipelines sub-page - lists pipelines and recent run status/
// history, plus a self-service "Run pipeline" action (the calling
// session's own credential and its real Execute permission on Azure
// DevOps' own side is the auth boundary, same posture as EC2/ECR mutating
// actions elsewhere in this app - see RunPipelineAsync's own comment). The
// project itself is picked once on the Dashboard sub-page and shared via
// AzureDevOpsProjectContext - this page no longer asks for one separately,
// matching how the real Azure DevOps portal's own project picker works.
// A CI/CD/CI+CD-tabbed, search-by-name pipeline picker, an optional
// branch picker, and that pipeline's own run history - deliberately
// mirroring DeploymentForm.jsx's own GitHub Deploy form shape rather than
// a folder browser, since Azure DevOps' folder structure isn't how a
// visitor actually wants to find a specific pipeline to run.
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

    const runsList = runs?.runs || [];
    const {
        page: runsPage, setPage: setRunsPage, pageCount: runsPageCount, pageItems: runsPageItems,
        totalCount: runsTotalCount, startIndex: runsStartIndex, endIndex: runsEndIndex
    } = usePagination(runsList, PAGE_SIZE);

    if (!project) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Pick a project on the{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("azureDevOpsDashboard"); }}>Azure DevOps Dashboard</a>
                    {" "}first.
                </p>
            </div>
        );

    }

    return (

        <>

        {dialog}

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>{project.name}</h2>
                <a href="#" onClick={(e) => { e.preventDefault(); setTab("azureDevOpsDashboard"); }}>Change project</a>
            </div>

            {pipelinesLoading ? (

                <p className="field-hint">Loading pipelines...</p>

            ) : !pipelines?.configured || pipelines.error ? (

                <p className="error-message">{pipelines?.error || "Azure DevOps is not configured."}</p>

            ) : (

                <>

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

                <div className="form-group">

                    <label>Pipeline</label>

                    <p className="field-hint">
                        {mode === "CI"
                            ? "Showing pipelines that look like CI (build/test) only."
                            : mode === "CD"
                                ? "Showing pipelines that look like release/deploy only."
                                : "Showing pipelines that combine CI and CD (e.g. \"Build & Release\")."}
                    </p>

                    <ComboBox
                        options={modeFilteredPipelines.map((p) => ({ value: String(p.id), label: p.name }))}
                        value={pipelineId}
                        onChange={handleSelectPipeline}
                        placeholder="Search or select a pipeline..."
                        emptyLabel={`No ${mode} pipeline found`}
                    />

                </div>

                {pipelineId && (

                    <>

                    <div className="form-group">

                        <label>Branch</label>

                        <p className="field-hint">
                            Optional - leave blank to run against this pipeline's own configured default branch.
                        </p>

                        {branchesLoading ? (

                            <p className="field-hint">Loading branches...</p>

                        ) : branches?.error ? (

                            <p className="field-hint">{branches.error}</p>

                        ) : (

                            <ComboBox
                                options={(branches?.branches || []).map((b) => ({ value: b.name, label: b.name }))}
                                value={branch}
                                onChange={setBranch}
                                placeholder="Search or select a branch..."
                                emptyLabel="No branch found"
                            />

                        )}

                    </div>

                    {parametersLoading ? (

                        <p className="field-hint">Loading pipeline parameters...</p>

                    ) : parameters?.error ? (

                        <p className="field-hint">{parameters.error}</p>

                    ) : (parameters?.parameters || []).filter((p) => RENDERABLE_PARAM_TYPES.has(p.type)).length > 0 && (

                        <div className="form-group">

                            <label>Parameters</label>

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
                                        <label style={{ display: "block" }}>{p.displayName || p.name}</label>
                                        <ComboBox
                                            options={p.values.map((v) => ({ value: v, label: v }))}
                                            value={paramValues[p.name] || ""}
                                            onChange={(value) => setParamValue(p.name, value)}
                                            placeholder={`Search or select ${p.displayName || p.name}...`}
                                            emptyLabel="No matching value"
                                        />
                                    </div>

                                ) : (

                                    <div key={p.name} className="form-group" style={{ marginBottom: "10px" }}>
                                        <label>{p.displayName || p.name}</label>
                                        <input
                                            type={p.type === "number" ? "number" : "text"}
                                            className="form-control"
                                            value={paramValues[p.name] || ""}
                                            onChange={(e) => setParamValue(p.name, e.target.value)}
                                        />
                                    </div>

                                )

                            ))}

                        </div>

                    )}

                    <button
                        type="button"
                        className="btn btn-primary"
                        style={{ marginBottom: "20px" }}
                        onClick={handleRunPipeline}
                        disabled={running}
                    >
                        {running ? "Starting..." : "Run Pipeline"}
                    </button>

                    <h3 className="settings-subhead">Run History</h3>

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

                    </>

                )}

                </>

            )}

        </div>

        </>

    );

}

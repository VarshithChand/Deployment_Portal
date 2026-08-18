import { useEffect, useMemo, useState } from "react";

import {
    getAzureDevOpsProjects, getAzureDevOpsPipelines, getAzureDevOpsRuns, runAzureDevOpsPipeline
} from "../../services/azureDevOpsService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import useNavigation from "../../hooks/useNavigation";
import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";

const PAGE_SIZE = 10;

// A closed-outline folder glyph, local to this file (and ArtifactsView,
// which shares the same project -> pipeline folder browser) rather than
// added to the sidebar's own icon set - this marks rows inside a page's
// content area, not a nav destination. Single polygon, no curves, same
// "simple geometric shapes" house style as the sidebar icons.
export function FolderIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <polygon
                points="1.5,4 6,4 7.5,5.5 14.5,5.5 14.5,12.5 1.5,12.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// Azure DevOps pipelines carry a "folder" path (e.g. "\", "\CI",
// "\CI\Backend") - Azure DevOps' own portal lets you browse these as real
// folders rather than a flat list with a folder column, which is what this
// page did before. Both helpers below turn that flat list into a
// navigable tree purely client-side (the Pipelines list API has no
// separate "list folders" endpoint - folder membership only exists as a
// field on each pipeline).
export function folderSegments(folder) {
    return (folder || "").split("\\").filter(Boolean);
}

export function getFolderContents(pipelines, currentSegments) {

    const subfolders = new Set();
    const items = [];

    pipelines.forEach((p) => {

        const segments = folderSegments(p.folder);
        const matchesPrefix = currentSegments.every((seg, i) => segments[i] === seg);

        if (!matchesPrefix) return;

        if (segments.length === currentSegments.length) {
            items.push(p);
        }
        else {
            subfolders.add(segments[currentSegments.length]);
        }

    });

    return { subfolders: Array.from(subfolders).sort(), items };

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

// Azure DevOps' Pipelines sub-page - lists pipelines and recent run status/
// history, plus a self-service "Run pipeline" action (the calling
// session's own credential and its real Execute permission on Azure
// DevOps' own side is the auth boundary, same posture as EC2/ECR mutating
// actions elsewhere in this app - see RunPipelineAsync's own comment).
// Three levels: projects -> pipelines (browsable by folder) -> runs.
// Unlike Branches, both Pipelines and its runs are strictly project-scoped
// in Azure DevOps' own API - there is no org-wide "every pipeline in every
// project" endpoint - so this page always starts with a project picker.
export default function AzureDevOpsPipelinesView() {

    const { setTab } = useNavigation();
    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [projects, setProjects] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [selectedProject, setSelectedProject] = useState(null);
    const [pipelines, setPipelines] = useState(null);
    const [pipelinesLoading, setPipelinesLoading] = useState(false);
    const [folderPath, setFolderPath] = useState([]);

    const [selectedPipeline, setSelectedPipeline] = useState(null);
    const [runs, setRuns] = useState(null);
    const [runsLoading, setRunsLoading] = useState(false);

    const [runningPipelineId, setRunningPipelineId] = useState(null);

    function refresh() {

        setLoading(true);

        getAzureDevOpsProjects().then((data) => {
            setProjects(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setProjects({ configured: false, error: "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    function openProject(project) {

        setSelectedProject(project);
        setFolderPath([]);
        setPipelinesLoading(true);

        getAzureDevOpsPipelines(project.name).then((data) => {
            setPipelines(data);
            setPipelinesLoading(false);
        }).catch((err) => {
            console.error(err);
            setPipelines({ configured: false, error: "Unable to load pipelines." });
            setPipelinesLoading(false);
        });

    }

    function loadRuns(pipeline) {

        setSelectedPipeline(pipeline);
        setRunsLoading(true);

        getAzureDevOpsRuns(selectedProject.name, pipeline.id).then((data) => {
            setRuns(data);
            setRunsLoading(false);
        }).catch((err) => {
            console.error(err);
            setRuns({ configured: false, error: "Unable to load run history." });
            setRunsLoading(false);
        });

    }

    async function handleRunPipeline(pipeline, e) {

        // Stops a click on the row's own "view run history" handler from
        // also firing when the button nested inside that row is clicked.
        e?.stopPropagation();

        if (!(await confirm({
            title: `Run "${pipeline.name}"?`,
            message: "Starts a new run against this pipeline's default branch, using your own connected Azure DevOps credential.",
            confirmLabel: "Run Pipeline",
            danger: false
        }))) {
            return;
        }

        setRunningPipelineId(pipeline.id);

        try {

            const result = await runAzureDevOpsPipeline(selectedProject.name, pipeline.id);

            if (result.success) {
                toast.show(result.message || "Run started.", "success");

                // If this trigger happened from inside the pipeline's own
                // run-history view, refresh it so the new run shows up
                // immediately instead of waiting for a manual refresh.
                if (selectedPipeline?.id === pipeline.id) {
                    loadRuns(pipeline);
                }
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

            setRunningPipelineId(null);

        }

    }

    const filteredProjects = useMemo(() => {

        const items = projects?.projects || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed ? items.filter((p) => p.name.toLowerCase().includes(trimmed)) : items;

    }, [projects, search]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filteredProjects, PAGE_SIZE);

    const runsList = runs?.runs || [];
    const {
        page: runsPage, setPage: setRunsPage, pageCount: runsPageCount, pageItems: runsPageItems,
        totalCount: runsTotalCount, startIndex: runsStartIndex, endIndex: runsEndIndex
    } = usePagination(runsList, PAGE_SIZE);

    const folderContents = useMemo(
        () => getFolderContents(pipelines?.pipelines || [], folderPath),
        [pipelines, folderPath]
    );

    // ---- Level 3: runs ----

    if (selectedPipeline) {

        return (

            <>

            {/* Rendered as a sibling of .card, not inside it - .card has its
                own backdrop-filter (this app's glass theme), and any ancestor
                with backdrop-filter/transform creates a new CSS containing
                block for position:fixed descendants, trapping the dialog's
                backdrop inside the card's own bounds instead of the viewport
                (same fix AppCacheControlCard's own useConfirm usage needed). */}
            {dialog}

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedPipeline.name}</h2>
                    <div className="button-row">
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={(e) => handleRunPipeline(selectedPipeline, e)}
                            disabled={runningPipelineId === selectedPipeline.id}
                        >
                            {runningPipelineId === selectedPipeline.id ? "Starting..." : "Run Pipeline"}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedPipeline(null); setRuns(null); }}>
                            ← Back to pipelines
                        </button>
                    </div>
                </div>

                {runsLoading ? (

                    <p className="field-hint">Loading run history...</p>

                ) : !runs?.configured || runs.error ? (

                    <p className="error-message">{runs?.error || "Azure DevOps is not configured."}</p>

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

            </>

        );

    }

    // ---- Level 2: pipelines, browsable by folder ----

    if (selectedProject) {

        const breadcrumbItems = [
            { label: selectedProject.name, onClick: () => setFolderPath([]) },
            ...folderPath.map((seg, i) => ({
                label: seg,
                onClick: i < folderPath.length - 1 ? () => setFolderPath(folderPath.slice(0, i + 1)) : undefined
            }))
        ];

        return (

            <>

            {dialog}

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        {breadcrumbItems.map((item, i) => (
                            <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {i > 0 && <span className="field-hint" style={{ margin: 0 }}>/</span>}
                                {item.onClick ? (
                                    <button type="button" className="btn btn-link" style={{ padding: 0 }} onClick={item.onClick}>
                                        {item.label}
                                    </button>
                                ) : (
                                    <span className="card-title" style={{ marginBottom: 0 }}>{item.label}</span>
                                )}
                            </span>
                        ))}
                    </nav>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedProject(null); setPipelines(null); setFolderPath([]); }}>
                        ← Back to projects
                    </button>
                </div>

                {pipelinesLoading ? (

                    <p className="field-hint">Loading pipelines...</p>

                ) : !pipelines?.configured || pipelines.error ? (

                    <p className="error-message">{pipelines?.error || "Azure DevOps is not configured."}</p>

                ) : folderContents.subfolders.length === 0 && folderContents.items.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>Nothing in this folder.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th></th>
                                </tr>
                            </thead>

                            <tbody>

                                {folderContents.subfolders.map((name) => (

                                    <tr key={`folder:${name}`} className="table-row-clickable" onClick={() => setFolderPath([...folderPath, name])}>
                                        <td>
                                            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                <FolderIcon />
                                                {name}
                                            </span>
                                        </td>
                                        <td></td>
                                    </tr>

                                ))}

                                {folderContents.items.map((pipeline) => (

                                    <tr key={pipeline.id} className="table-row-clickable" onClick={() => loadRuns(pipeline)}>
                                        <td>{pipeline.name}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={(e) => handleRunPipeline(pipeline, e)}
                                                disabled={runningPipelineId === pipeline.id}
                                            >
                                                {runningPipelineId === pipeline.id ? "Starting..." : "Run"}
                                            </button>
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

            </>

        );

    }

    // ---- Level 1: projects ----

    if (loading) {
        return <div className="card"><p className="empty-state">Loading Azure DevOps projects...</p></div>;
    }

    if (!projects?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Connect your Azure DevOps credentials in{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>Settings → Credentials → Azure DevOps</a>
                    {" "}to browse this.
                </p>
            </div>
        );

    }

    if (projects.error) {
        return <div className="card"><p className="error-message">{projects.error}</p></div>;
    }

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Azure DevOps Projects</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
            </div>

            <SearchBox placeholder="Search projects..." value={search} onChange={setSearch} />

            {filteredProjects.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No projects found.</p>

            ) : (

                <>

                <div className="table-scroll" style={{ marginTop: "12px" }}>

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Project</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((project) => (

                                <tr key={project.id} className="table-row-clickable" onClick={() => openProject(project)}>
                                    <td>{project.name}</td>
                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

                <Pagination
                    page={page}
                    pageCount={pageCount}
                    totalCount={totalCount}
                    startIndex={startIndex}
                    endIndex={endIndex}
                    onPageChange={setPage}
                />

                </>

            )}

        </div>

    );

}

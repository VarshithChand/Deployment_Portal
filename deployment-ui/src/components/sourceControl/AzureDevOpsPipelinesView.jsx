import { useEffect, useMemo, useState } from "react";

import { getAzureDevOpsProjects, getAzureDevOpsPipelines, getAzureDevOpsRuns } from "../../services/azureDevOpsService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

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

// Azure DevOps' Pipelines sub-page - view-only (list pipelines and recent
// run status/history, no trigger action - a real "start a run" flow is a
// separate, bigger feature with its own confirmation/permission surface).
// Three levels: projects -> pipelines -> runs. Unlike Branches, both
// Pipelines and its runs are strictly project-scoped in Azure DevOps' own
// API - there is no org-wide "every pipeline in every project" endpoint -
// so this page always starts with a project picker.
export default function AzureDevOpsPipelinesView() {

    const { setTab } = useNavigation();

    const [projects, setProjects] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [selectedProject, setSelectedProject] = useState(null);
    const [pipelines, setPipelines] = useState(null);
    const [pipelinesLoading, setPipelinesLoading] = useState(false);

    const [selectedPipeline, setSelectedPipeline] = useState(null);
    const [runs, setRuns] = useState(null);
    const [runsLoading, setRunsLoading] = useState(false);

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

    function openPipeline(pipeline) {

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

    // ---- Level 3: runs ----

    if (selectedPipeline) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedPipeline.name}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedPipeline(null); setRuns(null); }}>
                        ← Back to pipelines
                    </button>
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

        );

    }

    // ---- Level 2: pipelines ----

    if (selectedProject) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedProject.name}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedProject(null); setPipelines(null); }}>
                        ← Back to projects
                    </button>
                </div>

                {pipelinesLoading ? (

                    <p className="field-hint">Loading pipelines...</p>

                ) : !pipelines?.configured || pipelines.error ? (

                    <p className="error-message">{pipelines?.error || "Azure DevOps is not configured."}</p>

                ) : pipelines.pipelines.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No pipelines in this project.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Pipeline</th>
                                    <th>Folder</th>
                                </tr>
                            </thead>

                            <tbody>

                                {pipelines.pipelines.map((pipeline) => (

                                    <tr key={pipeline.id} className="table-row-clickable" onClick={() => openPipeline(pipeline)}>
                                        <td>{pipeline.name}</td>
                                        <td>{pipeline.folder || "—"}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

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

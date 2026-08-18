import { useEffect, useMemo, useState } from "react";

import { getAzureDevOpsProjects, getAzureDevOpsPipelines, getAzureDevOpsRuns, getAzureDevOpsArtifacts } from "../../services/azureDevOpsService";
import { FolderIcon, getFolderContents } from "./AzureDevOpsPipelinesView";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

// Azure DevOps' Build Artifacts sub-page - four levels: projects ->
// pipelines (browsable by folder, same as the Pipelines page - see
// FolderIcon/getFolderContents there) -> runs -> artifacts. The first
// three selection steps are the same project/pipeline/run picker the
// Pipelines page itself uses (both pages independently drive through
// Azure DevOps' own project-scoped structure, same reasoning GitHub's
// History and Artifacts & Images pages already stay separate despite both
// drilling through repo/run selection) - here a run is the means to an
// end (its artifacts), not the payoff, so no run-trigger action lives on
// this page - that's Pipelines' job.
export default function AzureDevOpsArtifactsView() {

    const { setTab } = useNavigation();

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

    const [selectedRun, setSelectedRun] = useState(null);
    const [artifacts, setArtifacts] = useState(null);
    const [artifactsLoading, setArtifactsLoading] = useState(false);

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

    function openRun(run) {

        setSelectedRun(run);
        setArtifactsLoading(true);

        getAzureDevOpsArtifacts(selectedProject.name, run.id).then((data) => {
            setArtifacts(data);
            setArtifactsLoading(false);
        }).catch((err) => {
            console.error(err);
            setArtifacts({ configured: false, error: "Unable to load artifacts." });
            setArtifactsLoading(false);
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

    const folderContents = useMemo(
        () => getFolderContents(pipelines?.pipelines || [], folderPath),
        [pipelines, folderPath]
    );

    // ---- Level 4: artifacts ----

    if (selectedRun) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedRun.name || `Run #${selectedRun.id}`}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedRun(null); setArtifacts(null); }}>
                        ← Back to runs
                    </button>
                </div>

                {artifactsLoading ? (

                    <p className="field-hint">Loading artifacts...</p>

                ) : !artifacts?.configured || artifacts.error ? (

                    <p className="error-message">{artifacts?.error || "Azure DevOps is not configured."}</p>

                ) : artifacts.artifacts.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No artifacts were published by this run.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Artifact</th>
                                    <th>Type</th>
                                    <th></th>
                                </tr>
                            </thead>

                            <tbody>

                                {artifacts.artifacts.map((artifact) => (

                                    <tr key={artifact.name}>
                                        <td>{artifact.name}</td>
                                        <td>{artifact.type || "—"}</td>
                                        <td>
                                            {artifact.downloadUrl && (
                                                <a href={artifact.downloadUrl} target="_blank" rel="noreferrer">Download</a>
                                            )}
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

        );

    }

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
                                    <th>Created</th>
                                </tr>
                            </thead>

                            <tbody>

                                {runsPageItems.map((run) => (

                                    <tr key={run.id} className="table-row-clickable" onClick={() => openRun(run)}>
                                        <td>{run.name || `#${run.id}`}</td>
                                        <td>{run.createdDate ? new Date(run.createdDate).toLocaleString() : "—"}</td>
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
                                    </tr>

                                ))}

                                {folderContents.items.map((pipeline) => (

                                    <tr key={pipeline.id} className="table-row-clickable" onClick={() => openPipeline(pipeline)}>
                                        <td>{pipeline.name}</td>
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

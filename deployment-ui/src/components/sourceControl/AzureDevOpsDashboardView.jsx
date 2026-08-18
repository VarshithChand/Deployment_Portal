import { useEffect, useMemo, useState } from "react";

import { getAzureDevOpsProjects, getAzureDevOpsRunningBuilds } from "../../services/azureDevOpsService";
import useAzureDevOpsProject from "../../hooks/useAzureDevOpsProject";
import SearchBox from "../common/SearchBox";
import useNavigation from "../../hooks/useNavigation";

// Azure DevOps' Dashboard sub-page - pick a project here once, and it
// applies across every other Azure DevOps sub-page that needs one
// (Pipelines, Build Artifacts, Pull Requests - see
// AzureDevOpsProjectContext.jsx), the same "pick a project, everything
// else follows" shape the real Azure DevOps portal itself uses. Branches
// and Package Feeds aren't affected - both are already org-wide and never
// asked for a project to begin with.
export default function AzureDevOpsDashboardView() {

    const { setTab } = useNavigation();
    const { project, setProject } = useAzureDevOpsProject();

    const [projects, setProjects] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [runningBuilds, setRunningBuilds] = useState(null);
    const [runningBuildsLoading, setRunningBuildsLoading] = useState(false);

    useEffect(() => {

        setLoading(true);

        getAzureDevOpsProjects().then((data) => {
            setProjects(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setProjects({ configured: false, error: "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }, []);

    function loadRunningBuilds(activeProject) {

        setRunningBuildsLoading(true);

        getAzureDevOpsRunningBuilds(activeProject.name).then((data) => {
            setRunningBuilds(data);
            setRunningBuildsLoading(false);
        }).catch((err) => {
            console.error(err);
            setRunningBuilds({ configured: false, error: "Unable to load running pipelines." });
            setRunningBuildsLoading(false);
        });

    }

    useEffect(() => {

        if (project) {
            loadRunningBuilds(project);
        }
        else {
            setRunningBuilds(null);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id]);

    const filteredProjects = useMemo(() => {

        const items = projects?.projects || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed ? items.filter((p) => p.name.toLowerCase().includes(trimmed)) : items;

    }, [projects, search]);

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

        <>

        <div className="card" style={{ marginBottom: "20px" }}>

            <h2 className="card-title">Project</h2>

            {project && (
                <p className="field-hint field-hint-good">
                    Currently working in <strong>{project.name}</strong> — every other Azure DevOps
                    page (Pipelines, Build Artifacts, Pull Requests) uses this same project.
                </p>
            )}

            <SearchBox placeholder="Search projects..." value={search} onChange={setSearch} />

            {filteredProjects.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No projects found.</p>

            ) : (

                <div className="table-scroll" style={{ marginTop: "12px" }}>

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Project</th>
                                <th></th>
                            </tr>
                        </thead>

                        <tbody>

                            {filteredProjects.map((p) => (

                                <tr key={p.id} className="table-row-clickable" onClick={() => setProject(p)}>
                                    <td>{p.name}</td>
                                    <td>
                                        {project?.id === p.id && <span className="badge badge-success">Selected</span>}
                                    </td>
                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

            )}

        </div>

        {project && (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>Running Pipelines</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadRunningBuilds(project)}>
                        Refresh
                    </button>
                </div>

                {runningBuildsLoading ? (

                    <p className="field-hint">Loading running pipelines...</p>

                ) : !runningBuilds?.configured || runningBuilds.error ? (

                    <p className="error-message">{runningBuilds?.error || "Unable to load running pipelines."}</p>

                ) : runningBuilds.builds.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>Nothing is running in this project right now.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Pipeline</th>
                                    <th>Build</th>
                                    <th>Branch</th>
                                    <th>Started</th>
                                </tr>
                            </thead>

                            <tbody>

                                {runningBuilds.builds.map((build) => (

                                    <tr key={build.id}>
                                        <td>
                                            {build.webUrl ? (
                                                <a href={build.webUrl} target="_blank" rel="noreferrer">{build.pipelineName}</a>
                                            ) : build.pipelineName}
                                        </td>
                                        <td>{build.buildNumber}</td>
                                        <td>{build.sourceBranch || "—"}</td>
                                        <td>{build.startTime ? new Date(build.startTime).toLocaleString() : "—"}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

        )}

        </>

    );

}

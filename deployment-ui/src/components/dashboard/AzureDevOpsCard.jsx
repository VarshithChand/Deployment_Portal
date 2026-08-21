import { useEffect, useMemo, useState } from "react";

import { getAzureDevOpsProjects, getAzureDevOpsRunningBuilds } from "../../services/azureDevOpsService";
import useAzureDevOpsProject from "../../hooks/useAzureDevOpsProject";
import SearchBox from "../common/SearchBox";

// Embedded inside AllRepositoriesCard's own Source Control container as
// `children` (see Dashboard.jsx) rather than its own separate card - by
// explicit request, one Source Control container on the Dashboard, not a
// second one sitting below it. Renders nothing at all (not even a
// "connect your credentials" hint) until Azure DevOps is actually
// configured - same request applied here: an unconfigured provider is
// hidden from the Dashboard, not shown as an empty placeholder. Content
// otherwise unchanged from its original standalone-card version: pick a
// project here once, and it applies across every other Azure DevOps
// sub-page that needs one (Pipelines, History, Build Artifacts, Pull
// Requests - see AzureDevOpsProjectContext.jsx).
export default function AzureDevOpsCard() {

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

    // Loading and "not configured" both render nothing - a loading flash or
    // a connect-hint paragraph inside someone else's card would read as
    // that card's own content stuttering, and an unconfigured provider
    // should just not appear at all per the Dashboard's own "configured ->
    // shown, otherwise hidden" rule. A real error (configured, but the
    // request itself failed) is still worth surfacing.
    if (loading || !projects?.configured) {
        return null;
    }

    if (projects.error) {

        return (
            <>
                <hr className="dashboard-section-divider" />
                <h3 className="settings-subhead">Azure DevOps</h3>
                <p className="error-message">{projects.error}</p>
            </>
        );

    }

    return (

        <>

        <hr className="dashboard-section-divider" />

        <h3 className="settings-subhead">Azure DevOps</h3>

        {project && (
            <p className="field-hint field-hint-good">
                Currently working in <strong>{project.name}</strong> — every Azure DevOps
                page (Pipelines, History, Build Artifacts, Pull Requests) uses this same project.
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
                            <th><span className="visually-hidden">Actions</span></th>
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

        {project && (

            <>

            <div className="button-row" style={{ justifyContent: "space-between", margin: "16px 0 12px" }}>
                <h4 className="settings-subhead" style={{ margin: 0 }}>Running Pipelines</h4>
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

            </>

        )}

        </>

    );

}

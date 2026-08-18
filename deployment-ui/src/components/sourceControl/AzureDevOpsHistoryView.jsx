import { useEffect, useMemo, useState } from "react";

import { getAzureDevOpsHistory } from "../../services/azureDevOpsService";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import usePagination from "../../hooks/usePagination";
import useAzureDevOpsProject from "../../hooks/useAzureDevOpsProject";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

// Azure DevOps run status/result as a colored badge - same small helper as
// AzureDevOpsPipelinesView's own RunStatusBadge (duplicated rather than
// imported, same reasoning as that file's own comment: it's a few lines,
// and StatusBadge speaks GitHub Actions' vocabulary specifically).
function RunStatusBadge({ status, result }) {

    const value = (result || status || "").toLowerCase();

    const className = value === "succeeded"
        ? "badge badge-success"
        : value === "failed"
            ? "badge badge-danger"
            : value === "canceled" || value === "canceling"
                ? "badge badge-secondary"
                : value === "partiallysucceeded"
                    ? "badge badge-warning"
                    : "badge badge-info";

    return <span className={className}>{result || status}</span>;

}

function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

// Azure DevOps' History sub-page - mirrors GitHub's own History page, but
// project-wide across EVERY pipeline at once (Azure DevOps' classic Build
// API list already spans the whole project, so there's no per-pipeline
// picker here the way Pipelines/Build Artifacts need one). The project
// itself is picked once on the Dashboard sub-page and shared via
// AzureDevOpsProjectContext.
export default function AzureDevOpsHistoryView() {

    const { setTab } = useNavigation();
    const { project } = useAzureDevOpsProject();

    const [history, setHistory] = useState(null);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");

    function loadHistory(currentProject) {

        if (!currentProject) {
            setHistory(null);
            return;
        }

        setLoading(true);

        getAzureDevOpsHistory(currentProject.name).then((data) => {
            setHistory(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setHistory({ configured: false, error: "Unable to load run history." });
            setLoading(false);
        });

    }

    useEffect(() => {

        loadHistory(project);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id]);

    const filteredRuns = useMemo(() => {

        const items = history?.runs || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed
            ? items.filter((run) =>
                run.pipelineName.toLowerCase().includes(trimmed) ||
                run.buildNumber.toLowerCase().includes(trimmed) ||
                run.sourceBranch.toLowerCase().includes(trimmed) ||
                run.requestedFor.toLowerCase().includes(trimmed))
            : items;

    }, [history, search]);

    const {
        page, setPage, pageCount, pageItems,
        totalCount, startIndex, endIndex
    } = usePagination(filteredRuns, PAGE_SIZE);

    if (!project) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Pick an Azure DevOps project on the{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("dashboard"); }}>Dashboard</a>
                    {" "}first.
                </p>
            </div>
        );

    }

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>{project.name}</h2>
                <div className="button-row">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadHistory(project)}>
                        Refresh
                    </button>
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("dashboard"); }}>Change project</a>
                </div>
            </div>

            {loading ? (

                <p className="field-hint">Loading run history...</p>

            ) : !history?.configured || history.error ? (

                <p className="error-message">{history?.error || "Azure DevOps is not configured."}</p>

            ) : (

                <>

                <SearchBox placeholder="Search by pipeline, build number, branch, or requester..." value={search} onChange={setSearch} />

                {filteredRuns.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No runs found for this project yet.</p>

                ) : (

                    <>

                    <div className="table-scroll" style={{ marginTop: "12px" }}>

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Build</th>
                                    <th>Pipeline</th>
                                    <th>Branch</th>
                                    <th>Status</th>
                                    <th>Requested By</th>
                                    <th>Started</th>
                                    <th>Finished</th>
                                </tr>
                            </thead>

                            <tbody>

                                {pageItems.map((run) => (

                                    <tr key={run.id}>
                                        <td>
                                            {run.webUrl ? (
                                                <a href={run.webUrl} target="_blank" rel="noreferrer">{run.buildNumber || `#${run.id}`}</a>
                                            ) : (run.buildNumber || `#${run.id}`)}
                                        </td>
                                        <td>{run.pipelineName}</td>
                                        <td>{run.sourceBranch || "—"}</td>
                                        <td><RunStatusBadge status={run.status} result={run.result} /></td>
                                        <td>{run.requestedFor || "—"}</td>
                                        <td>{formatDate(run.startTime)}</td>
                                        <td>{formatDate(run.finishTime)}</td>
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

                </>

            )}

        </div>

    );

}

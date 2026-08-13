import { useState } from "react";

import usePolling from "../hooks/usePolling";
import usePagination from "../hooks/usePagination";
import { getWorkflowRuns } from "../services/historyService";
import LoadingSpinner from "../components/LoadingSpinner";
import RequireRepoSelected from "../components/RequireRepoSelected";
import PageLayout from "../components/layout/PageLayout";
import Pagination from "../components/common/Pagination";

function dotClass(run) {

    if (run.status !== "completed") {
        return run.status === "in_progress" ? "timeline-dot-in_progress" : "timeline-dot-queued";
    }

    return run.conclusion === "success" ? "timeline-dot-success" : "timeline-dot-failure";

}

function statusLabel(run) {

    if (run.status !== "completed") {
        return run.status === "in_progress" ? "Running" : "Queued";
    }

    return run.conclusion === "success" ? "Succeeded" : "Failed";

}

export default function Timeline() {

    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);

    async function load() {

        const data = await getWorkflowRuns();
        setRuns(Array.isArray(data) ? data : []);
        setLoading(false);

    }

    // 30s — GitHub's anonymous rate limit is only 60 requests/hour, and this
    // polls continuously for as long as the Timeline page stays open.
    usePolling(load, 30000);

    // 15/page — matches History, which paginates this same underlying
    // list of runs (GetWorkflowRuns can return up to 100 at once).
    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(runs, 15);

    if (loading) {
        return <LoadingSpinner />;
    }

    return (

        <PageLayout title="Deployment Timeline">

            <RequireRepoSelected>

            <div className="card">

                {runs.length === 0 ? (

                    <p className="empty-state">No deployments yet.</p>

                ) : (

                    <div className="timeline">

                        {pageItems.map((run) => (

                            <div className="timeline-item" key={run.id}>

                                <span className={`timeline-dot ${dotClass(run)}`} />

                                <div className="timeline-title">
                                    {run.name || "Deployment"} on {run.branch}
                                </div>

                                <div className="timeline-meta">
                                    {statusLabel(run)} · {run.triggeredBy || "unknown"} · {new Date(run.createdAt).toLocaleString()}
                                </div>

                            </div>

                        ))}

                    </div>

                )}

                <Pagination
                    page={page}
                    pageCount={pageCount}
                    totalCount={totalCount}
                    startIndex={startIndex}
                    endIndex={endIndex}
                    onPageChange={setPage}
                />

            </div>

            </RequireRepoSelected>

        </PageLayout>

    );

}

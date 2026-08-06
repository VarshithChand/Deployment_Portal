import { Fragment, useState } from "react";

import StatusBadge from "./StatusBadge";
import usePagination from "../hooks/usePagination";
import Pagination from "./common/Pagination";
import CopyButton from "./common/CopyButton";
import { getRunErrors } from "../services/historyService";

const FAILURE_CONCLUSIONS = ["failure", "cancelled", "timed_out", "startup_failure", "action_required"];

export default function HistoryTable({ runs = [] }) {

    const safeRuns = Array.isArray(runs) ? runs : [];
    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(safeRuns, 15);

    const [expandedId, setExpandedId] = useState(null);
    const [errorsByRun, setErrorsByRun] = useState({});
    const [loadingRunId, setLoadingRunId] = useState(null);

    async function toggleExpanded(run) {

        if (expandedId === run.id) {

            setExpandedId(null);
            return;

        }

        setExpandedId(run.id);

        const isFailed = FAILURE_CONCLUSIONS.includes((run.conclusion || "").toLowerCase());

        if (isFailed && !errorsByRun[run.id]) {

            setLoadingRunId(run.id);

            const errors = await getRunErrors(run.id);

            setErrorsByRun((current) => ({ ...current, [run.id]: errors || [] }));
            setLoadingRunId(null);

        }

    }

    return (

        <div className="card">

            <h2 className="card-title">

                Deployment History

            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Open a run to see exactly why it succeeded or failed.
            </p>

            <div className="table-scroll">

            <table className="table">

                <thead>

                    <tr>

                        <th>Run ID</th>
                        <th>Workflow</th>
                        <th>Branch</th>
                        <th>Status</th>
                        <th>Conclusion</th>
                        <th>Triggered By</th>
                        <th>Created</th>
                        <th></th>

                    </tr>

                </thead>

                <tbody>

                    {pageItems.map((run) => {

                        const isFailed = FAILURE_CONCLUSIONS.includes((run.conclusion || "").toLowerCase());
                        const runErrors = errorsByRun[run.id];
                        const isLoading = loadingRunId === run.id;
                        const expanded = expandedId === run.id;

                        return (

                        <Fragment key={run.id}>

                        <tr
                            className="table-row-clickable"
                            onClick={() => toggleExpanded(run)}
                        >

                            <td>
                                {run.id}
                                <CopyButton value={run.id} label="Copy run ID" />
                            </td>

                            <td>{run.name}</td>

                            <td>{run.branch}</td>

                            <td>

                                <StatusBadge status={run.status} />

                            </td>

                            <td>
                                {run.conclusion
                                    ? <StatusBadge status={run.conclusion} />
                                    : "-"}
                            </td>

                            <td>{run.triggeredBy}</td>

                            <td>

                                {new Date(run.createdAt).toLocaleString()}

                            </td>

                            <td className="num">

                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleExpanded(run);
                                    }}
                                    aria-expanded={expanded}
                                >
                                    {expanded ? "Hide details" : "View details"}
                                    <span className={`smoke-test-chevron ${expanded ? "smoke-test-chevron-open" : ""}`} aria-hidden="true">
                                        &#9662;
                                    </span>
                                </button>

                            </td>

                        </tr>

                        {expanded && (

                            <tr className="table-row-details">

                                <td colSpan={8}>

                                    <div className="info-row">
                                        <span>Commit message</span>
                                        <strong>{run.commitMessage || "Not available"}</strong>
                                    </div>

                                    {isFailed ? (

                                        isLoading ? (

                                            <p className="empty-state">Loading error details...</p>

                                        ) : !runErrors || runErrors.length === 0 ? (

                                            <p className="error-message">
                                                This run {run.conclusion === "cancelled" ? "was cancelled" : "failed"},
                                                but GitHub didn't return a detailed error message for any job in it.
                                                That usually means the failure happened before the job's own steps ran
                                                (for example GitHub's runners being temporarily unavailable) rather
                                                than a step in the pipeline itself failing. Open the run on GitHub for
                                                the full log.
                                            </p>

                                        ) : (

                                            <>

                                            <p className="empty-state" style={{ textAlign: "left", padding: "10px 0 4px" }}>
                                                {runErrors.length === 1
                                                    ? "1 job in this run didn't succeed:"
                                                    : `${runErrors.length} jobs in this run didn't succeed:`}
                                            </p>

                                            {runErrors.map((jobError, index) => (

                                                <div key={index} className="error-message">

                                                    <strong>
                                                        {jobError.jobName}
                                                        {" "}
                                                        <StatusBadge status={jobError.conclusion} />
                                                    </strong>

                                                    {jobError.failedStep && (

                                                        <p style={{ margin: "6px 0 0" }}>
                                                            It failed on the <strong>"{jobError.failedStep}"</strong> step.
                                                        </p>

                                                    )}

                                                    {jobError.messages && jobError.messages.length > 0 ? (

                                                        <>

                                                        <p style={{ margin: "10px 0 4px" }}>
                                                            What GitHub reported:
                                                        </p>

                                                        <ul style={{ margin: "0", paddingLeft: "18px" }}>

                                                            {jobError.messages.map((message, messageIndex) => (

                                                                <li key={messageIndex}>{message}</li>

                                                            ))}

                                                        </ul>

                                                        </>

                                                    ) : (

                                                        <p style={{ margin: "8px 0 0" }}>
                                                            GitHub didn't attach a detailed error message to this
                                                            step — open it on GitHub below for the full log.
                                                        </p>

                                                    )}

                                                    {jobError.htmlUrl && (

                                                        <a
                                                            href={jobError.htmlUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="token-help-link"
                                                        >
                                                            View this job on GitHub →
                                                        </a>

                                                    )}

                                                </div>

                                            ))}

                                            </>

                                        )

                                    ) : (

                                        <p className="empty-state" style={{ textAlign: "left" }}>
                                            This run completed successfully — every job in it finished without error.
                                        </p>

                                    )}

                                    {run.htmlUrl && (

                                        <a
                                            href={run.htmlUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="token-help-link"
                                        >
                                            View this run on GitHub →
                                        </a>

                                    )}

                                </td>

                            </tr>

                        )}

                        </Fragment>

                        );

                    })}

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

        </div>

    );

}

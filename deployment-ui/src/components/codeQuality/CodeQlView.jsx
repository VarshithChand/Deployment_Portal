import { useEffect, useMemo, useState } from "react";

import { getCodeQlAlerts } from "../../services/githubService";
import LoadingSpinner from "../LoadingSpinner";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";

const SEVERITY_BADGE = {
    error: "badge badge-danger",
    warning: "badge badge-warning",
    note: "badge badge-info"
};

const PAGE_SIZE = 10;

// CodeQL - no dedicated credential of its own, reuses this session's
// already-connected GitHub token (see GitHubApiService.GetCodeQlAlertsAsync)
// the same way Artifacts/Analytics/History already do.
export default function CodeQlView() {

    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    function refresh(force = false) {

        setLoading(true);

        getCodeQlAlerts(force).then((response) => {
            setOverview(response.data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setOverview({ configured: true, error: "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(() => refresh(), []);

    const filtered = useMemo(() => {

        const alerts = overview?.alerts || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed
            ? alerts.filter((a) => a.ruleId.toLowerCase().includes(trimmed) || a.path.toLowerCase().includes(trimmed))
            : alerts;

    }, [overview, search]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    if (loading) {
        return <LoadingSpinner />;
    }

    if (overview?.error) {

        return (
            <div className="card">
                <h2 className="card-title">Code Scanning</h2>
                <p className="empty-state" style={{ textAlign: "left" }}>{overview.error}</p>
            </div>
        );

    }

    const alerts = overview?.alerts || [];

    return (

        <>

            <div className="grid">

                <div className="card dashboard-card">
                    <h2 className="card-title">Errors</h2>
                    <div className="info-row">
                        <span>Open</span>
                        <strong><span className="badge badge-danger">{overview?.errorCount ?? 0}</span></strong>
                    </div>
                </div>

                <div className="card dashboard-card">
                    <h2 className="card-title">Warnings</h2>
                    <div className="info-row">
                        <span>Open</span>
                        <strong><span className="badge badge-warning">{overview?.warningCount ?? 0}</span></strong>
                    </div>
                </div>

                <div className="card dashboard-card">
                    <h2 className="card-title">Notes</h2>
                    <div className="info-row">
                        <span>Open</span>
                        <strong><span className="badge badge-info">{overview?.noteCount ?? 0}</span></strong>
                    </div>
                </div>

            </div>

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>Open Alerts</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => refresh(true)}>Refresh</button>
                </div>

                <SearchBox placeholder="Search by rule or file..." value={search} onChange={setSearch} />

                {alerts.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>
                        No open CodeQL alerts — nice and clean.
                    </p>

                ) : filtered.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No alerts match this search.</p>

                ) : (

                    <>

                    <div className="table-scroll" style={{ marginTop: "12px" }}>

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Severity</th>
                                    <th>Rule</th>
                                    <th>File</th>
                                    <th>Found</th>
                                    <th><span className="visually-hidden">Actions</span></th>
                                </tr>
                            </thead>

                            <tbody>

                                {pageItems.map((alert) => (

                                    <tr key={alert.number}>
                                        <td><span className={SEVERITY_BADGE[alert.severity] || "badge badge-secondary"}>{alert.severity}</span></td>
                                        <td>{alert.ruleId}</td>
                                        <td>{alert.path}{alert.line ? `:${alert.line}` : ""}</td>
                                        <td>{alert.createdAt ? new Date(alert.createdAt).toLocaleDateString() : "—"}</td>
                                        <td>
                                            <a href={alert.htmlUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                                                View &rarr;
                                            </a>
                                        </td>
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

        </>

    );

}

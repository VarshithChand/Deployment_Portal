import { useEffect, useState } from "react";

import usePagination from "../../../hooks/usePagination";
import Pagination from "../../common/Pagination";
import { listAuditLogs } from "../../../services/organizationService";

function formatDateTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

// Read-only, Admin-only (audit_logs.view) display of the persisted
// Postgres-backed audit_logs table (see AuditLogService) - distinct from
// the pre-existing in-memory portal-wide activity feed, this one is
// per-organization and survives a restart. Most recent 200 entries (see
// AuditLogService.ListAsync's own cap), paginated client-side.
export default function AuditLogPanel({ orgId }) {

    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        setLoading(true);

        listAuditLogs(orgId)
            .then((result) => setEntries(result.entries || []))
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));

    }, [orgId]);

    const {
        page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex
    } = usePagination(entries, 10);

    return (

        <div className="settings-subsection">

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : pageItems.length === 0 ? (

                <p className="empty-state">No audit log entries yet.</p>

            ) : (

                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>When</th>
                                <th>Actor</th>
                                <th>Action</th>
                                <th>Target</th>
                                <th>IP Address</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageItems.map((entry) => (
                                <tr key={entry.id}>
                                    <td>{formatDateTime(entry.createdAtUtc)}</td>
                                    <td>{entry.actorUserId}</td>
                                    <td><code>{entry.action}</code></td>
                                    <td>{entry.targetType ? `${entry.targetType}${entry.targetId ? ` (${entry.targetId})` : ""}` : "—"}</td>
                                    <td>{entry.ipAddress || "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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

    );

}

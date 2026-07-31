import Pagination from "../common/Pagination";

// Pulled out of Settings.jsx's "activity-log" view - part of the same
// cognitive-complexity cleanup as CredentialsView/SidebarAccessView.
export default function ActivityLogView({
    logsLoading,
    logs,
    logsPageItems,
    logsPage,
    logsPageCount,
    logsTotalCount,
    logsStartIndex,
    logsEndIndex,
    setLogsPage
}) {

    return (

        <>

        <div className="card">

            <h2 className="card-title">
                Activity Log
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Recent settings changes and backend errors — kept in memory on the
                server, cleared on restart.
            </p>

            {logsLoading ? (

                <p className="field-hint">Loading activity log...</p>

            ) : logs.length === 0 ? (

                <p className="empty-state">No activity recorded yet.</p>

            ) : (

                <div className="table-scroll">

                <table className="table">

                    <thead>
                        <tr>
                            <th>When</th>
                            <th>Level</th>
                            <th>Category</th>
                            <th>Message</th>
                        </tr>
                    </thead>

                    <tbody>

                        {logsPageItems.map((entry, i) => (

                            <tr key={`${entry.timestamp}-${i}`}>
                                <td>{new Date(entry.timestamp).toLocaleString()}</td>
                                <td>
                                    <span className={`badge ${entry.level === "Error" ? "badge-danger" : "badge-info"}`}>
                                        {entry.level}
                                    </span>
                                </td>
                                <td>{entry.category}</td>
                                <td>{entry.message}</td>
                            </tr>

                        ))}

                    </tbody>

                </table>

                </div>

            )}

            {!logsLoading && (

                <Pagination
                    page={logsPage}
                    pageCount={logsPageCount}
                    totalCount={logsTotalCount}
                    startIndex={logsStartIndex}
                    endIndex={logsEndIndex}
                    onPageChange={setLogsPage}
                />

            )}

        </div>

        </>

    );

}

import Pagination from "../common/Pagination";
import CopyButton from "../common/CopyButton";

// Pulled out of PullRequests.jsx's "showHistory" block - its two nested
// loading/empty/table ternaries were what pushed the page's cognitive
// complexity past Sonar's limit.
export default function HistorySection({
    loadingHistory,
    history,
    historyPageItems,
    historyPage,
    historyPageCount,
    historyTotalCount,
    historyStartIndex,
    historyEndIndex,
    setHistoryPage,
    commits,
    commitsPageItems,
    commitsPage,
    commitsPageCount,
    commitsTotalCount,
    commitsStartIndex,
    commitsEndIndex,
    setCommitsPage
}) {

    return (

        <>

        <div className="card">

            <h2 className="card-title">
                Merge &amp; PR History
            </h2>

            {loadingHistory ? (

                <p className="field-hint">Loading history...</p>

            ) : history.length === 0 ? (

                <p className="empty-state">No closed pull requests yet.</p>

            ) : (

                <>

                <div className="table-scroll">

                <table className="table">

                    <thead>
                        <tr>
                            <th>PR</th>
                            <th>Author</th>
                            <th>Branch</th>
                            <th>Outcome</th>
                            <th>When</th>
                        </tr>
                    </thead>

                    <tbody>

                        {historyPageItems.map((pr) => (

                            <tr key={pr.number}>
                                <td><a href={pr.htmlUrl} target="_blank" rel="noreferrer">#{pr.number} {pr.title}</a></td>
                                <td>{pr.author}</td>
                                <td>{pr.headBranch} &rarr; {pr.baseBranch}</td>
                                <td>
                                    <span className={`badge ${pr.mergedAt ? "badge-success" : "badge-secondary"}`}>
                                        {pr.mergedAt ? "merged" : "closed"}
                                    </span>
                                </td>
                                <td>{new Date(pr.mergedAt || pr.createdAt).toLocaleString()}</td>
                            </tr>

                        ))}

                    </tbody>

                </table>

                </div>

                <Pagination
                    page={historyPage}
                    pageCount={historyPageCount}
                    totalCount={historyTotalCount}
                    startIndex={historyStartIndex}
                    endIndex={historyEndIndex}
                    onPageChange={setHistoryPage}
                />

                </>

            )}

        </div>

        <div className="card">

            <h2 className="card-title">
                Recent Commits
            </h2>

            {loadingHistory ? (

                <p className="field-hint">Loading commits...</p>

            ) : commits.length === 0 ? (

                <p className="empty-state">No commits found.</p>

            ) : (

                <>

                <div className="table-scroll">

                <table className="table">

                    <thead>
                        <tr>
                            <th>Commit</th>
                            <th>Author</th>
                            <th>When</th>
                        </tr>
                    </thead>

                    <tbody>

                        {commitsPageItems.map((c) => (

                            <tr key={c.sha}>
                                <td>
                                    <a href={c.htmlUrl} target="_blank" rel="noreferrer">{c.message}</a>
                                    {" "}
                                    <span className="commit-sha">{c.sha.slice(0, 7)}</span>
                                    <CopyButton value={c.sha} label="Copy full commit SHA" />
                                </td>
                                <td>{c.author}</td>
                                <td>{new Date(c.date).toLocaleString()}</td>
                            </tr>

                        ))}

                    </tbody>

                </table>

                </div>

                <Pagination
                    page={commitsPage}
                    pageCount={commitsPageCount}
                    totalCount={commitsTotalCount}
                    startIndex={commitsStartIndex}
                    endIndex={commitsEndIndex}
                    onPageChange={setCommitsPage}
                />

                </>

            )}

        </div>

        </>

    );

}

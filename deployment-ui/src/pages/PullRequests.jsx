import { useEffect, useState } from "react";

import usePolling from "../hooks/usePolling";
import usePagination from "../hooks/usePagination";
import {
    getOpenPullRequests,
    getPullRequestHistory,
    getRecentCommits,
    approvePullRequest,
    mergePullRequest
} from "../services/pullRequestsService";
import useAuth from "../hooks/useAuth";
import useNavigation from "../hooks/useNavigation";
import useToast from "../hooks/useToast";
import useConfirm from "../hooks/useConfirm";
import LoadingSpinner from "../components/LoadingSpinner";
import PageLayout from "../components/layout/PageLayout";
import Pagination from "../components/common/Pagination";
import CopyButton from "../components/common/CopyButton";

export default function PullRequests() {

    const { githubTokenConfigured, tokenOwner, canApproveReleases } = useAuth();
    const { setTab } = useNavigation();
    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [open, setOpen] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actingNumber, setActingNumber] = useState(null);

    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState([]);
    const [commits, setCommits] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    async function load() {

        if (!canApproveReleases) {
            setLoading(false);
            return;
        }

        try {

            const response = await getOpenPullRequests();
            setOpen(Array.isArray(response.data) ? response.data : []);

        }
        catch (err) {

            console.error(err);

        }
        finally {

            setLoading(false);

        }

    }

    // 20s — matches Approvals and the other repo-admin-gated polling pages.
    usePolling(load, 20000);

    useEffect(() => {

        if (canApproveReleases) {
            load();
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canApproveReleases]);

    useEffect(() => {

        if (githubTokenConfigured && tokenOwner && !canApproveReleases) {
            setTab("dashboard");
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [githubTokenConfigured, tokenOwner, canApproveReleases]);

    async function loadHistory() {

        try {

            setLoadingHistory(true);

            const [historyRes, commitsRes] = await Promise.all([
                getPullRequestHistory(),
                getRecentCommits()
            ]);

            setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);
            setCommits(Array.isArray(commitsRes.data) ? commitsRes.data : []);

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to load history.", "error");

        }
        finally {

            setLoadingHistory(false);

        }

    }

    function toggleHistory() {

        const next = !showHistory;
        setShowHistory(next);

        if (next && history.length === 0 && commits.length === 0) {
            loadHistory();
        }

    }

    async function handleApprove(number) {

        try {

            setActingNumber(number);

            await approvePullRequest(number);

            toast.show(`Approved PR #${number}.`, "success");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Failed to approve PR #${number}.`, "error");

        }
        finally {

            setActingNumber(null);

        }

    }

    async function handleMerge(number) {

        if (!(await confirm({
            title: "Merge pull request?",
            message: `Merge PR #${number}? This cannot be undone.`,
            confirmLabel: "Merge"
        }))) {
            return;
        }

        try {

            setActingNumber(number);

            await mergePullRequest(number);

            toast.show(`Merged PR #${number}.`, "success");
            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Failed to merge PR #${number}.`, "error");

        }
        finally {

            setActingNumber(null);

        }

    }

    const resolvingAccess = githubTokenConfigured && !tokenOwner;

    const {
        page: historyPage,
        setPage: setHistoryPage,
        pageCount: historyPageCount,
        pageItems: historyPageItems,
        totalCount: historyTotalCount,
        startIndex: historyStartIndex,
        endIndex: historyEndIndex
    } = usePagination(history, 10);

    const {
        page: commitsPage,
        setPage: setCommitsPage,
        pageCount: commitsPageCount,
        pageItems: commitsPageItems,
        totalCount: commitsTotalCount,
        startIndex: commitsStartIndex,
        endIndex: commitsEndIndex
    } = usePagination(commits, 10);

    if (loading || resolvingAccess || (githubTokenConfigured && !canApproveReleases)) {
        return <LoadingSpinner />;
    }

    return (

        <PageLayout title="Pull Requests">

            {dialog}

            {!githubTokenConfigured ? (

                <div className="card">

                    <h2 className="card-title">Pull Requests</h2>

                    <div className="error-message">
                        A GitHub Personal Access Token is required to view and manage pull
                        requests —{" "}
                        <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>
                            add one in Settings
                        </a>.
                    </div>

                </div>

            ) : (

                <>

                <div className="card">

                    <div className="access-panel-header">

                        <h2 className="card-title">
                            Open Pull Requests
                        </h2>

                        <button type="button" className="btn btn-secondary btn-sm" onClick={toggleHistory}>
                            {showHistory ? "Hide History" : "History"}
                        </button>

                    </div>

                    {open.length === 0 ? (

                        <p className="empty-state">Nothing open right now.</p>

                    ) : (

                        <div className="access-branch-list">

                            {open.map((pr) => (

                                <div className="access-branch-item" key={pr.number}>

                                    <div className="access-branch-header">

                                        <div className="access-user-cell">
                                            {pr.authorAvatarUrl && <img src={pr.authorAvatarUrl} alt="" className="access-user-avatar" />}
                                            <span>
                                                <a href={pr.htmlUrl} target="_blank" rel="noreferrer">
                                                    #{pr.number} {pr.title}
                                                </a>
                                            </span>
                                        </div>

                                        {pr.draft && <span className="badge badge-secondary">Draft</span>}

                                        <span className="access-branch-purpose-preview">
                                            {pr.author} &middot; {pr.headBranch} &rarr; {pr.baseBranch} &middot; {new Date(pr.createdAt).toLocaleDateString()}
                                        </span>

                                        <div className="access-branch-actions">

                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => handleApprove(pr.number)}
                                                disabled={actingNumber === pr.number}
                                            >
                                                Approve
                                            </button>

                                            <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                onClick={() => handleMerge(pr.number)}
                                                disabled={actingNumber === pr.number || pr.draft}
                                            >
                                                {actingNumber === pr.number ? "Working..." : "Merge"}
                                            </button>

                                        </div>

                                    </div>

                                </div>

                            ))}

                        </div>

                    )}

                </div>

                {showHistory && (

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

                )}

                </>

            )}

        </PageLayout>

    );

}

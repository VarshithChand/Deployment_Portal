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
import RequireRepoSelected from "../components/RequireRepoSelected";
import PageLayout from "../components/layout/PageLayout";
import PageAdminAccessButton from "../components/common/PageAdminAccessButton";
import HistorySection from "../components/pullRequests/HistorySection";

export default function PullRequests() {

    const { githubTokenConfigured, githubRepoConfigured, tokenOwner, canApproveReleases } = useAuth();
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

    // See Approvals.jsx's identical effect for why githubRepoConfigured is
    // required too - without a repo picked, canApproveReleases is
    // correctly false but that's "pick a repo" territory, not "no approve
    // rights on this repo".
    useEffect(() => {

        if (githubTokenConfigured && githubRepoConfigured && tokenOwner && !canApproveReleases) {
            setTab("dashboard");
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [githubTokenConfigured, githubRepoConfigured, tokenOwner, canApproveReleases]);

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

    if (loading || resolvingAccess || (githubTokenConfigured && githubRepoConfigured && !canApproveReleases)) {
        return <LoadingSpinner />;
    }

    return (

        <PageLayout title="Pull Requests" actions={<PageAdminAccessButton pageKey="pullRequests" pageLabel="Pull Requests" />}>

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

                <RequireRepoSelected>

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

                    <HistorySection
                        loadingHistory={loadingHistory}
                        history={history}
                        historyPageItems={historyPageItems}
                        historyPage={historyPage}
                        historyPageCount={historyPageCount}
                        historyTotalCount={historyTotalCount}
                        historyStartIndex={historyStartIndex}
                        historyEndIndex={historyEndIndex}
                        setHistoryPage={setHistoryPage}
                        commits={commits}
                        commitsPageItems={commitsPageItems}
                        commitsPage={commitsPage}
                        commitsPageCount={commitsPageCount}
                        commitsTotalCount={commitsTotalCount}
                        commitsStartIndex={commitsStartIndex}
                        commitsEndIndex={commitsEndIndex}
                        setCommitsPage={setCommitsPage}
                    />

                )}

                </>

                </RequireRepoSelected>

            )}

        </PageLayout>

    );

}

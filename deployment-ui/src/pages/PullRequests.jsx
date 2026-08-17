import { useEffect, useState } from "react";

import usePolling from "../hooks/usePolling";
import usePagination from "../hooks/usePagination";
import {
    getOpenPullRequests,
    getPullRequestHistory,
    getRecentCommits,
    approvePullRequest,
    mergePullRequest,
    createIssue,
    getIssueMilestones,
    getIssueProjects,
    getIssueAssignableUsers
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

    const { githubTokenConfigured, githubRepoConfigured, tokenOwner, canApproveReleases, isAdminSession, grantedPages } = useAuth();
    const { setTab } = useNavigation();
    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    // Filing an issue is gated by THIS app's own admin/page-grant system
    // (see AdminGate's pageKey check), not GitHub's native repo permission
    // the way Approve/Merge legitimately are (GitHub itself won't let a
    // review through without repo admin rights, so canApproveReleases is
    // the right signal there) - a separate check so a portal-side grantee
    // isn't bounced away from this page before ever reaching a feature
    // their actual GitHub permissions have nothing to do with.
    const hasPortalPrAuthority = isAdminSession || grantedPages.includes("pullRequests");

    const [open, setOpen] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actingNumber, setActingNumber] = useState(null);

    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState([]);
    const [commits, setCommits] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const [issueTitle, setIssueTitle] = useState("");
    const [issueBody, setIssueBody] = useState("");
    const [issueLabels, setIssueLabels] = useState("");
    const [creatingIssue, setCreatingIssue] = useState(false);

    const [milestones, setMilestones] = useState([]);
    const [projects, setProjects] = useState([]);
    const [assignableUsers, setAssignableUsers] = useState([]);
    const [issueAssignees, setIssueAssignees] = useState(new Set());
    const [issueMilestone, setIssueMilestone] = useState("");
    const [issueProjectId, setIssueProjectId] = useState("");

    function toggleIssueAssignee(login) {

        setIssueAssignees((prev) => {
            const next = new Set(prev);
            if (next.has(login)) {
                next.delete(login);
            } else {
                next.add(login);
            }
            return next;
        });

    }

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
    // rights on this repo". Also lets through anyone with portal-side
    // pullRequests authority even without GitHub-native repo permission -
    // they won't see the Approve/Merge section below (that still requires
    // canApproveReleases, a real GitHub constraint), but they can reach
    // Create Issue, which isn't gated by that at all.
    useEffect(() => {

        if (githubTokenConfigured && githubRepoConfigured && tokenOwner && !canApproveReleases && !hasPortalPrAuthority) {
            setTab("dashboard");
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [githubTokenConfigured, githubRepoConfigured, tokenOwner, canApproveReleases, hasPortalPrAuthority]);

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

    // Loaded once the Create Issue card becomes reachable, same pattern
    // loadHistory() below uses for its own on-demand data.
    useEffect(() => {

        if (!hasPortalPrAuthority || !githubTokenConfigured || !githubRepoConfigured) {
            return;
        }

        (async () => {

            try {

                const [milestonesRes, projectsRes, usersRes] = await Promise.all([
                    getIssueMilestones(),
                    getIssueProjects(),
                    getIssueAssignableUsers()
                ]);

                setMilestones(Array.isArray(milestonesRes.data) ? milestonesRes.data : []);
                setProjects(Array.isArray(projectsRes.data) ? projectsRes.data : []);
                setAssignableUsers(Array.isArray(usersRes.data) ? usersRes.data : []);

            }
            catch (err) {

                console.error(err);

            }

        })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasPortalPrAuthority, githubTokenConfigured, githubRepoConfigured]);

    async function handleCreateIssue(e) {

        e.preventDefault();

        if (!issueTitle.trim()) {
            toast.show("A title is required.", "error");
            return;
        }

        try {

            setCreatingIssue(true);

            const response = await createIssue(
                issueTitle.trim(),
                issueBody.trim(),
                issueLabels.trim(),
                Array.from(issueAssignees).join(","),
                issueMilestone ? Number(issueMilestone) : null,
                issueProjectId || null
            );
            const issue = response.data;

            toast.show(
                <>Created <a href={issue.htmlUrl} target="_blank" rel="noreferrer">issue #{issue.number}</a>.</>,
                "success"
            );

            if (issue.projectWarning) {
                toast.show(issue.projectWarning, "error");
            }

            setIssueTitle("");
            setIssueBody("");
            setIssueLabels("");
            setIssueAssignees(new Set());
            setIssueMilestone("");
            setIssueProjectId("");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to create the issue.", "error");

        }
        finally {

            setCreatingIssue(false);

        }

    }

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

    if (loading || resolvingAccess || (githubTokenConfigured && githubRepoConfigured && !canApproveReleases && !hasPortalPrAuthority)) {
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

                {hasPortalPrAuthority && (

                    <div className="card">

                        <h2 className="card-title">Create Issue</h2>

                        <form onSubmit={handleCreateIssue}>

                            <div className="form-group">
                                <label htmlFor="issue-title">Title</label>
                                <input
                                    id="issue-title"
                                    type="text"
                                    className="form-control"
                                    placeholder="Short summary of the issue"
                                    value={issueTitle}
                                    onChange={(e) => setIssueTitle(e.target.value)}
                                    autoComplete="off"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="issue-body">Description</label>
                                <textarea
                                    id="issue-body"
                                    className="form-control"
                                    rows={4}
                                    placeholder="What's the issue? Steps to reproduce, expected vs. actual, etc."
                                    value={issueBody}
                                    onChange={(e) => setIssueBody(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="issue-labels">Labels (comma-separated, optional)</label>
                                <input
                                    id="issue-labels"
                                    type="text"
                                    className="form-control"
                                    placeholder="bug, high-priority"
                                    value={issueLabels}
                                    onChange={(e) => setIssueLabels(e.target.value)}
                                    autoComplete="off"
                                />
                            </div>

                            {assignableUsers.length > 0 && (

                                <div className="form-group">
                                    <label>Assignees (optional)</label>
                                    <div className="checkbox-list">

                                        {assignableUsers.map((user) => (

                                            <label key={user.login} className="checkbox-list-item">

                                                <input
                                                    type="checkbox"
                                                    checked={issueAssignees.has(user.login)}
                                                    onChange={() => toggleIssueAssignee(user.login)}
                                                />
                                                {" "}
                                                {user.avatarUrl && <img src={user.avatarUrl} alt="" className="access-user-avatar" />}
                                                {" "}
                                                {user.login}

                                            </label>

                                        ))}

                                    </div>
                                </div>

                            )}

                            <div className="form-group">
                                <label htmlFor="issue-milestone">Milestone (optional)</label>
                                <select
                                    id="issue-milestone"
                                    className="form-control"
                                    value={issueMilestone}
                                    onChange={(e) => setIssueMilestone(e.target.value)}
                                >
                                    <option value="">None</option>
                                    {milestones.map((m) => (
                                        <option key={m.number} value={m.number}>{m.title}</option>
                                    ))}
                                </select>
                            </div>

                            {projects.length > 0 && (

                                <div className="form-group">
                                    <label htmlFor="issue-project">Project (optional)</label>
                                    <select
                                        id="issue-project"
                                        className="form-control"
                                        value={issueProjectId}
                                        onChange={(e) => setIssueProjectId(e.target.value)}
                                    >
                                        <option value="">None</option>
                                        {projects.map((p) => (
                                            <option key={p.id} value={p.id}>{p.title}</option>
                                        ))}
                                    </select>
                                </div>

                            )}

                            <button type="submit" className="btn btn-primary" disabled={creatingIssue || !issueTitle.trim()}>
                                {creatingIssue ? "Creating..." : "Create Issue"}
                            </button>

                        </form>

                    </div>

                )}

                {canApproveReleases && (

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

                )}

                </>

                </RequireRepoSelected>

            )}

        </PageLayout>

    );

}

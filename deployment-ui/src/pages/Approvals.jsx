import { useEffect, useState } from "react";

import usePolling from "../hooks/usePolling";
import usePagination from "../hooks/usePagination";
import { getPendingApprovals, submitApprovalDecision, getApprovalHistory } from "../services/approvalsService";
import useAuth from "../hooks/useAuth";
import useNavigation from "../hooks/useNavigation";
import useToast from "../hooks/useToast";
import useConfirm from "../hooks/useConfirm";
import LoadingSpinner from "../components/LoadingSpinner";
import PageLayout from "../components/layout/PageLayout";
import StatusBadge from "../components/StatusBadge";
import Pagination from "../components/common/Pagination";

export default function Approvals() {

    const { githubTokenConfigured, tokenOwner, canApproveReleases } = useAuth();
    const { setTab } = useNavigation();
    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [pending, setPending] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedEnvs, setSelectedEnvs] = useState({});
    const [decidingRunId, setDecidingRunId] = useState(null);

    async function load() {

        if (!canApproveReleases) {
            setLoading(false);
            return;
        }

        try {

            const [pendingRes, historyRes] = await Promise.all([
                getPendingApprovals(),
                getApprovalHistory()
            ]);

            setPending(Array.isArray(pendingRes.data) ? pendingRes.data : []);
            setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);

        }
        catch (err) {

            console.error(err);

        }
        finally {

            setLoading(false);

        }

    }

    // 20s — matches the other polling pages; this endpoint is only ever
    // useful when something is actually waiting, so it doesn't need to be
    // any faster than that.
    usePolling(load, 20000);

    // canApproveReleases resolves asynchronously after mount (it starts
    // false until AuthContext has fetched settings and, if a token is
    // configured, the token owner's repo permissions). Re-run load() the
    // moment it flips instead of waiting for the next 20s poll tick.
    useEffect(() => {

        if (canApproveReleases) {
            load();
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canApproveReleases]);

    // A token without approve rights shouldn't land here at all — the nav
    // tab is already hidden for that case (see TopBar), but this covers a
    // bookmarked/typed URL. Wait until tokenOwner has actually resolved
    // (not just "no token yet") before redirecting, so we don't bounce
    // someone away during the brief window before AuthContext settles.
    useEffect(() => {

        if (githubTokenConfigured && tokenOwner && !canApproveReleases) {
            setTab("dashboard");
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [githubTokenConfigured, tokenOwner, canApproveReleases]);

    function toggleEnv(runId, envId) {

        setSelectedEnvs((prev) => {

            const current = new Set(prev[runId] || []);

            if (current.has(envId)) {
                current.delete(envId);
            }
            else {
                current.add(envId);
            }

            return { ...prev, [runId]: current };

        });

    }

    async function handleDecision(runId, approve) {

        const envIds = Array.from(selectedEnvs[runId] || []);

        if (envIds.length === 0) {
            toast.show("Select at least one environment first.", "error");
            return;
        }

        if (!(await confirm({
            title: approve ? "Approve deployment?" : "Reject deployment?",
            message: `${approve ? "Approve" : "Reject"} deployment to ${envIds.length} environment(s)? This cannot be undone.`,
            confirmLabel: approve ? "Approve" : "Reject",
            danger: !approve
        }))) {
            return;
        }

        try {

            setDecidingRunId(runId);

            await submitApprovalDecision({
                runId,
                environmentIds: envIds,
                approve
            });

            toast.show(`Deployment ${approve ? "approved" : "rejected"}.`, "success");

            setSelectedEnvs((prev) => ({ ...prev, [runId]: new Set() }));

            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to submit decision.", "error");

        }
        finally {

            setDecidingRunId(null);

        }

    }

    // Still resolving whether this token can approve at all (or the
    // redirect-away effect above is about to fire) — show a spinner rather
    // than flashing the "add a token" message at someone who already has one.
    const resolvingAccess = githubTokenConfigured && !tokenOwner;

    // Matches the page size every other artifact/run table in the app uses.
    const {
        page: historyPage,
        setPage: setHistoryPage,
        pageCount: historyPageCount,
        pageItems: historyPageItems,
        totalCount: historyTotalCount,
        startIndex: historyStartIndex,
        endIndex: historyEndIndex
    } = usePagination(history, 10);

    if (loading || resolvingAccess || (githubTokenConfigured && !canApproveReleases)) {
        return <LoadingSpinner />;
    }

    return (

        <PageLayout title="Release Approvals">

            {dialog}

            {!githubTokenConfigured ? (

                <div className="card">

                    <h2 className="card-title">Approvals</h2>

                    <div className="error-message">
                        A GitHub Personal Access Token is required to view and manage release
                        approvals —{" "}
                        <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>
                            add one in Settings
                        </a>.
                    </div>

                </div>

            ) : (

                <>

                <div className="card">

                    <h2 className="card-title">Pending Approvals</h2>

                    <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                        Runs currently paused at a protected environment's required-reviewer gate.
                    </p>

                    {pending.length === 0 ? (

                        <p className="empty-state">Nothing waiting on approval right now.</p>

                    ) : (

                        pending.map((run) => (

                            <div
                                key={run.runId}
                                className="card"
                                style={{ background: "var(--table-row-hover)", marginBottom: "15px" }}
                            >

                                <div className="info-row">
                                    <span>Workflow</span>
                                    <strong>{run.workflowName}</strong>
                                </div>

                                <div className="info-row">
                                    <span>Branch</span>
                                    <strong>{run.branch}</strong>
                                </div>

                                <div className="info-row">
                                    <span>Triggered by</span>
                                    <strong>{run.triggeredBy}</strong>
                                </div>

                                <div className="info-row">
                                    <span>Commit</span>
                                    <strong>{run.commitMessage || "-"}</strong>
                                </div>

                                <div className="checkbox-list" style={{ marginTop: "10px" }}>

                                    {run.environments.map((env) => (

                                        <label key={env.id} className="checkbox-list-item">

                                            <input
                                                type="checkbox"
                                                checked={(selectedEnvs[run.runId] || new Set()).has(env.id)}
                                                onChange={() => toggleEnv(run.runId, env.id)}
                                            />
                                            {" "}
                                            <strong>{env.name}</strong>
                                            {env.reviewers.length > 0 && (
                                                <span className="empty-state"> — reviewers: {env.reviewers.join(", ")}</span>
                                            )}

                                        </label>

                                    ))}

                                </div>

                                <div className="button-row" style={{ marginTop: "15px" }}>

                                    <button
                                        type="button"
                                        className="btn btn-success"
                                        disabled={decidingRunId === run.runId}
                                        onClick={() => handleDecision(run.runId, true)}
                                    >
                                        {decidingRunId === run.runId ? "Submitting..." : "Approve"}
                                    </button>

                                    <button
                                        type="button"
                                        className="btn btn-danger"
                                        disabled={decidingRunId === run.runId}
                                        onClick={() => handleDecision(run.runId, false)}
                                    >
                                        {decidingRunId === run.runId ? "Submitting..." : "Reject"}
                                    </button>

                                </div>

                            </div>

                        ))

                    )}

                </div>

                <div className="card">

                    <h2 className="card-title">Recent Release Outcomes</h2>

                    <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                        GitHub doesn't expose a dedicated approval log for this account tier — this
                        shows the eventual outcome (success, failure, or cancelled) of recent
                        release/deploy runs instead.
                    </p>

                    {history.length === 0 ? (

                        <p className="empty-state">No recent release runs found.</p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Workflow</th>
                                    <th>Branch</th>
                                    <th>Outcome</th>
                                    <th>Triggered by</th>
                                    <th>When</th>
                                </tr>
                            </thead>

                            <tbody>

                                {historyPageItems.map((run) => (

                                    <tr key={run.id}>
                                        <td>{run.name}</td>
                                        <td>{run.branch}</td>
                                        <td><StatusBadge status={run.conclusion} /></td>
                                        <td>{run.triggeredBy}</td>
                                        <td>{new Date(run.createdAt).toLocaleString()}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                    <Pagination
                        page={historyPage}
                        pageCount={historyPageCount}
                        totalCount={historyTotalCount}
                        startIndex={historyStartIndex}
                        endIndex={historyEndIndex}
                        onPageChange={setHistoryPage}
                    />

                </div>

                </>

            )}

        </PageLayout>

    );

}

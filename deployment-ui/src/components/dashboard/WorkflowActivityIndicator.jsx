import { useRef, useState } from "react";

import StatusBadge from "../StatusBadge";

// Coarse "how long ago" - a hover popover doesn't need second-level
// precision, just enough to tell "just kicked off" from "this morning".
function relativeTime(iso) {

    if (!iso) {
        return null;
    }

    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.round(minutes / 60);

    if (hours < 24) return `${hours}h ago`;

    return `${Math.round(hours / 24)}d ago`;

}

function WorkflowActivityItem({ entry }) {

    return (

        <li className="workflow-activity-item">

            <StatusBadge status={entry.conclusion || entry.status} />

            <span className="workflow-activity-item-text">

                <span className="workflow-activity-item-repo">{entry.repoName}</span>
                <span className="workflow-activity-item-workflow">{entry.workflowName}</span>

                {(entry.branch || entry.when) && (
                    <span className="workflow-activity-item-meta">
                        {entry.branch}
                        {entry.branch && entry.when ? " · " : ""}
                        {entry.when}
                    </span>
                )}

            </span>

        </li>

    );

}

function toEntry(repo, run, key) {

    return {
        key,
        repoName: repo.name,
        workflowName: run.name || "Workflow",
        status: run.status,
        conclusion: run.conclusion,
        branch: run.branch,
        when: relativeTime(run.createdAt),
        createdAt: run.createdAt
    };

}

function byRecency(a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
}

// All Repositories' header badge + hover popover — "N workflows running"
// across every repository this token's account can see (not just the
// current page), with a breakdown of what's running right now and what
// finished most recently. Rebuilt from the same `runsByRepo` map
// AllRepositoriesCard already fetches for its per-card status, no separate
// data source.
export default function WorkflowActivityIndicator({ repos, runsByRepo }) {

    const [open, setOpen] = useState(false);
    const closeTimer = useRef(null);

    function show() {

        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
        }

        setOpen(true);

    }

    // A short delay rather than closing immediately - moving the mouse
    // from the trigger into the popover itself briefly leaves the wrapper
    // in between, and closing on that would make the popover unusable.
    function hide() {
        closeTimer.current = setTimeout(() => setOpen(false), 100);
    }

    const checked = repos.filter((repo) => runsByRepo[repo.fullName] !== undefined);

    // Every currently-active run in every checked repo, not just one per
    // repo - a single push commonly triggers several workflow files at
    // once, and more than one can legitimately be running in the same repo
    // simultaneously (e.g. "Smoke Tests" and "Notify Dev Team On Pipeline
    // Failure" both in_progress together). Capping this at one-per-repo
    // undercounted exactly that case.
    const running = checked
        .flatMap((repo) => (runsByRepo[repo.fullName] || [])
            .filter((run) => run.status !== "completed")
            .map((run) => toEntry(repo, run, `${repo.fullName}:${run.id}`)))
        .sort(byRecency);

    // One entry per repo (its most recent FINISHED run) - the popover
    // already scrolls (see .workflow-activity-popover's max-height), but
    // showing all ~10 fetched runs for all ~34 repos would be hundreds of
    // rows; "running" above is the one section that genuinely needs every
    // concurrent run, this one just needs "what happened last" per repo.
    const latest = checked
        .map((repo) => {
            const run = (runsByRepo[repo.fullName] || []).find((r) => r.status === "completed");
            return run ? toEntry(repo, run, repo.fullName) : null;
        })
        .filter(Boolean)
        .sort(byRecency);

    const count = running.length;
    const stillChecking = repos.length - checked.length;

    return (

        <div
            className="workflow-activity-wrap"
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        >

            <button
                type="button"
                className={`workflow-activity-trigger ${count > 0 ? "workflow-activity-trigger-active" : ""}`}
                aria-haspopup="true"
                aria-expanded={open}
            >
                {count} {count === 1 ? "workflow" : "workflows"} running
            </button>

            {open && (

                <div className="workflow-activity-popover" role="region" aria-label="Workflow activity">

                    <p className="workflow-activity-title">Workflow Activity</p>

                    {stillChecking > 0 && (
                        <p className="field-hint" style={{ margin: "0 0 8px" }}>
                            Checking {stillChecking} more repositor{stillChecking === 1 ? "y" : "ies"}...
                        </p>
                    )}

                    <p className="workflow-activity-section-title">Running</p>

                    {running.length === 0 ? (

                        <p className="workflow-activity-empty">Nothing running right now.</p>

                    ) : (

                        <ul className="workflow-activity-list">
                            {running.map((entry) => <WorkflowActivityItem key={entry.key} entry={entry} />)}
                        </ul>

                    )}

                    <p className="workflow-activity-section-title">Latest Runs</p>

                    {latest.length === 0 ? (

                        <p className="workflow-activity-empty">No recent runs yet.</p>

                    ) : (

                        <ul className="workflow-activity-list">
                            {latest.map((entry) => <WorkflowActivityItem key={entry.key} entry={entry} />)}
                        </ul>

                    )}

                </div>

            )}

        </div>

    );

}

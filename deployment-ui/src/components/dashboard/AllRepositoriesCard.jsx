import { useEffect, useState } from "react";

import { getAccountRepositories, getRepoRunsBulk } from "../../services/githubService";
import { saveMyGitHubSettings } from "../../services/settingsService";
import useAuth from "../../hooks/useAuth";
import useToast from "../../hooks/useToast";
import usePagination from "../../hooks/usePagination";
import usePolling from "../../hooks/usePolling";
import SearchBox from "../common/SearchBox";
import Pagination from "../common/Pagination";
import ConfirmDialog from "../ConfirmDialog";
import StatusBadge from "../StatusBadge";
import WorkflowActivityIndicator from "./WorkflowActivityIndicator";

const PAGE_SIZE = 6;

// Every repo gets checked now (the header's running-workflow count needs
// the whole account, not just the page on screen), so this interval is
// wider than the old per-page 20s - 34 repos every 20s would multiply into
// thousands of GitHub calls/hour on its own. The backend's own 20s cache
// per repo (see GitHubApiService.GetCachedAsync) means switching pages or
// searching between polls never adds extra calls either way.
const RUN_POLL_MS = 60000;

// A plain rounded rectangle with a spine down the left edge — same glyph
// SwitchRepositoryModal uses, kept in sync so the two repo pickers read as
// the same feature rather than two different ones.
function RepoIcon() {

    return (

        <svg className="repo-picker-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>

    );

}

// runs is undefined while still loading, an empty array once checked with
// nothing found, or a list of recent WorkflowDtos (most recent first) once
// runs exist — three distinct states, three distinct renders. Only the
// first (most recent) run shows here; a single per-card badge can only
// ever show one status, so this stays "the latest run," same as before -
// it's WorkflowActivityIndicator's running COUNT that now looks at every
// run in the list, not just this one.
function RepoRunStatus({ runs }) {

    if (runs === undefined) {
        return <p className="field-hint" style={{ margin: "8px 0 0" }}>Checking pipeline...</p>;
    }

    if (runs.length === 0) {
        return <p className="field-hint" style={{ margin: "8px 0 0" }}>No recent runs</p>;
    }

    const run = runs[0];

    return (

        <div className="repo-picker-meta" style={{ marginTop: "8px" }}>
            <StatusBadge status={run.conclusion || run.status} />
            <span className="field-hint" style={{ margin: 0 }}>{run.name}</span>
        </div>

    );

}

// Dashboard's persistent view of every repository this token's account can
// see — not just the one repo this session is currently pointed at. Reuses
// SwitchRepositoryModal's repo-picker CSS and its saveMyGitHubSettings +
// reload switch pattern, but lives on the page itself instead of behind a
// modal, and additionally shows each visible repo's latest workflow run so
// a pipeline running on a repo you're not looking at doesn't go unnoticed.
export default function AllRepositoriesCard({ repository }) {

    const { githubRepoConfigured } = useAuth();
    const toast = useToast();

    const [repos, setRepos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [runsByRepo, setRunsByRepo] = useState({});

    const [target, setTarget] = useState(null);
    const [switching, setSwitching] = useState(false);

    // Shared by the initial repo load (fire the moment the list is known,
    // rather than waiting for the next polling tick) and the recurring
    // usePolling below - one fetch path, not two. One batched request for
    // every repo instead of one request per repo (see getRepoRunsBulk) -
    // an account with 30 repos used to fire 30 parallel XHRs here on every
    // poll tick; this collapses that to one.
    function fetchRunsFor(repoList) {

        if (!githubRepoConfigured || repoList.length === 0) {
            return;
        }

        getRepoRunsBulk(repoList.map((repo) => ({ owner: repo.owner, repo: repo.name })))
            .then((response) => {
                setRunsByRepo((prev) => ({ ...prev, ...(response.data || {}) }));
            })
            .catch(() => {
                // Leave whatever runs are already showing rather than
                // wiping every card out on one failed poll.
            });

    }

    useEffect(() => {

        if (!githubRepoConfigured) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        getAccountRepositories()
            .then((response) => {

                if (!cancelled) {

                    const list = Array.isArray(response.data) ? response.data : [];

                    setRepos(list);
                    fetchRunsFor(list);

                }

            })
            .catch((err) => {

                console.error(err);

                if (!cancelled) {
                    setError("Unable to load repositories for this token's account.");
                }

            })
            .finally(() => {

                if (!cancelled) {
                    setLoading(false);
                }

            });

        return () => {
            cancelled = true;
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [githubRepoConfigured]);

    const filtered = repos.filter((repo) =>
        repo.fullName.toLowerCase().includes(search.toLowerCase())
    );

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(filtered, PAGE_SIZE);

    useEffect(() => {

        setPage(1);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    // Every repo the token can see, not just the current page - the header
    // running-workflow count needs the whole account. usePolling always
    // calls the freshest closure (see its own comment), so this keeps
    // seeing the latest `repos` even though the interval itself is set up
    // once on mount.
    usePolling(() => fetchRunsFor(repos), RUN_POLL_MS);

    const currentFullName = repository?.full_name
        || (repository?.owner?.login && repository?.name ? `${repository.owner.login}/${repository.name}` : null);

    async function handleConfirmSwitch() {

        if (!target) {
            return;
        }

        try {

            setSwitching(true);

            await saveMyGitHubSettings({
                owner: target.owner,
                repository: target.name,
                personalAccessToken: null
            });

            toast.show(`Switched to ${target.fullName}.`, "success");

            // Same reason SwitchRepositoryModal reloads: every page that
            // already fetched data for the old repo has no way to know a
            // different one is now configured, short of refetching
            // everything itself.
            setTimeout(() => window.location.reload(), 900);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to switch repository.", "error");
            setSwitching(false);
            setTarget(null);

        }

    }

    if (!githubRepoConfigured) {
        return null;
    }

    return (

        <div className="card">

            <div className="repo-picker-header" style={{ marginBottom: "12px" }}>

                <div>
                    <h2 className="card-title" style={{ marginBottom: "4px" }}>All Repositories</h2>
                    <p className="field-hint" style={{ margin: 0 }}>
                        Every repository this token's account can see. Click one to switch to it.
                    </p>
                </div>

                {!loading && !error && (

                    <div className="repo-picker-header-badges">

                        <span className="repo-picker-count">
                            {totalCount} {totalCount === 1 ? "repository" : "repositories"}
                        </span>

                        <WorkflowActivityIndicator repos={repos} runsByRepo={runsByRepo} />

                    </div>

                )}

            </div>

            <SearchBox
                placeholder="Search repositories..."
                value={search}
                onChange={setSearch}
            />

            <div className="repo-picker-grid">

                {/* min-height approximates a loaded grid's typical size - the
                    loading text alone is a single line, while the loaded
                    grid can be several rows tall, so without this the page
                    below jumps up as soon as repositories arrive (CLS). */}
                {loading && (
                    <p className="field-hint" style={{ minHeight: "96px" }}>Loading repositories...</p>
                )}

                {!loading && error && (
                    <div className="error-message">{error}</div>
                )}

                {!loading && !error && filtered.length === 0 && (
                    <p className="empty-state">No repositories match "{search}".</p>
                )}

                {!loading && !error && pageItems.map((repo) => {

                    const isCurrent = repo.fullName === currentFullName;

                    return (

                        <button
                            type="button"
                            key={repo.fullName}
                            className={`repo-picker-card ${isCurrent ? "repo-picker-card-current" : ""}`}
                            disabled={isCurrent}
                            onClick={() => setTarget(repo)}
                        >

                            <div className="repo-picker-title">
                                <RepoIcon />
                                <span className="repo-picker-name">
                                    <span className="repo-picker-owner">{repo.owner}/</span>
                                    {repo.name}
                                </span>
                            </div>

                            <div className="repo-picker-meta">

                                <span className={`badge ${repo.private ? "badge-secondary" : "badge-info"}`}>
                                    {repo.private ? "Private" : "Public"}
                                </span>

                                {isCurrent && (
                                    <span className="badge badge-success">Current</span>
                                )}

                            </div>

                            <RepoRunStatus runs={runsByRepo[repo.fullName]} />

                        </button>

                    );

                })}

            </div>

            {!loading && !error && (

                <Pagination
                    page={page}
                    pageCount={pageCount}
                    totalCount={totalCount}
                    startIndex={startIndex}
                    endIndex={endIndex}
                    onPageChange={setPage}
                />

            )}

            <ConfirmDialog

                open={!!target}
                title="Switch repository?"
                confirmLabel={switching ? "Switching..." : "Switch"}
                message={
                    target && (
                        <>
                            From <strong>{currentFullName || "(no repository configured)"}</strong>
                            {" "}to <strong>{target.fullName}</strong>.
                            {" "}This changes the repository you point at.
                        </>
                    )
                }
                onConfirm={handleConfirmSwitch}
                onCancel={() => !switching && setTarget(null)}

            />

        </div>

    );

}

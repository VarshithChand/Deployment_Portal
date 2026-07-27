import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { getAccountRepositories } from "../../services/githubService";
import { saveMyGitHubSettings } from "../../services/settingsService";

import SearchBox from "../common/SearchBox";
import ConfirmDialog from "../ConfirmDialog";
import Pagination from "../common/Pagination";
import useToast from "../../hooks/useToast";
import usePagination from "../../hooks/usePagination";

const PAGE_SIZE = 9;

// A plain rounded rectangle with a spine down the left edge — reads as a
// "repository" glyph without risking a hand-authored multi-curve path.
function RepoIcon() {

    return (

        <svg className="repo-picker-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>

    );

}

export default function SwitchRepositoryModal({

    open,
    currentOwner,
    currentRepository,
    onClose

}) {

    const toast = useToast();

    const [repos, setRepos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");

    const [target, setTarget] = useState(null);
    const [switching, setSwitching] = useState(false);

    useEffect(() => {

        if (!open) {
            return;
        }

        let cancelled = false;

        setLoading(true);
        setError("");

        getAccountRepositories()
            .then((response) => {

                if (!cancelled) {
                    setRepos(Array.isArray(response.data) ? response.data : []);
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

    }, [open]);

    // Reset search/target each time the modal is reopened, so it doesn't
    // reappear showing whatever was left over from the last time it was used.
    useEffect(() => {

        if (open) {
            setSearch("");
            setTarget(null);
        }

    }, [open]);

    const filtered = repos.filter((repo) =>
        repo.fullName.toLowerCase().includes(search.toLowerCase())
    );

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(filtered, PAGE_SIZE);

    // A new search result set can leave `page` pointing past its own end
    // (usePagination only snaps back on the array reference it was given,
    // and `filtered` is a new array every render) — reset explicitly instead.
    useEffect(() => {

        setPage(1);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    if (!open) {
        return null;
    }

    const currentFullName = currentOwner && currentRepository
        ? `${currentOwner}/${currentRepository}`
        : null;

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

            // Same reason Settings.jsx does a full reload after saving: every
            // page that already fetched data for the old repo has no way to
            // know a different one is now configured, short of refetching
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

    // Portalled to document.body: this modal is triggered from inside a
    // .card, and .card:hover applies a transform — which turns the card into
    // a new containing block for any position:fixed descendant, trapping the
    // backdrop inside the card's box instead of covering the viewport.
    return createPortal(

        <>

        <div className="dialog-backdrop" onClick={onClose}>

            <div className="dialog dialog-wide" onClick={(e) => e.stopPropagation()}>

                <div className="repo-picker-header">

                    <div>
                        <h2>Switch Repository</h2>
                        <p className="field-hint">
                            Choose a repository this token's account can see. The portal
                            will switch to it and reload.
                        </p>
                    </div>

                    {!loading && !error && (
                        <span className="repo-picker-count">
                            {totalCount} {totalCount === 1 ? "repository" : "repositories"}
                        </span>
                    )}

                </div>

                <SearchBox
                    placeholder="Search repositories..."
                    value={search}
                    onChange={setSearch}
                />

                <div className="repo-picker-grid">

                    {loading && (
                        <p className="field-hint">Loading repositories...</p>
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

                <div>
                    <button className="btn" onClick={onClose}>Close</button>
                </div>

            </div>

        </div>

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

        </>,

        document.body

    );

}

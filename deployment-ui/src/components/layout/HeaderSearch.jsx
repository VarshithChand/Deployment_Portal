import { useMemo, useRef, useState } from "react";

import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import parseRepoUrl from "../../utils/parseRepoUrl";
import isValidGitHubUsername from "../../utils/githubUsername";
import { TABS, GATED_TABS, ADMIN_ONLY_TABS } from "./Sidebar";
import { VIEWS, VIEW_TITLES, ADMIN_ONLY_VIEWS } from "../../constants/settingsViews";

function SearchIcon() {

    return (

        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="1.6" />
            <line x1="13" y1="13" x2="17.5" y2="17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>

    );

}

function RepoIcon() {

    return (

        <svg className="header-search-result-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>

    );

}

// Settings' sub-pages, searchable the same way top-level tabs are — "hub"
// isn't its own destination (the top-level "Settings" result already
// covers it), everything else here mirrors Settings.jsx's own VIEW_TITLES/
// ADMIN_ONLY_VIEWS so the two never drift apart.
const SETTINGS_SEARCH_VIEWS = VIEWS.filter((v) => v !== "hub");

// Universal header search — application pages/sub-pages (navigates
// directly), plus a GitHub repo-URL or username lookup (navigates to
// Settings > Credentials, which already knows how to preview either — see
// GitHubAccessSection/Settings.jsx). Reuses the exact same page list
// Sidebar renders and the exact same lookup Settings' Repository URL field
// already does, rather than maintaining a second copy of either.
export default function HeaderSearch() {

    const { user, canApproveReleases, isAdminSession, oauthStatusChecked } = useAuth();
    const { setTab, sidebarAccess, goToSettingsView, goToSettingsWithRepo } = useNavigation();

    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(0);
    const inputRef = useRef(null);
    const closeTimer = useRef(null);

    // Matches Sidebar's own ADMIN_ONLY_TABS check exactly (isAdminSession
    // alone). Settings' ADMIN_ONLY_VIEWS check is broader - a real OAuth
    // admin login (user.role) counts too, not just the PAT-allowlist path -
    // so that one's computed separately below to stay in sync with
    // Settings.jsx's own `isAdmin`, rather than reusing this narrower one.
    const isAdmin = isAdminSession;
    const isSettingsAdmin = user?.role === "Admin" || isAdminSession;

    const pageResults = useMemo(() => {

        const trimmed = query.trim().toLowerCase();

        if (!trimmed) {
            return [];
        }

        const tabResults = TABS
            .filter((t) => !GATED_TABS.has(t.key) || canApproveReleases)
            .filter((t) => !ADMIN_ONLY_TABS.has(t.key) || isAdmin)
            .filter((t) => sidebarAccess[t.key] !== "hidden" && sidebarAccess[t.key] !== "locked")
            .filter((t) => t.label.toLowerCase().includes(trimmed))
            .map((t) => ({
                type: "tab",
                key: `tab:${t.key}`,
                label: t.label,
                hint: "Page",
                action: () => setTab(t.key)
            }));

        // Settings sub-pages aren't gated behind oauthStatusChecked the way
        // Settings.jsx's own admin bounce-back is - showing one in search
        // before that resolves just means an admin-only result briefly
        // exists that Settings would immediately bounce back to hub anyway.
        const settingsResults = SETTINGS_SEARCH_VIEWS
            .filter((v) => !ADMIN_ONLY_VIEWS.has(v) || (oauthStatusChecked && isSettingsAdmin))
            .filter((v) => (VIEW_TITLES[v] || v).toLowerCase().includes(trimmed))
            .map((v) => ({
                type: "settings-view",
                key: `view:${v}`,
                label: VIEW_TITLES[v] || v,
                hint: "Settings",
                action: () => goToSettingsView(v)
            }));

        return [...tabResults, ...settingsResults].slice(0, 8);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, canApproveReleases, isAdmin, isSettingsAdmin, oauthStatusChecked, sidebarAccess]);

    const githubResult = useMemo(() => {

        const trimmed = query.trim();

        if (!trimmed) {
            return null;
        }

        const parsed = parseRepoUrl(trimmed);

        if (parsed) {

            return {
                type: "github-repo",
                key: "github:repo",
                label: `${parsed.owner}/${parsed.repository}`,
                hint: "Look up repository",
                action: () => goToSettingsWithRepo(trimmed)
            };

        }

        if (isValidGitHubUsername(trimmed)) {

            return {
                type: "github-user",
                key: "github:user",
                label: trimmed,
                hint: "Look up GitHub user",
                action: () => goToSettingsWithRepo(trimmed)
            };

        }

        return null;

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const results = githubResult ? [...pageResults, githubResult] : pageResults;

    function activate(result) {

        if (!result) {
            return;
        }

        result.action();
        setQuery("");
        setOpen(false);
        inputRef.current?.blur();

    }

    function show() {

        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
        }

        setOpen(true);

    }

    // A short delay, not an immediate close, so a click on a result (which
    // blurs the input first) isn't lost to the dropdown disappearing before
    // the click's own handler fires.
    function hide() {
        closeTimer.current = setTimeout(() => setOpen(false), 150);
    }

    function handleKeyDown(e) {

        if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
            return;
        }

        if (!open || results.length === 0) {
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((i) => (i + 1) % results.length);
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((i) => (i - 1 + results.length) % results.length);
        }
        else if (e.key === "Enter") {
            e.preventDefault();
            activate(results[highlighted] || results[0]);
        }

    }

    return (

        <div
            className="header-search-wrap"
            onFocus={show}
            onBlur={hide}
        >

            <div className="header-search-input-row">

                <SearchIcon />

                <input
                    ref={inputRef}
                    type="text"
                    className="header-search-input"
                    placeholder="Search pages, a repo URL, or a GitHub username..."
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setHighlighted(0); setOpen(true); }}
                    onKeyDown={handleKeyDown}
                    aria-expanded={open && results.length > 0}
                    aria-haspopup="listbox"
                    role="combobox"
                    aria-autocomplete="list"
                />

            </div>

            {open && query.trim() && (

                <div className="header-search-dropdown" role="listbox">

                    {results.length === 0 ? (

                        <p className="header-search-empty">No matches for "{query.trim()}".</p>

                    ) : (

                        <>

                        {pageResults.length > 0 && (

                            <>
                                <p className="header-search-group-label">Pages</p>
                                {pageResults.map((result) => (

                                    <button
                                        type="button"
                                        key={result.key}
                                        role="option"
                                        aria-selected={results[highlighted]?.key === result.key}
                                        className={`header-search-result ${results[highlighted]?.key === result.key ? "header-search-result-active" : ""}`}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => activate(result)}
                                    >
                                        <span className="header-search-result-label">{result.label}</span>
                                        <span className="header-search-result-hint">{result.hint}</span>
                                    </button>

                                ))}
                            </>

                        )}

                        {githubResult && (

                            <>
                                <p className="header-search-group-label">GitHub</p>
                                <button
                                    type="button"
                                    key={githubResult.key}
                                    role="option"
                                    aria-selected={results[highlighted]?.key === githubResult.key}
                                    className={`header-search-result ${results[highlighted]?.key === githubResult.key ? "header-search-result-active" : ""}`}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => activate(githubResult)}
                                >
                                    <RepoIcon />
                                    <span className="header-search-result-label">{githubResult.label}</span>
                                    <span className="header-search-result-hint">{githubResult.hint}</span>
                                </button>
                            </>

                        )}

                        </>

                    )}

                </div>

            )}

        </div>

    );

}

import { useEffect, useState } from "react";

import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import usePolling from "../../hooks/usePolling";
import Logo from "../common/Logo";
import AccountAvatar from "../common/AccountAvatar";
import ActivityBell from "./ActivityBell";
import { getRateLimit } from "../../services/githubService";
import { getPullRequestCount } from "../../services/pullRequestsService";
import { getMyGitHubSettings } from "../../services/settingsService";

// A plain three-bar glyph, same stroke style as Sidebar's ChevronIcon —
// only ever shown below the 768px breakpoint (see global.css), where
// Sidebar becomes an off-canvas drawer instead of a persistent rail.
function MenuIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <line x1="3" y1="5.5" x2="17" y2="5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="3" y1="14.5" x2="17" y2="14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

// The slim top strip: brand mark on the left, account/rate-limit controls
// on the right. Primary navigation and the theme toggle both live in
// Sidebar — on tablet/desktop it's a persistent rail with no need for a
// hamburger; below 768px it becomes an off-canvas drawer that this bar's
// menu button opens (mobile-nav-toggle is hidden via CSS at wider widths).
export default function TopBar() {

    const { user, loading, login, logout, oauthConfigured, tokenOwner, canApproveReleases, isAdminSession } = useAuth();
    const { setTab, mobileNavOpen, setMobileNavOpen } = useNavigation();

    const [rateLimit, setRateLimit] = useState(null);
    const [prCount, setPrCount] = useState(0);
    const [repoName, setRepoName] = useState("");

    // Re-fetches when the logged-in user changes — each caller (a real
    // login, or an anonymous per-browser session — see PortalIdentity) has
    // their own configured repo now, so this can't be a one-time fetch on
    // mount the way it was back when the whole portal shared a single repo.
    useEffect(() => {

        getMyGitHubSettings()
            .then((settings) => {
                setRepoName(
                    settings.gitHubOwner && settings.gitHubRepository
                        ? `${settings.gitHubOwner}/${settings.gitHubRepository}`
                        : ""
                );
            })
            .catch((err) => console.error(err));

    }, [user]);

    async function loadRateLimit() {

        try {

            const response = await getRateLimit();
            setRateLimit(response.data);

        }
        catch (err) {

            console.error(err);

        }

    }

    // Checking /rate_limit doesn't itself consume any quota, so polling it
    // is free — this is what lets "Public view" show a live remaining count.
    // usePolling fires once immediately on mount, then on the interval.
    usePolling(loadRateLimit, 30000);

    async function loadPullRequestCount() {

        if (!canApproveReleases) return;

        try {

            const response = await getPullRequestCount();
            setPrCount(response.data?.count || 0);

        }
        catch (err) {

            console.error(err);

        }

    }

    usePolling(loadPullRequestCount, 30000);

    return (

        <header className="top-bar">

            <button
                type="button"
                className="mobile-nav-toggle"
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
                aria-expanded={mobileNavOpen}
                title={mobileNavOpen ? "Close navigation" : "Open navigation"}
            >
                <MenuIcon />
            </button>

            <button
                type="button"
                className="top-bar-brand top-bar-brand-link"
                onClick={() => setTab("dashboard")}
                title="Go to Dashboard"
            >
                <Logo showEyebrow={false} size={32} />
            </button>

            <div className="top-bar-actions">

                {repoName && (

                    <span className="repo-name-badge" title="Configured repository">
                        {repoName}
                    </span>

                )}

                <ActivityBell />

                {canApproveReleases && prCount > 0 && (

                    <button
                        type="button"
                        className="pr-notification-badge"
                        onClick={() => setTab("pullRequests")}
                        title={`${prCount} open pull request${prCount === 1 ? "" : "s"} waiting`}
                    >
                        {prCount} PR{prCount === 1 ? "" : "s"}
                    </button>

                )}

                {!loading && (

                    user ? (

                        <div className="user-badge">

                            <button
                                type="button"
                                className="account-menu-trigger"
                                onClick={() => setTab("settings")}
                                title={`${user.login} — go to Settings`}
                            >
                                <AccountAvatar name={user.login} size={26} />

                                <span className={`badge ${user.role === "Admin" ? "badge-success" : "badge-secondary"}`}>
                                    {user.role}
                                </span>
                            </button>

                            <button type="button" className="theme-toggle" onClick={logout}>
                                Logout
                            </button>

                        </div>

                    ) : oauthConfigured ? (

                        <button type="button" className="theme-toggle" onClick={login}>
                            Login with GitHub
                        </button>

                    ) : (

                        <div className="user-badge">

                            <span className="badge badge-secondary">
                                Public view
                            </span>

                            {rateLimit && (
                                <span
                                    className={`badge ${rateLimit.remaining <= 10 ? "badge-danger" : "badge-info"}`}
                                    title={`GitHub API requests remaining this hour — resets at ${new Date(rateLimit.resetAt).toLocaleTimeString()}`}
                                >
                                    {rateLimit.remaining}/{rateLimit.limit}
                                </span>
                            )}

                            {tokenOwner?.configured ? (

                                <button
                                    type="button"
                                    className="account-menu-trigger"
                                    title={`${tokenOwner.login} — Personal Access Token owner, click to go to Settings`}
                                    onClick={() => setTab("settings")}
                                >
                                    <AccountAvatar avatarUrl={tokenOwner.avatarUrl} name={tokenOwner.login} size={26} />

                                    {isAdminSession && (
                                        <span className="badge badge-success">Admin</span>
                                    )}
                                </button>

                            ) : (

                                <button type="button" className="theme-toggle" onClick={() => setTab("settings")}>
                                    Set up GitHub Login
                                </button>

                            )}

                        </div>

                    )

                )}

            </div>

        </header>

    );

}

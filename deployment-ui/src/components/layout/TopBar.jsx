import { useState } from "react";

import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import usePolling from "../../hooks/usePolling";
import Logo from "../common/Logo";
import AccountAvatar from "../common/AccountAvatar";
import ActivityBell from "./ActivityBell";
import TopBarPublicBadge from "./TopBarPublicBadge";
import HeaderSearch from "./HeaderSearch";
import { getRateLimit } from "../../services/githubService";
import { getPullRequestCount } from "../../services/pullRequestsService";
import { setPortalLocked } from "../../utils/portalLock";

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

// A plain padlock — filled body, shackle as an open arc so it reads as
// "lock" without needing a second closed-vs-open variant.
function LockIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="4.5" y="9" width="11" height="8" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7 9V6.5a3 3 0 0 1 6 0V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}

// The slim top strip: brand mark on the left, account/rate-limit controls
// on the right. Primary navigation and the theme toggle both live in
// Sidebar — on tablet/desktop it's a persistent rail with no need for a
// hamburger; below 768px it becomes an off-canvas drawer that this bar's
// menu button opens (mobile-nav-toggle is hidden via CSS at wider widths).
export default function TopBar() {

    const {
        user, loading, login, logout, oauthConfigured, tokenOwner,
        canApproveReleases, isAdminSession, awsIdentityLabel, pinConfigured,
        githubOwner, githubRepository
    } = useAuth();
    const { setTab, mobileNavOpen, setMobileNavOpen } = useNavigation();

    const [rateLimit, setRateLimit] = useState(null);
    const [prCount, setPrCount] = useState(0);

    // Straight off the same bootstrap fetch AuthContext already makes on
    // mount - this used to be TopBar's own separate GET
    // /api/settings/me/github, re-fetched every time `user` changed.
    const repoName = githubOwner && githubRepository ? `${githubOwner}/${githubRepository}` : "";

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

    // A reload (not just flipping in-memory state) is deliberate — it's
    // the same "set a flag, then reload" pattern the rest of the app
    // already uses for a repo switch/settings save, and it's what lets
    // PeriodicSignOutMonitor's own locked-state-from-localStorage init (see
    // utils/portalLock) pick this up immediately as it remounts, without
    // needing a second, separate way to signal "lock" into that component.
    function handleLockNow() {
        setPortalLocked();
        window.location.reload();
    }

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

            <HeaderSearch />

            <div className="top-bar-actions">

                {repoName && (

                    <span className="repo-name-badge" title="Configured repository">
                        {repoName}
                    </span>

                )}

                {awsIdentityLabel && (

                    <span className="cloud-user-badge" title="Signed in as, for this session's saved AWS credentials">
                        <span className="cloud-user-badge-provider">AWS</span>
                        {awsIdentityLabel}
                    </span>

                )}

                {pinConfigured && (

                    <button
                        type="button"
                        className="lock-portal-btn"
                        onClick={handleLockNow}
                        title="Lock the portal — your PIN will be required to continue"
                        aria-label="Lock the portal"
                    >
                        <LockIcon />
                    </button>

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

                        <TopBarPublicBadge
                            rateLimit={rateLimit}
                            tokenOwner={tokenOwner}
                            isAdminSession={isAdminSession}
                            setTab={setTab}
                        />

                    )

                )}

            </div>

        </header>

    );

}

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

// The slim top strip: brand mark on the left, account/rate-limit controls
// on the right. Primary navigation and the theme toggle both live in
// Sidebar now — this bar only ever holds a handful of controls, so it
// doesn't need its own collapse/hamburger behavior, just normal flex-wrap.
export default function TopBar() {

    const { user, loading, login, logout, oauthConfigured, tokenOwner, canApproveReleases } = useAuth();
    const { setTab } = useNavigation();

    const [rateLimit, setRateLimit] = useState(null);
    const [prCount, setPrCount] = useState(0);
    const [repoName, setRepoName] = useState("");

    // Re-fetches when the logged-in user changes — each user has their own
    // configured repo now, so this can't be a one-time fetch on mount the
    // way it was back when the whole portal shared a single repo. Skipped
    // entirely while logged out, since an anonymous caller has no "own"
    // repo to show (the request would just 401).
    useEffect(() => {

        if (!user) {
            setRepoName("");
            return;
        }

        getMyGitHubSettings()
            .then((settings) => {
                if (settings.gitHubOwner && settings.gitHubRepository) {
                    setRepoName(`${settings.gitHubOwner}/${settings.gitHubRepository}`);
                }
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

                            <button className="theme-toggle" onClick={logout}>
                                Logout
                            </button>

                        </div>

                    ) : oauthConfigured ? (

                        <button className="theme-toggle" onClick={login}>
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
                                </button>

                            ) : (

                                <button className="theme-toggle" onClick={() => setTab("settings")}>
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

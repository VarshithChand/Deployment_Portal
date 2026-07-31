import AccountAvatar from "../common/AccountAvatar";

// Pulled out of TopBar's "no OAuth login" branch (rate limit badge + PAT
// owner/admin badge) so its own nested conditionals stop counting toward
// TopBar's cognitive complexity — TopBar itself just decides which of its
// three top-level states to render.
export default function TopBarPublicBadge({ rateLimit, tokenOwner, isAdminSession, setTab }) {

    return (

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

    );

}

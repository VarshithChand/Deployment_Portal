// Pulled out of Settings.jsx's "hub" view - part of the same
// cognitive-complexity cleanup as CredentialsView/SidebarAccessView/
// ActivityLogView.
export default function SettingsHubView({
    isAdmin, isSuperAdmin, setView,
    handleSignOut, signingOut
}) {

    return (

        <>

        <div className="settings-hub">

            <button type="button" className="settings-hub-tile" onClick={() => setView("credentials")}>
                <h2>Credentials</h2>
                <p>
                    GitHub, Docker, and OAuth credentials plus the admin allowlist —
                    everything the backend needs to talk to GitHub on the portal's behalf.
                </p>
            </button>

            {isAdmin && (

                <button type="button" className="settings-hub-tile" onClick={() => setView("activity-log")}>
                    <h2>Activity Log</h2>
                    <p>
                        Recent settings changes and backend errors, kept in memory on
                        the server — spans every session, so admin-only.
                    </p>
                </button>

            )}

            <button type="button" className="settings-hub-tile" onClick={() => setView("access-levels")}>
                <h2>Access Levels</h2>
                <p>
                    Everyone with access, invited or already in — invite, change, or
                    revoke what they can do.
                </p>
            </button>

            <button type="button" className="settings-hub-tile" onClick={() => setView("branches")}>
                <h2>Branches</h2>
                <p>
                    Create branches, note what each one is for, and restrict who can
                    push to it.
                </p>
            </button>

            {isAdmin && (

                <button type="button" className="settings-hub-tile" onClick={() => setView("sidebar-access")}>
                    <h2>Sidebar Access</h2>
                    <p>
                        Lock or hide any sidebar section for everyone else using the portal —
                        only visible to you.
                    </p>
                </button>

            )}

            {isAdmin && (

                <button type="button" className="settings-hub-tile" onClick={() => setView("smoke-tests")}>
                    <h2>Smoke Tests</h2>
                    <p>
                        Backend, frontend, and database results from the smoke-test pipeline —
                        re-run it on demand.
                    </p>
                </button>

            )}

            {isAdmin && (

                <button type="button" className="settings-hub-tile" onClick={() => setView("external-apis")}>
                    <h2>External APIs</h2>
                    <p>
                        Paste in a fleet of health-check URLs — grouped by version and cluster,
                        checked from the server on demand.
                    </p>
                </button>

            )}

            <button type="button" className="settings-hub-tile" onClick={() => setView("environments")}>
                <h2>Environments</h2>
                <p>
                    Which CD workflow each deployment target tracks, and the AWS ECS/ECR or
                    Azure Web App it maps to — visible to everyone, editable by admins.
                </p>
            </button>

            <button type="button" className="settings-hub-tile" onClick={() => setView("appearance")}>
                <h2>Appearance</h2>
                <p>
                    Pick how the portal looks — Glass, Neo-brutalist, Minimal, or Neon Ops —
                    plus light/dark. Saved to your own browser, nobody else's view changes.
                </p>
            </button>

            {isSuperAdmin && (

                <button type="button" className="settings-hub-tile" onClick={() => setView("database")}>
                    <h2>Database</h2>
                    <p>
                        Inspect the live PostgreSQL database — tables, columns, indexes, and rows —
                        and make structured changes. Restricted to a single administrator account.
                    </p>
                </button>

            )}

            {isSuperAdmin && (

                <button type="button" className="settings-hub-tile" onClick={() => setView("admin-access")}>
                    <h2>Admin Access</h2>
                    <p>
                        Who gets the Admin role, plus an MFA console for every PAT user — reset
                        someone's enrollment or issue a one-time recovery code. Restricted to a
                        single administrator account.
                    </p>
                </button>

            )}

        </div>

        {/* Every role sees the same non-destructive Sign Out here now -
            an earlier version of this card kept a separate "Clear All
            Data" bulk wipe for admins, removed after the user confirmed
            they didn't want that even for their own admin session. */}
        <div className="card">

            <h2 className="card-title">
                Sign Out
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Signs you out and returns you to the login screen — nothing is cleared. Your
                GitHub token and any AWS/Azure/GCP credentials are still there the next time
                you sign back in with the same token. To actually remove a saved credential
                instead, use its own "Clear" button on the Credentials page.
            </p>

            <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSignOut}
                disabled={signingOut}
            >
                {signingOut ? "Signing out..." : "Sign Out"}
            </button>

        </div>

        </>

    );

}

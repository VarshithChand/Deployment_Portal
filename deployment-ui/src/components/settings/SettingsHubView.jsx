// Pulled out of Settings.jsx's "hub" view - part of the same
// cognitive-complexity cleanup as CredentialsView/SidebarAccessView/
// ActivityLogView.
export default function SettingsHubView({ isAdmin, setView, handleClearAll, clearingAll }) {

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

        </div>

        <div className="card card-danger-zone">

            <h2 className="card-title">
                Danger Zone
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                {isAdmin
                    ? "Wipes everything on the Credentials page at once — your repository URL, " +
                      "GitHub token, AWS/Azure/GCP credentials, Docker credentials, OAuth " +
                      "settings, and Sonar settings — instead of clearing one section at a time. " +
                      "The admin allowlist is kept as-is."
                    : "Clears your own repository URL, GitHub token, and AWS/Azure/GCP " +
                      "credentials — instead of clearing one section at a time. Portal-wide " +
                      "settings (Docker, OAuth, Sonar) are admin-only and untouched by this."}
                {" "}You'll land back on the "connect your repository" screen afterward.
            </p>

            <button
                type="button"
                className="btn btn-danger"
                onClick={handleClearAll}
                disabled={clearingAll}
            >
                {clearingAll ? "Clearing..." : "Clear All Data"}
            </button>

        </div>

        </>

    );

}

import SidebarStateToggle from "../common/SidebarStateToggle";

// Pulled out of Settings.jsx's "sidebar-access" view - part of the same
// cognitive-complexity cleanup as CredentialsView/ActivityLogView.
export default function SidebarAccessView({
    patUsersLoading,
    patUsers,
    selectedPatUserKey,
    setSelectedPatUserKey,
    sidebarAccessLoading,
    sidebarAccessMap,
    setSidebarTabState,
    sidebarTabs,
    handleSaveSidebarAccess,
    savingSidebarAccess,
    handleClearSidebarAccess,
    clearingSidebarAccess
}) {

    return (

        <>

        <div className="card">

            <h2 className="card-title">
                Sidebar Access
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Pick a PAT user below, then restrict any sidebar section for just them.
                <strong> Locked</strong> keeps it visible but disabled, with a lock icon in
                place of its usual one. <strong>Hidden</strong> removes it from the sidebar
                entirely. Only visible/changeable by an admin — Settings and Dashboard can't
                be restricted, so there's always a way back in.
            </p>

            {patUsersLoading ? (

                <p className="field-hint">Loading PAT users...</p>

            ) : patUsers.length === 0 ? (

                <p className="empty-state">
                    No PAT users yet — nobody has configured a Personal Access Token on
                    this portal.
                </p>

            ) : (

                <div className="table-scroll">

                <table className="table">

                    <thead>
                        <tr>
                            <th>PAT Owner</th>
                            <th>Repository</th>
                            <th>Restricted</th>
                            <th></th>
                        </tr>
                    </thead>

                    <tbody>

                        {patUsers.map((u) => (

                            <tr key={u.key} className={selectedPatUserKey === u.key ? "table-row-active" : ""}>
                                <td>{u.patOwnerLogin}</td>
                                <td>{u.owner}/{u.repository}</td>
                                <td>
                                    {u.restrictedTabCount > 0 ? (
                                        <span className="badge badge-danger">{u.restrictedTabCount} restricted</span>
                                    ) : (
                                        <span className="badge badge-success">Fully visible</span>
                                    )}
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setSelectedPatUserKey(
                                            selectedPatUserKey === u.key ? null : u.key
                                        )}
                                    >
                                        {selectedPatUserKey === u.key ? "Close" : "Manage Sidebar Access"}
                                    </button>
                                </td>
                            </tr>

                        ))}

                    </tbody>

                </table>

                </div>

            )}

        </div>

        {selectedPatUserKey && (

            <div className="card">

                <h2 className="card-title">
                    Sidebar Access — {patUsers.find((u) => u.key === selectedPatUserKey)?.patOwnerLogin || selectedPatUserKey}
                </h2>

                {sidebarAccessLoading ? (

                    <p className="field-hint">Loading this user's sidebar access...</p>

                ) : (

                    <div className="table-scroll">

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Section</th>
                                <th>Access</th>
                            </tr>
                        </thead>

                        <tbody>

                            {sidebarTabs.map(({ key, label }) => (

                                <tr key={key}>
                                    <td>{label}</td>
                                    <td>
                                        <SidebarStateToggle
                                            value={sidebarAccessMap[key]}
                                            onChange={(state) => setSidebarTabState(key, state)}
                                        />
                                    </td>
                                </tr>

                            ))}

                        </tbody>

                    </table>

                    </div>

                )}

                <div className="button-row" style={{ marginTop: "15px" }}>

                    <button type="button" className="btn btn-primary" onClick={handleSaveSidebarAccess} disabled={savingSidebarAccess || sidebarAccessLoading}>
                        {savingSidebarAccess ? "Saving..." : "Save Sidebar Access"}
                    </button>

                    <button type="button" className="btn btn-danger" onClick={handleClearSidebarAccess} disabled={clearingSidebarAccess || sidebarAccessLoading}>
                        {clearingSidebarAccess ? "Resetting..." : "Reset This User To Visible"}
                    </button>

                </div>

            </div>

        )}

        </>

    );

}

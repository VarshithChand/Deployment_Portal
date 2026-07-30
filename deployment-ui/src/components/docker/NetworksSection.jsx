export default function NetworksSection({
    networks,
    showCreateNetwork,
    setShowCreateNetwork,
    newNetworkName,
    setNewNetworkName,
    newNetworkDriver,
    setNewNetworkDriver,
    handleCreateNetwork,
    actingId,
    handleRemoveNetwork
}) {

    return (

        <>

        <div className="access-panel-header">
            <h2 className="card-title">Networks</h2>
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCreateNetwork((v) => !v)}
            >
                {showCreateNetwork ? "Cancel" : "+ New Network"}
            </button>
        </div>

        {showCreateNetwork && (

            <form className="form-group" style={{ display: "flex", gap: 10 }} onSubmit={handleCreateNetwork}>
                <input
                    className="form-control"
                    placeholder="network-name"
                    value={newNetworkName}
                    onChange={(e) => setNewNetworkName(e.target.value)}
                />
                <select
                    className="form-control"
                    style={{ maxWidth: 160 }}
                    value={newNetworkDriver}
                    onChange={(e) => setNewNetworkDriver(e.target.value)}
                >
                    <option value="bridge">bridge</option>
                    <option value="overlay">overlay</option>
                    <option value="host">host</option>
                </select>
                <button type="submit" className="btn btn-primary">Create</button>
            </form>

        )}

        {networks.length === 0 ? (

            <p className="empty-state">No networks found on this host.</p>

        ) : (

            <div className="table-scroll">

            <table className="table">

                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Driver</th>
                        <th>Scope</th>
                        <th></th>
                    </tr>
                </thead>

                <tbody>

                    {networks.map((n) => (

                        <tr key={n.id}>
                            <td>{n.name}</td>
                            <td>{n.driver}</td>
                            <td>{n.scope}</td>
                            <td>
                                <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleRemoveNetwork(n.id, n.name)}
                                    disabled={actingId === n.id}
                                >
                                    Remove
                                </button>
                            </td>
                        </tr>

                    ))}

                </tbody>

            </table>

            </div>

        )}

        </>

    );

}

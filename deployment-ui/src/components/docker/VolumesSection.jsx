export default function VolumesSection({
    volumes,
    showCreateVolume,
    setShowCreateVolume,
    newVolumeName,
    setNewVolumeName,
    handleCreateVolume,
    actingId,
    handleRemoveVolume
}) {

    return (

        <>

        <div className="access-panel-header">
            <h2 className="card-title">Volumes</h2>
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCreateVolume((v) => !v)}
            >
                {showCreateVolume ? "Cancel" : "+ New Volume"}
            </button>
        </div>

        {showCreateVolume && (

            <form className="form-group" style={{ display: "flex", gap: 10 }} onSubmit={handleCreateVolume}>
                <input
                    className="form-control"
                    placeholder="volume-name"
                    value={newVolumeName}
                    onChange={(e) => setNewVolumeName(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">Create</button>
            </form>

        )}

        {volumes.length === 0 ? (

            <p className="empty-state">No volumes found on this host.</p>

        ) : (

            <div className="table-scroll">

            <table className="table">

                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Driver</th>
                        <th>Mountpoint</th>
                        <th></th>
                    </tr>
                </thead>

                <tbody>

                    {volumes.map((v) => (

                        <tr key={v.name}>
                            <td>{v.name}</td>
                            <td>{v.driver}</td>
                            <td className="commit-sha">{v.mountpoint}</td>
                            <td>
                                <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleRemoveVolume(v.name)}
                                    disabled={actingId === v.name}
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

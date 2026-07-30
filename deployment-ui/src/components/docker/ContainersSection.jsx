import { Fragment } from "react";

import CopyButton from "../common/CopyButton";

// Pulled out of Docker.jsx (see ImagesSection/VolumesSection/NetworksSection
// siblings) so the page's own cognitive complexity stays under Sonar's
// threshold — each section's nested create-form/table/empty-state ternary
// now lives in its own function scope instead of piling onto Docker().
export default function ContainersSection({
    containers,
    networks,
    showCreateContainer,
    setShowCreateContainer,
    containerForm,
    setContainerForm,
    creatingContainer,
    handleCreateContainer,
    actingId,
    logs,
    loadingLogs,
    handleStop,
    handleRestart,
    toggleLogs,
    handleRemoveContainer
}) {

    return (

        <>

        <div className="access-panel-header">
            <h2 className="card-title">Containers</h2>
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCreateContainer((v) => !v)}
            >
                {showCreateContainer ? "Cancel" : "+ New Container"}
            </button>
        </div>

        {showCreateContainer && (

            <form className="card" style={{ marginBottom: 20 }} onSubmit={handleCreateContainer}>

                <div className="form-group">
                    <label htmlFor="docker-container-image">Image</label>
                    <input
                        id="docker-container-image"
                        className="form-control"
                        placeholder="ghcr.io/varshithchand/deployment-portal-api:latest"
                        value={containerForm.image}
                        onChange={(e) => setContainerForm({ ...containerForm, image: e.target.value })}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="docker-container-name">Container name (optional)</label>
                    <input
                        id="docker-container-name"
                        className="form-control"
                        value={containerForm.name}
                        onChange={(e) => setContainerForm({ ...containerForm, name: e.target.value })}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="docker-container-ports">Ports (host:container, comma-separated)</label>
                    <input
                        id="docker-container-ports"
                        className="form-control"
                        placeholder="8090:8080"
                        value={containerForm.ports}
                        onChange={(e) => setContainerForm({ ...containerForm, ports: e.target.value })}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="docker-container-env">Environment variables (KEY=value, comma-separated)</label>
                    <input
                        id="docker-container-env"
                        className="form-control"
                        placeholder="ASPNETCORE_ENVIRONMENT=Production"
                        value={containerForm.env}
                        onChange={(e) => setContainerForm({ ...containerForm, env: e.target.value })}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="docker-container-volumes">Volumes (name-or-path:/container/path, comma-separated)</label>
                    <input
                        id="docker-container-volumes"
                        className="form-control"
                        value={containerForm.volumes}
                        onChange={(e) => setContainerForm({ ...containerForm, volumes: e.target.value })}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="docker-container-network">Network</label>
                    <select
                        id="docker-container-network"
                        className="form-control"
                        value={containerForm.network}
                        onChange={(e) => setContainerForm({ ...containerForm, network: e.target.value })}
                    >
                        <option value="">Default</option>
                        {networks.map((n) => (
                            <option key={n.id} value={n.name}>{n.name}</option>
                        ))}
                    </select>
                </div>

                <div className="access-restrict-checkbox" style={{ marginBottom: 15 }}>
                    <input
                        type="checkbox"
                        id="docker-restart-policy"
                        checked={containerForm.restart}
                        onChange={(e) => setContainerForm({ ...containerForm, restart: e.target.checked })}
                    />
                    <label htmlFor="docker-restart-policy">Restart unless stopped</label>
                </div>

                <button type="submit" className="btn btn-primary" disabled={creatingContainer}>
                    {creatingContainer ? "Creating..." : "Create Container"}
                </button>

            </form>

        )}

        {containers.length === 0 ? (

            <p className="empty-state">No containers found on this host.</p>

        ) : (

            <div className="table-scroll">

            <table className="table">

                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Image</th>
                        <th>Status</th>
                        <th>Ports</th>
                        <th>Created</th>
                        <th></th>
                    </tr>
                </thead>

                <tbody>

                    {containers.map((c) => (

                        <Fragment key={c.id}>

                        <tr>
                            <td>
                                {c.name}
                                <CopyButton value={c.id} label="Copy container ID" />
                            </td>
                            <td>{c.image}</td>
                            <td>
                                <span className={`badge ${c.state === "running" ? "badge-success" : "badge-secondary"}`}>
                                    {c.status}
                                </span>
                            </td>
                            <td>{c.ports.join(", ") || "—"}</td>
                            <td>{new Date(c.createdAt).toLocaleString()}</td>
                            <td>

                                <div className="button-row">

                                    {c.state === "running" ? (
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => handleStop(c.id)}
                                            disabled={actingId === c.id}
                                        >
                                            Stop
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => handleRestart(c.id)}
                                            disabled={actingId === c.id}
                                        >
                                            Start
                                        </button>
                                    )}

                                    {c.state === "running" && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => handleRestart(c.id)}
                                            disabled={actingId === c.id}
                                        >
                                            Restart
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => toggleLogs(c.id)}
                                    >
                                        {logs.id === c.id ? "Hide Logs" : "Logs"}
                                    </button>

                                    <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        onClick={() => handleRemoveContainer(c.id, c.name)}
                                        disabled={actingId === c.id}
                                    >
                                        Remove
                                    </button>

                                </div>

                            </td>
                        </tr>

                        {logs.id === c.id && (

                            <tr>
                                <td colSpan={6}>
                                    <pre className="docker-logs">
                                        {loadingLogs ? "Loading..." : logs.text}
                                    </pre>
                                </td>
                            </tr>

                        )}

                        </Fragment>

                    ))}

                </tbody>

            </table>

            </div>

        )}

        </>

    );

}

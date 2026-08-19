import { useEffect, useState } from "react";

import { getEcsTaskLogs } from "../../services/cloudServicesService";
import RangeSelector from "../hosting-observability/RangeSelector";

const RANGE_MINUTES = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440 };

// Section 12's "click a task to view container information, image, ports,
// environment metadata WITHOUT secrets, health checks" + section 13's
// log viewer, combined into one dialog rather than two - a task's
// container list and its logs are the same drill-down, not separate
// features. Environment values are already redacted server-side (see
// CloudServiceManagementService.GetEcsServiceDetailAsync) - never the raw
// secret, even here.
function LogsPanel({ cluster, taskId, containerName, onClose }) {

    const [range, setRange] = useState("15m");
    const [logs, setLogs] = useState(null);
    const [search, setSearch] = useState("");

    useEffect(() => {

        setLogs(null);

        getEcsTaskLogs(cluster, taskId, containerName, RANGE_MINUTES[range]).then(setLogs).catch((err) => {
            console.error(err);
            setLogs({ configured: false, error: "Unable to reach the Deployment API." });
        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cluster, taskId, containerName, range]);

    const lines = (logs?.lines || []).filter((l) =>
        !search.trim() || l.message.toLowerCase().includes(search.trim().toLowerCase())
    );

    return (

        <div className="cloud-service-relationship-node" style={{ minWidth: "auto", marginTop: "10px" }}>

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "8px" }}>
                <strong>Logs — {containerName}</strong>
                <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
            </div>

            <RangeSelector value={range} onChange={setRange} />

            <input
                type="text" className="form-control" placeholder="Search logs..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ marginBottom: "10px" }}
            />

            {!logs ? (
                <p className="empty-state">Loading logs...</p>
            ) : logs.error ? (
                <p className="error-message">{logs.error}</p>
            ) : lines.length === 0 ? (
                <p className="empty-state" style={{ textAlign: "left" }}>No log lines in this range.</p>
            ) : (
                <pre className="cloud-service-log-lines">
                    {lines.map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.message}`).join("\n")}
                </pre>
            )}

        </div>

    );

}

export default function EcsTaskDetailDialog({ cluster, task, onClose }) {

    const [logsContainer, setLogsContainer] = useState(null);

    if (!task) {
        return null;
    }

    return (

        <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

            <div className="dialog" role="dialog" aria-modal="true" style={{ maxWidth: "720px" }}>

                <h2>Task {task.taskId}</h2>

                <div className="cloud-service-connection-grid" style={{ marginBottom: "16px" }}>
                    <div><p className="field-hint" style={{ margin: 0 }}>Status</p><p>{task.lastStatus}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Health</p><p>{task.healthStatus || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Started</p><p>{task.startedAt ? new Date(task.startedAt).toLocaleString() : "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>CPU</p><p>{task.cpu || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Memory</p><p>{task.memory || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Availability Zone</p><p>{task.availabilityZone || "—"}</p></div>
                </div>

                {(task.containers || []).map((c) => (

                    <div key={c.name} className="card" style={{ margin: "0 0 12px" }}>

                        <div className="button-row" style={{ justifyContent: "space-between" }}>
                            <h3 className="settings-subhead" style={{ margin: 0 }}>{c.name}</h3>
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setLogsContainer(logsContainer === c.name ? null : c.name)}>
                                {logsContainer === c.name ? "Hide Logs" : "View Logs"}
                            </button>
                        </div>

                        <p className="smoke-test-metric-mono" style={{ marginTop: "8px" }}>{c.image}</p>

                        <div className="cloud-service-connection-grid" style={{ marginTop: "8px" }}>
                            <div><p className="field-hint" style={{ margin: 0 }}>Status</p><p>{c.lastStatus || "—"}</p></div>
                            <div><p className="field-hint" style={{ margin: 0 }}>Health</p><p>{c.healthStatus || "—"}</p></div>
                            <div><p className="field-hint" style={{ margin: 0 }}>Exit Code</p><p>{c.exitCode ?? "—"}</p></div>
                            <div><p className="field-hint" style={{ margin: 0 }}>Ports</p><p>{c.ports?.length ? c.ports.join(", ") : "—"}</p></div>
                        </div>

                        {Object.keys(c.environment || {}).length > 0 && (

                            <>
                                <p className="field-hint" style={{ marginTop: "10px", marginBottom: "4px" }}>Environment (secrets redacted)</p>
                                <ul className="cloud-service-detail-list">
                                    {Object.entries(c.environment).map(([k, v]) => (
                                        <li key={k}><span className="smoke-test-metric-mono">{k}</span> = {v}</li>
                                    ))}
                                </ul>
                            </>

                        )}

                        {logsContainer === c.name && (
                            <LogsPanel cluster={cluster} taskId={task.taskId} containerName={c.name} onClose={() => setLogsContainer(null)} />
                        )}

                    </div>

                ))}

                <div className="button-row">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
                </div>

            </div>

        </div>

    );

}

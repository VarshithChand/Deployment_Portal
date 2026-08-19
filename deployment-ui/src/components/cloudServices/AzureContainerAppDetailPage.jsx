import { useEffect, useState } from "react";

import {
    getAzureContainerAppDetail, scaleAzureContainerApp, startAzureContainerApp, stopAzureContainerApp,
    restartAzureContainerAppRevision, deleteAzureContainerApp, getAzureContainerAppMetrics
} from "../../services/containerServicesService";
import useToast from "../../hooks/useToast";
import CloudServiceBreadcrumbs from "./CloudServiceBreadcrumbs";
import StateBadge from "./StateBadge";
import TypedConfirmDialog from "./TypedConfirmDialog";
import ConfirmDialog from "../ConfirmDialog";
import RangeSelector from "../hosting-observability/RangeSelector";
import LineChart from "../charts/LineChart";

const RANGE_MINUTES = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440, "7d": 10080 };

// Section 17's scaling config + section 16's revision list - Container
// Apps' own real Start/Stop operations are used as-is (unlike Cloud Run,
// see CloudRunDetailPage's own comment on why that one has no Stop).
export default function AzureContainerAppDetailPage({ resourceGroup, name, onBack }) {

    const toast = useToast();

    const [detail, setDetail] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [range, setRange] = useState("1h");
    const [minReplicas, setMinReplicas] = useState("");
    const [maxReplicas, setMaxReplicas] = useState("");
    const [scaling, setScaling] = useState(false);
    const [actioning, setActioning] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [restartTarget, setRestartTarget] = useState(null);
    const [restarting, setRestarting] = useState(false);

    function load() {

        getAzureContainerAppDetail(resourceGroup, name).then((data) => {
            setDetail(data);
            if (data.app) {
                setMinReplicas(String(data.app.minReplicas));
                setMaxReplicas(String(data.app.maxReplicas));
            }
        }).catch((err) => {
            console.error(err);
            setDetail({ configured: false, error: "Unable to reach the Deployment API." });
        });

    }

    useEffect(load, [resourceGroup, name]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {

        getAzureContainerAppMetrics(resourceGroup, name, RANGE_MINUTES[range]).then(setMetrics).catch((err) => console.error(err));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resourceGroup, name, range]);

    async function handleScale() {

        setScaling(true);

        try {

            const result = await scaleAzureContainerApp(resourceGroup, name, Number(minReplicas), Number(maxReplicas));

            if (result.success) toast.show(result.message || "Scale requested.", "success");
            else toast.show(result.error || "Unable to scale that app.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to scale that app.", "error");
        }
        finally {
            setScaling(false);
            load();
        }

    }

    async function runAction(actionFn, label) {

        setActioning(true);

        try {

            const result = await actionFn(resourceGroup, name);

            if (result.success) toast.show(result.message || `${label} requested.`, "success");
            else toast.show(result.error || `Unable to ${label.toLowerCase()} that app.`, "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || `Unable to ${label.toLowerCase()} that app.`, "error");
        }
        finally {
            setActioning(false);
            load();
        }

    }

    async function handleDeleteConfirm() {

        setDeleting(true);

        try {
            await runAction(deleteAzureContainerApp, "Delete");
        }
        finally {
            setDeleting(false);
            setDeleteOpen(false);
        }

    }

    async function handleRestartConfirm() {

        setRestarting(true);

        try {

            const result = await restartAzureContainerAppRevision(resourceGroup, name, restartTarget.name);

            if (result.success) toast.show(result.message || "Restart requested.", "success");
            else toast.show(result.error || "Unable to restart that revision.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to restart that revision.", "error");
        }
        finally {
            setRestarting(false);
            setRestartTarget(null);
            load();
        }

    }

    if (!detail) {
        return <p className="empty-state">Loading Container App detail...</p>;
    }

    if (detail.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load this Container App.</p>
                <p className="field-hint">{detail.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    const app = detail.app;
    const running = (app?.runningStatus || "").toLowerCase() === "running";

    return (

        <>

            <CloudServiceBreadcrumbs items={[{ label: "Container Apps", onClick: onBack }, { label: name }]} />

            <div className="card cloud-service-detail-page-header">

                <div className="cloud-service-detail-page-header-main">

                    <div>
                        <h1 style={{ margin: "2px 0" }}>{name}</h1>
                        <p className="field-hint" style={{ margin: 0 }}>{resourceGroup}</p>
                        <div style={{ marginTop: "8px" }}><StateBadge state={app?.runningStatus} /></div>
                    </div>

                </div>

                <div className="cloud-service-detail-page-header-actions">

                    {actioning ? (
                        <span className="field-hint">Working...</span>
                    ) : (
                        <>
                            {running ? (
                                <button type="button" className="btn btn-secondary" onClick={() => runAction(stopAzureContainerApp, "Stop")}>Stop</button>
                            ) : (
                                <button type="button" className="btn btn-success" onClick={() => runAction(startAzureContainerApp, "Start")}>Start</button>
                            )}
                            <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>Delete</button>
                        </>
                    )}

                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Overview</h3>

                <div className="cloud-service-connection-grid">
                    <div><p className="field-hint" style={{ margin: 0 }}>Location</p><p>{app?.location}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Image</p><p className="smoke-test-metric-mono">{app?.image || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Provisioning State</p><p>{app?.provisioningState || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>URL</p><p>{app?.fqdnUrl ? <a href={`https://${app.fqdnUrl}`} target="_blank" rel="noreferrer">{app.fqdnUrl}</a> : "—"}</p></div>
                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Scaling</h3>

                <div className="cloud-service-firewall-form-grid">

                    <div className="form-group">
                        <label>Minimum Replicas</label>
                        <input type="number" min="0" className="form-control" value={minReplicas} onChange={(e) => setMinReplicas(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label>Maximum Replicas</label>
                        <input type="number" min="1" className="form-control" value={maxReplicas} onChange={(e) => setMaxReplicas(e.target.value)} />
                    </div>

                </div>

                <button type="button" className="btn btn-primary btn-sm" onClick={handleScale} disabled={scaling}>
                    {scaling ? "Applying..." : "Apply"}
                </button>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Performance</h3>

                <RangeSelector value={range} onChange={setRange} />

                {!metrics ? (
                    <p className="empty-state">Loading metrics...</p>
                ) : metrics.error ? (
                    <p className="error-message">{metrics.error}</p>
                ) : (

                    <div className="chart-analysis-grid">
                        {metrics.series.map((series) => (
                            <div className="chart-analysis-card" key={series.label}>
                                <h4>{series.label}</h4>
                                <LineChart points={series.points} />
                            </div>
                        ))}
                    </div>

                )}

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Revisions</h3>

                {detail.revisions.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No revisions found.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Revision</th>
                                    <th>Active</th>
                                    <th className="num">Replicas</th>
                                    <th className="num">Traffic %</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>

                            <tbody>

                                {detail.revisions.map((r) => (

                                    <tr key={r.name}>
                                        <td className="smoke-test-metric-mono">{r.name}</td>
                                        <td>{r.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-secondary">Inactive</span>}</td>
                                        <td className="num">{r.replicas}</td>
                                        <td className="num">{r.trafficWeight}</td>
                                        <td>{r.createdTime ? new Date(r.createdTime).toLocaleString() : "—"}</td>
                                        <td>
                                            {r.active && (
                                                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setRestartTarget(r)}>Restart</button>
                                            )}
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

            <div className="card">
                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Logs</h3>
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Per-revision log tailing isn't wired up here yet - Container Apps logs live in the
                    Log Analytics workspace tied to its Managed Environment.
                </p>
            </div>

            <TypedConfirmDialog
                open={deleteOpen}
                title="Delete Container App?"
                message={<>This permanently deletes <strong>{name}</strong>. This cannot be undone.</>}
                resourceName={name}
                confirmLabel="Delete"
                loading={deleting}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteOpen(false)}
            />

            <ConfirmDialog
                open={!!restartTarget}
                title="Restart this revision?"
                message={restartTarget ? `This restarts every replica of revision ${restartTarget.name}.` : ""}
                confirmLabel={restarting ? "Restarting..." : "Restart"}
                onConfirm={handleRestartConfirm}
                onCancel={() => setRestartTarget(null)}
            />

        </>

    );

}

import { useEffect, useState } from "react";

import { scaleCloudRunService, redeployCloudRunService, deleteCloudRunService, getCloudRunMetrics } from "../../services/containerServicesService";
import useToast from "../../hooks/useToast";
import CloudServiceBreadcrumbs from "./CloudServiceBreadcrumbs";
import TypedConfirmDialog from "./TypedConfirmDialog";
import RangeSelector from "../hosting-observability/RangeSelector";
import LineChart from "../charts/LineChart";

const RANGE_MINUTES = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440, "7d": 10080 };

// Section 18's explicit instruction: "Cloud Run does not have identical
// start/stop semantics to EC2 - use the actual GCP model." There is
// deliberately NO Stop button here - Cloud Run has no such operation, and
// faking one (e.g. by setting max instances to 0) would silently break
// the service in a way this app can't honestly call "stopped." What IS
// real and exposed: Scale (min/max instance autoscaling, Cloud Run's
// actual knob) and Redeploy (the documented real-world "restart"
// equivalent - forcing a new revision via an annotation touch).
export default function CloudRunDetailPage({ service, onBack, onChanged }) {

    const toast = useToast();

    const [minInstances, setMinInstances] = useState(String(service.minInstances));
    const [maxInstances, setMaxInstances] = useState(String(service.maxInstances || 1));
    const [scaling, setScaling] = useState(false);
    const [redeploying, setRedeploying] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [metrics, setMetrics] = useState(null);
    const [range, setRange] = useState("1h");

    useEffect(() => {

        getCloudRunMetrics(service.name, RANGE_MINUTES[range]).then(setMetrics).catch((err) => console.error(err));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [service.name, range]);

    async function handleScale() {

        setScaling(true);

        try {

            const result = await scaleCloudRunService(service.name, Number(minInstances), Number(maxInstances));

            if (result.success) toast.show(result.message || "Scale requested.", "success");
            else toast.show(result.error || "Unable to scale that service.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to scale that service.", "error");
        }
        finally {
            setScaling(false);
            onChanged();
        }

    }

    async function handleRedeploy() {

        setRedeploying(true);

        try {

            const result = await redeployCloudRunService(service.name);

            if (result.success) toast.show(result.message || "Redeploy requested.", "success");
            else toast.show(result.error || "Unable to redeploy that service.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to redeploy that service.", "error");
        }
        finally {
            setRedeploying(false);
        }

    }

    async function handleDeleteConfirm() {

        setDeleting(true);

        try {

            const result = await deleteCloudRunService(service.name);

            if (result.success) toast.show(result.message || "Delete requested.", "success");
            else toast.show(result.error || "Unable to delete that service.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to delete that service.", "error");
        }
        finally {
            setDeleting(false);
            setDeleteOpen(false);
            onChanged();
        }

    }

    return (

        <>

            <CloudServiceBreadcrumbs items={[{ label: "Cloud Run", onClick: onBack }, { label: service.name }]} />

            <div className="card cloud-service-detail-page-header">

                <div className="cloud-service-detail-page-header-main">

                    <div>
                        <h1 style={{ margin: "2px 0" }}>{service.name}</h1>
                        <p className="field-hint" style={{ margin: 0 }}>{service.location}</p>
                        {service.condition && <div style={{ marginTop: "8px" }}><span className="badge badge-secondary">{service.condition}</span></div>}
                    </div>

                </div>

                <div className="cloud-service-detail-page-header-actions">
                    <button type="button" className="btn btn-secondary" onClick={handleRedeploy} disabled={redeploying}>
                        {redeploying ? "Redeploying..." : "Redeploy"}
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>Delete</button>
                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Overview</h3>

                <div className="cloud-service-connection-grid">
                    <div><p className="field-hint" style={{ margin: 0 }}>URL</p><p>{service.url ? <a href={service.url} target="_blank" rel="noreferrer">{service.url}</a> : "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Image</p><p className="smoke-test-metric-mono">{service.image || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Latest Ready Revision</p><p className="smoke-test-metric-mono">{service.latestReadyRevision || "—"}</p></div>
                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Scaling</h3>

                <p className="field-hint" style={{ marginTop: 0 }}>
                    Cloud Run has no Stop button - it scales to your minimum instance count (0 or more)
                    rather than being explicitly stopped. Set minimum to 0 to allow it to scale down fully.
                </p>

                <div className="cloud-service-firewall-form-grid">

                    <div className="form-group">
                        <label>Minimum Instances</label>
                        <input type="number" min="0" className="form-control" value={minInstances} onChange={(e) => setMinInstances(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label>Maximum Instances</label>
                        <input type="number" min="1" className="form-control" value={maxInstances} onChange={(e) => setMaxInstances(e.target.value)} />
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

                <p className="field-hint" style={{ marginTop: "10px" }}>
                    Request latency, error rate, CPU, and memory aren't charted here yet - Cloud
                    Monitoring reports those as percentile distributions, not a single number per point,
                    and this console doesn't reduce them yet.
                </p>

            </div>

            <TypedConfirmDialog
                open={deleteOpen}
                title="Delete Cloud Run service?"
                message={<>This permanently deletes <strong>{service.name}</strong>. This cannot be undone.</>}
                resourceName={service.name}
                confirmLabel="Delete"
                loading={deleting}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteOpen(false)}
            />

        </>

    );

}

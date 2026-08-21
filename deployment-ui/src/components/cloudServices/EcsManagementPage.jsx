import { useEffect, useState } from "react";

import { getMyAwsEcsDetail } from "../../services/settingsService";
import {
    scaleEcsService, bulkScaleEcsServices, getEcsServiceDetail, getEcsRunningImage,
    getEcsMetrics, restartEcsService, stopEcsTask
} from "../../services/cloudServicesService";
import usePagination from "../../hooks/usePagination";
import useToast from "../../hooks/useToast";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import ConfirmDialog from "../ConfirmDialog";
import RangeSelector from "../hosting-observability/RangeSelector";
import LineChart from "../charts/LineChart";
import StateBadge from "./StateBadge";
import EcsTaskDetailDialog from "./EcsTaskDetailDialog";

const PAGE_SIZE = 10;
const RANGE_MINUTES = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440, "7d": 10080 };
const QUICK_COUNTS = [0, 1, 2, 5, 10];

// One GetEcsDetailAsync call already returns every cluster and every
// service within each (see CloudStatusService) - the cluster list, one
// cluster's detail, and one service's detail below are all just different
// slices of that same fetch, not three separate API calls. The service
// detail view itself (Phase 2) fetches richer per-service data (tasks,
// containers, metrics, running image) separately, since that's real
// per-request cost this summary-level fetch shouldn't pay for every
// service in every cluster up front.
export default function EcsManagementPage({ routeParams, onNavigate, refreshToken }) {

    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);

    async function load() {

        setLoading(true);

        try {
            setDetail(await getMyAwsEcsDetail());
        }
        catch (err) {
            console.error(err);
            setDetail({ configured: false, error: "Unable to reach the Deployment API." });
        }
        finally {
            setLoading(false);
        }

    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshToken]);

    if (loading) {
        return <div className="card"><p className="empty-state">Loading AWS resources...</p></div>;
    }

    if (!detail?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your AWS credentials in Settings → Credentials → AWS to manage ECS.
                </p>
            </div>
        );

    }

    if (detail.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load ECS resources.</p>
                <p className="field-hint">{detail.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    const cluster = routeParams.cluster
        ? detail.clusters.find((c) => c.clusterName === routeParams.cluster)
        : null;

    const service = cluster && routeParams.ecsService
        ? cluster.services.find((s) => s.serviceName === routeParams.ecsService)
        : null;

    if (routeParams.cluster && !cluster) {
        return <div className="card"><p className="empty-state">Cluster "{routeParams.cluster}" was not found.</p></div>;
    }

    if (routeParams.ecsService && !service) {
        return <div className="card"><p className="empty-state">Service "{routeParams.ecsService}" was not found in this cluster.</p></div>;
    }

    if (service && cluster) {
        return <EcsServiceDetail clusterName={cluster.clusterName} serviceName={service.serviceName} onScaled={load} />;
    }

    if (cluster) {
        return (
            <EcsClusterDetail
                cluster={cluster}
                onSelectService={(serviceName) => onNavigate({ service: "ecs", cluster: cluster.clusterName, ecsService: serviceName })}
                onScaled={load}
            />
        );
    }

    return (
        <EcsClusterList
            clusters={detail.clusters}
            onSelectCluster={(clusterName) => onNavigate({ service: "ecs", cluster: clusterName })}
        />
    );

}

function EcsClusterList({ clusters, onSelectCluster }) {

    const [search, setSearch] = useState("");

    const filtered = clusters.filter((c) =>
        c.clusterName.toLowerCase().includes(search.trim().toLowerCase())
    );

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(filtered, PAGE_SIZE);

    useEffect(() => {
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const totalServices = clusters.reduce((sum, c) => sum + c.services.length, 0);
    const totalRunning = clusters.reduce((sum, c) => sum + c.services.reduce((s, svc) => s + svc.runningCount, 0), 0);
    const totalPending = clusters.reduce((sum, c) => sum + c.services.reduce((s, svc) => s + svc.pendingCount, 0), 0);

    return (

        <>

            <div className="cloud-service-stat-grid">
                <div className="cloud-service-stat-tile"><span>Clusters</span><strong>{clusters.length}</strong></div>
                <div className="cloud-service-stat-tile"><span>Services</span><strong>{totalServices}</strong></div>
                <div className="cloud-service-stat-tile"><span>Running Tasks</span><strong>{totalRunning}</strong></div>
                <div className="cloud-service-stat-tile"><span>Pending Tasks</span><strong>{totalPending}</strong></div>
            </div>

            <div className="card">

                <h2 className="card-title">Clusters</h2>

                <SearchBox placeholder="Search clusters..." value={search} onChange={setSearch} />

                {filtered.length === 0 ? (

                    <p className="empty-state">No ECS clusters found.</p>

                ) : (

                    <>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Cluster</th>
                                        <th>Status</th>
                                        <th className="num">Services</th>
                                        <th className="num">Running Tasks</th>
                                        <th className="num">Pending Tasks</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {pageItems.map((c) => {

                                        const running = c.services.reduce((s, svc) => s + svc.runningCount, 0);
                                        const pending = c.services.reduce((s, svc) => s + svc.pendingCount, 0);

                                        return (

                                            <tr key={c.clusterName} className="table-row-clickable" onClick={() => onSelectCluster(c.clusterName)}>
                                                <td>{c.clusterName}</td>
                                                <td><StateBadge state={c.status} /></td>
                                                <td className="num">{c.services.length}</td>
                                                <td className="num">{running}</td>
                                                <td className="num">{pending}</td>
                                            </tr>

                                        );

                                    })}

                                </tbody>

                            </table>

                        </div>

                        <Pagination
                            page={page}
                            pageCount={pageCount}
                            totalCount={totalCount}
                            startIndex={startIndex}
                            endIndex={endIndex}
                            onPageChange={setPage}
                        />

                    </>

                )}

            </div>

        </>

    );

}

// Section 11's bulk operations - select any number of services in this
// cluster, set them all to the same desired count in one confirmed step,
// then see each service's own individual result (never a single pass/
// fail for the whole batch - section 27).
function EcsClusterDetail({ cluster, onSelectService, onScaled }) {

    const toast = useToast();

    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(new Set());
    const [bulkCount, setBulkCount] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [applying, setApplying] = useState(false);
    const [results, setResults] = useState(null);

    const filtered = cluster.services.filter((s) =>
        s.serviceName.toLowerCase().includes(search.trim().toLowerCase())
    );

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(filtered, PAGE_SIZE);

    useEffect(() => {
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const running = cluster.services.reduce((s, svc) => s + svc.runningCount, 0);
    const pending = cluster.services.reduce((s, svc) => s + svc.pendingCount, 0);

    function toggleSelected(name) {

        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });

    }

    const selectedServices = cluster.services.filter((s) => selected.has(s.serviceName));

    async function applyBulkScale() {

        setApplying(true);

        try {

            const payload = selectedServices.map((s) => ({ cluster: cluster.clusterName, service: s.serviceName }));
            const result = await bulkScaleEcsServices(payload, Number(bulkCount));

            setResults(result.results);

            const failures = result.results.filter((r) => !r.success);

            if (failures.length === 0) {
                toast.show(`Set desired count of ${selectedServices.length} service(s) to ${bulkCount}.`, "success");
            }
            else {
                toast.show(`${result.results.length - failures.length}/${result.results.length} services scaled - see results below.`, "error");
            }

            onScaled();

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to apply bulk scaling.", "error");
        }
        finally {
            setApplying(false);
            setConfirmOpen(false);
        }

    }

    return (

        <>

            <div className="card">
                <h2 className="card-title">{cluster.clusterName}</h2>
                <p className="field-hint" style={{ margin: 0 }}>Status: <StateBadge state={cluster.status} /></p>
            </div>

            <div className="cloud-service-stat-grid">
                <div className="cloud-service-stat-tile"><span>Services</span><strong>{cluster.services.length}</strong></div>
                <div className="cloud-service-stat-tile"><span>Running Tasks</span><strong>{running}</strong></div>
                <div className="cloud-service-stat-tile"><span>Pending Tasks</span><strong>{pending}</strong></div>
            </div>

            <div className="card">

                <h2 className="card-title">ECS Services</h2>

                <SearchBox placeholder="Search services..." value={search} onChange={setSearch} />

                {selected.size > 0 && (

                    <div className="cloud-service-bulk-bar">

                        <strong>{selected.size} service(s) selected</strong>

                        {QUICK_COUNTS.map((n) => (
                            <button key={n} type="button" className={`btn btn-sm ${bulkCount === String(n) ? "btn-primary" : "btn-secondary"}`} onClick={() => setBulkCount(String(n))}>
                                {n}
                            </button>
                        ))}

                        <input
                            type="number" min="0" className="form-control" style={{ width: "90px" }}
                            value={bulkCount} onChange={(e) => setBulkCount(e.target.value)}
                            placeholder="Custom"
                        />

                        <button type="button" className="btn btn-sm btn-primary" disabled={bulkCount === ""} onClick={() => setConfirmOpen(true)}>
                            Set Desired Count
                        </button>

                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setSelected(new Set()); setResults(null); }}>
                            Clear Selection
                        </button>

                    </div>

                )}

                {results && (

                    <div className="card" style={{ margin: "0 0 12px" }}>

                        <h4 className="settings-subhead" style={{ marginTop: 0 }}>Bulk Scale Results</h4>

                        <ul className="cloud-service-detail-list">
                            {results.map((r) => (
                                <li key={r.service}>
                                    {r.service} {r.success ? <span className="badge badge-success">✓</span> : <span className="badge badge-danger">✗ {r.error}</span>}
                                </li>
                            ))}
                        </ul>

                    </div>

                )}

                {filtered.length === 0 ? (

                    <p className="empty-state">No services in this cluster.</p>

                ) : (

                    <>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th><span className="visually-hidden">Select</span></th>
                                        <th>Service</th>
                                        <th className="num">Desired</th>
                                        <th className="num">Running</th>
                                        <th className="num">Pending</th>
                                        <th>Status</th>
                                        <th>Task Definition</th>
                                        <th>Deployment</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {pageItems.map((s) => (

                                        <tr key={s.serviceName}>
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <input type="checkbox" aria-label={`Select ${s.serviceName}`} checked={selected.has(s.serviceName)} onChange={() => toggleSelected(s.serviceName)} />
                                            </td>
                                            <td className="table-row-clickable" onClick={() => onSelectService(s.serviceName)}>{s.serviceName}</td>
                                            <td className="num">{s.desiredCount}</td>
                                            <td className="num">{s.runningCount}</td>
                                            <td className="num">{s.pendingCount}</td>
                                            <td><StateBadge state={s.status} /></td>
                                            <td className="smoke-test-metric-mono">{s.taskDefinition || "—"}</td>
                                            <td>{s.deploymentStatus ? <StateBadge state={s.deploymentStatus} /> : "—"}</td>
                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                        </div>

                        <Pagination
                            page={page}
                            pageCount={pageCount}
                            totalCount={totalCount}
                            startIndex={startIndex}
                            endIndex={endIndex}
                            onPageChange={setPage}
                        />

                    </>

                )}

            </div>

            <ConfirmDialog
                open={confirmOpen}
                title={bulkCount === "0" ? "Stop all desired tasks?" : "Apply bulk scale?"}
                message={bulkCount === "0"
                    ? `This will stop all desired tasks for ${selectedServices.length} service(s): ${selectedServices.map((s) => s.serviceName).join(", ")}.`
                    : `You are about to set the desired task count of ${selectedServices.length} service(s) to ${bulkCount}.`}
                confirmLabel={applying ? "Applying..." : "Confirm"}
                danger={bulkCount === "0"}
                onConfirm={applyBulkScale}
                onCancel={() => setConfirmOpen(false)}
            />

        </>

    );

}

function EcsServiceDetail({ clusterName, serviceName, onScaled }) {

    const toast = useToast();

    const [detail, setDetail] = useState(null);
    const [runningImage, setRunningImage] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [range, setRange] = useState("1h");
    const [desiredCount, setDesiredCount] = useState("");
    const [scaling, setScaling] = useState(false);
    const [zeroConfirmOpen, setZeroConfirmOpen] = useState(false);
    const [restarting, setRestarting] = useState(false);
    const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
    const [stopTarget, setStopTarget] = useState(null);
    const [stopping, setStopping] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);

    function load() {

        getEcsServiceDetail(clusterName, serviceName).then((data) => {
            setDetail(data);
            if (desiredCount === "") setDesiredCount(String(data.desiredCount));
        }).catch((err) => console.error(err));

        getEcsRunningImage(clusterName, serviceName).then(setRunningImage).catch((err) => console.error(err));

    }

    useEffect(load, [clusterName, serviceName]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {

        getEcsMetrics(clusterName, serviceName, RANGE_MINUTES[range]).then(setMetrics).catch((err) => console.error(err));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clusterName, serviceName, range]);

    async function applyScale(target) {

        setScaling(true);

        try {

            const result = await scaleEcsService(clusterName, serviceName, target);

            if (result.success) {
                toast.show(result.message || "Scale requested — waiting for AWS...", "success");
                onScaled();
                load();
            }
            else if (/access.?denied/i.test(result.error || "")) {
                toast.show("Permission denied — your AWS IAM identity does not have permission to perform this operation.", "error");
            }
            else {
                toast.show(result.error || "Unable to scale that service.", "error");
            }

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to scale that service.", "error");
        }
        finally {
            setScaling(false);
            setZeroConfirmOpen(false);
        }

    }

    function handleScaleClick() {

        const target = Number(desiredCount);

        if (target === 0) setZeroConfirmOpen(true);
        else applyScale(target);

    }

    async function handleRestart() {

        setRestarting(true);

        try {

            const result = await restartEcsService(clusterName, serviceName);

            if (result.success) toast.show(result.message || "Restart requested.", "success");
            else toast.show(result.error || "Unable to restart that service.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to restart that service.", "error");
        }
        finally {
            setRestarting(false);
            setRestartConfirmOpen(false);
            load();
        }

    }

    async function handleStopConfirm() {

        setStopping(true);

        try {

            const result = await stopEcsTask(clusterName, stopTarget.taskId);

            if (result.success) toast.show(result.message || "Stop requested.", "success");
            else toast.show(result.error || "Unable to stop that task.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to stop that task.", "error");
        }
        finally {
            setStopping(false);
            setStopTarget(null);
            load();
        }

    }

    if (!detail) {
        return <div className="card"><p className="empty-state">Loading service detail...</p></div>;
    }

    if (detail.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load this service.</p>
                <p className="field-hint">{detail.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    return (

        <>

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{clusterName} / {serviceName}</h2>
                    <button type="button" className="btn btn-secondary" onClick={() => setRestartConfirmOpen(true)} disabled={restarting}>
                        {restarting ? "Restarting..." : "Restart Tasks"}
                    </button>
                </div>

                <div className="cloud-service-stat-grid" style={{ marginTop: "12px" }}>
                    <div className="cloud-service-stat-tile"><span>Desired Count</span><strong>{detail.desiredCount}</strong></div>
                    <div className="cloud-service-stat-tile"><span>Running Count</span><strong>{detail.runningCount}</strong></div>
                    <div className="cloud-service-stat-tile"><span>Pending Count</span><strong>{detail.pendingCount}</strong></div>
                </div>

                <div className="info-row">
                    <span>Task Definition</span>
                    <strong className="smoke-test-metric-mono">{detail.taskDefinition || "—"}</strong>
                </div>

                <div className="info-row">
                    <span>Deployment Status</span>
                    <strong>{detail.deploymentStatus ? <StateBadge state={detail.deploymentStatus} /> : "—"}</strong>
                </div>

                <h3 className="settings-subhead">Scale Service</h3>

                <div className="button-row">
                    {QUICK_COUNTS.map((n) => (
                        <button key={n} type="button" className={`btn btn-sm ${desiredCount === String(n) ? "btn-primary" : "btn-secondary"}`} onClick={() => setDesiredCount(String(n))}>
                            {n}
                        </button>
                    ))}
                </div>

                <div className="form-group" style={{ maxWidth: "160px" }}>
                    <label htmlFor="ecs-desired-count">Desired Count</label>
                    <input
                        id="ecs-desired-count"
                        type="number" min="0" className="form-control"
                        value={desiredCount}
                        onChange={(e) => setDesiredCount(e.target.value)}
                    />
                </div>

                <button type="button" className="btn btn-primary" onClick={handleScaleClick} disabled={scaling || desiredCount === ""}>
                    {scaling ? "Applying..." : "Apply"}
                </button>

            </div>

            {runningImage?.image && (

                <div className="card">

                    <h3 className="settings-subhead" style={{ marginTop: 0 }}>Running Image</h3>

                    <p className="smoke-test-metric-mono">{runningImage.image}</p>

                    {runningImage.isEcr && (

                        <div className="cloud-service-connection-grid" style={{ marginTop: "8px" }}>
                            <div><p className="field-hint" style={{ margin: 0 }}>Repository</p><p>{runningImage.repository}</p></div>
                            <div><p className="field-hint" style={{ margin: 0 }}>Tag</p><p>{runningImage.tag}</p></div>
                            <div><p className="field-hint" style={{ margin: 0 }}>Digest</p><p className="smoke-test-metric-mono">{runningImage.digest ? `${runningImage.digest.slice(0, 20)}...` : "—"}</p></div>
                            <div><p className="field-hint" style={{ margin: 0 }}>Pushed</p><p>{runningImage.pushedAt ? new Date(runningImage.pushedAt).toLocaleString() : "—"}</p></div>
                        </div>

                    )}

                </div>

            )}

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
                                <LineChart points={series.points} unit="%" />
                            </div>
                        ))}
                    </div>

                )}

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Tasks</h3>

                {detail.tasks.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No running tasks.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Task</th>
                                    <th>Status</th>
                                    <th>Health</th>
                                    <th>Container / Image</th>
                                    <th>CPU</th>
                                    <th>Memory</th>
                                    <th>AZ</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>

                            <tbody>

                                {detail.tasks.map((t) => (

                                    <tr key={t.taskId}>
                                        <td className="table-row-clickable smoke-test-metric-mono" onClick={() => setSelectedTask(t)}>{t.taskId.slice(0, 12)}...</td>
                                        <td><StateBadge state={t.lastStatus} /></td>
                                        <td>{t.healthStatus || "—"}</td>
                                        <td>{t.containers?.[0]?.name}: {t.containers?.[0]?.image?.split("/").pop() || "—"}</td>
                                        <td>{t.cpu || "—"}</td>
                                        <td>{t.memory || "—"}</td>
                                        <td>{t.availabilityZone || "—"}</td>
                                        <td>
                                            <button type="button" className="btn btn-sm btn-danger" onClick={() => setStopTarget(t)}>Stop</button>
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

            <EcsTaskDetailDialog cluster={clusterName} task={selectedTask} onClose={() => setSelectedTask(null)} />

            <ConfirmDialog
                open={zeroConfirmOpen}
                title="Stop all desired tasks?"
                message="This will stop all desired tasks for this service."
                confirmLabel="Confirm"
                danger
                onConfirm={() => applyScale(0)}
                onCancel={() => setZeroConfirmOpen(false)}
            />

            <ConfirmDialog
                open={restartConfirmOpen}
                title="Restart all tasks?"
                message="This forces a new deployment, replacing every running task in this service with a fresh one from the current task definition."
                confirmLabel="Restart"
                onConfirm={handleRestart}
                onCancel={() => setRestartConfirmOpen(false)}
            />

            <ConfirmDialog
                open={!!stopTarget}
                title="Stop this task?"
                message={stopTarget ? `The service scheduler will replace ${stopTarget.taskId.slice(0, 12)}... if the desired count still calls for it.` : ""}
                confirmLabel={stopping ? "Stopping..." : "Stop Task"}
                danger
                onConfirm={handleStopConfirm}
                onCancel={() => setStopTarget(null)}
            />

        </>

    );

}

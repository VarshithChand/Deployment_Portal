import { useEffect, useState } from "react";

import { getMyAwsEcsDetail } from "../../services/settingsService";
import { scaleEcsService } from "../../services/cloudServicesService";
import usePagination from "../../hooks/usePagination";
import useToast from "../../hooks/useToast";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import StateBadge from "./StateBadge";

const PAGE_SIZE = 10;

// One GetEcsDetailAsync call already returns every cluster and every
// service within each (see CloudStatusService) - the cluster list, one
// cluster's detail, and one service's detail below are all just different
// slices of that same fetch, not three separate API calls.
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
        return <EcsServiceDetail cluster={cluster} service={service} onScaled={load} />;
    }

    if (cluster) {
        return (
            <EcsClusterDetail
                cluster={cluster}
                onSelectService={(serviceName) => onNavigate({ service: "ecs", cluster: cluster.clusterName, ecsService: serviceName })}
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

function EcsClusterDetail({ cluster, onSelectService }) {

    const [search, setSearch] = useState("");

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

                {filtered.length === 0 ? (

                    <p className="empty-state">No services in this cluster.</p>

                ) : (

                    <>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
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

                                        <tr key={s.serviceName} className="table-row-clickable" onClick={() => onSelectService(s.serviceName)}>
                                            <td>{s.serviceName}</td>
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

        </>

    );

}

function EcsServiceDetail({ cluster, service, onScaled }) {

    const toast = useToast();
    const [desiredCount, setDesiredCount] = useState(service.desiredCount);
    const [scaling, setScaling] = useState(false);

    async function handleScale() {

        setScaling(true);

        try {

            const result = await scaleEcsService(cluster.clusterName, service.serviceName, desiredCount);

            if (result.success) {
                toast.show(result.message || "Scale requested — waiting for AWS...", "success");
                onScaled();
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

        }

    }

    return (

        <div className="card">

            <h2 className="card-title">{cluster.clusterName} / {service.serviceName}</h2>

            <div className="cloud-service-stat-grid" style={{ marginTop: "12px" }}>
                <div className="cloud-service-stat-tile"><span>Desired Count</span><strong>{service.desiredCount}</strong></div>
                <div className="cloud-service-stat-tile"><span>Running Count</span><strong>{service.runningCount}</strong></div>
                <div className="cloud-service-stat-tile"><span>Pending Count</span><strong>{service.pendingCount}</strong></div>
            </div>

            <div className="info-row">
                <span>Task Definition</span>
                <strong className="smoke-test-metric-mono">{service.taskDefinition || "—"}</strong>
            </div>

            <div className="info-row">
                <span>Deployment Status</span>
                <strong>{service.deploymentStatus ? <StateBadge state={service.deploymentStatus} /> : "—"}</strong>
            </div>

            <h3 className="settings-subhead">Scale Service</h3>

            <div className="form-group" style={{ maxWidth: "160px" }}>
                <label>Desired Count</label>
                <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={desiredCount}
                    onChange={(e) => setDesiredCount(Math.max(0, Number(e.target.value)))}
                />
            </div>

            <button type="button" className="btn btn-primary" onClick={handleScale} disabled={scaling}>
                {scaling ? "Applying..." : "Apply"}
            </button>

            <p className="field-hint" style={{ marginTop: "14px" }}>
                Redeploy (forcing a new deployment of the current task definition) isn't implemented in
                the Deployment Portal yet — use <strong>Open AWS Console</strong> above for that.
            </p>

        </div>

    );

}

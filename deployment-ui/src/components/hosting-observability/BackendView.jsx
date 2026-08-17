import { useEffect, useState } from "react";

import { getBackendOverview, getEndpointInventory, getDatabaseOverview } from "../../services/hostingObservabilityService";
import LoadingSpinner from "../LoadingSpinner";
import LineChart from "../charts/LineChart";
import RangeSelector from "./RangeSelector";
import ConnectionMap from "./ConnectionMap";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";

const PROVIDER_LABEL = { render: "Render", cloudflare: "Cloudflare Pages", netlify: "Netlify", vercel: "Vercel" };

// Backend tab - mirrors FrontendView's shape (same overview contract, see
// HostingObservabilityController.GetBackend), plus this tab's own two
// extras: the reflected endpoint inventory (real registered ASP.NET Core
// routes - no live health/response-time yet, see
// HostingEndpointInventoryItemDto) and a Backend -> Database connection
// summary, which only ever shows DatabaseInspectionHealthDto.MaskedConnection
// (host:port/db) - never DATABASE_URL/username/password.
export default function BackendView() {

    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState("1h");

    const [endpoints, setEndpoints] = useState([]);
    const [endpointsLoading, setEndpointsLoading] = useState(true);

    const [dbHealth, setDbHealth] = useState(null);

    function refresh(currentRange) {

        setLoading(true);

        getBackendOverview(currentRange).then((data) => {
            setOverview(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setLoading(false);
        });

    }

    useEffect(() => { refresh(range); }, [range]);

    useEffect(() => {

        getEndpointInventory().then((data) => {
            setEndpoints(Array.isArray(data) ? data : []);
            setEndpointsLoading(false);
        }).catch(() => setEndpointsLoading(false));

        getDatabaseOverview("1h").then((data) => setDbHealth(data.health)).catch(() => {});

    }, []);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(endpoints, 10);

    if (loading) return <LoadingSpinner />;

    if (!overview?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    No backend target configured yet. An administrator can set one up in{" "}
                    Settings → Hosting Observability.
                </p>
            </div>
        );

    }

    const providerLabel = PROVIDER_LABEL[overview.provider] || overview.provider || "—";
    const cpuSeries = overview.metrics?.series?.find((s) => s.name === "cpu");
    const memSeries = overview.metrics?.series?.find((s) => s.name === "memory");

    return (

        <>

        <div className="card">

            <h2 className="card-title">
                {providerLabel}
                {" "}
                <span className={`badge ${overview.found ? "badge-success" : "badge-warning"}`}>
                    {overview.found ? "Connected" : "Unreachable"}
                </span>
            </h2>

            {!overview.found && (
                <p className="error-message">{overview.error || `Unable to reach ${providerLabel} right now.`}</p>
            )}

            {overview.found && (

                <div className="cloud-service-stat-grid">

                    <div className="cloud-service-stat-tile">
                        <span>Service</span>
                        <strong>{overview.serviceName || "—"}</strong>
                    </div>

                    <div className="cloud-service-stat-tile">
                        <span>Type</span>
                        <strong>{overview.type || "—"}</strong>
                    </div>

                    <div className="cloud-service-stat-tile">
                        <span>Status</span>
                        <strong>{overview.status || "—"}</strong>
                    </div>

                    <div className="cloud-service-stat-tile">
                        <span>Plan</span>
                        <strong>{overview.plan || "N/A"}</strong>
                    </div>

                    <div className="cloud-service-stat-tile">
                        <span>Commit</span>
                        <strong className="smoke-test-metric-mono">
                            {overview.commitSha ? overview.commitSha.slice(0, 7) : "N/A"}
                        </strong>
                    </div>

                    <div className="cloud-service-stat-tile">
                        <span>Updated</span>
                        <strong>{overview.updatedAt ? new Date(overview.updatedAt).toLocaleString() : "N/A"}</strong>
                    </div>

                </div>

            )}

            {overview.found && overview.url && (
                <p className="field-hint" style={{ marginTop: "10px" }}>
                    <a href={overview.url} target="_blank" rel="noreferrer">{overview.url}</a>
                </p>
            )}

            <div className="button-row" style={{ marginTop: "14px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => refresh(range)}>Refresh</button>
            </div>

        </div>

        {overview.found && (

            <div className="card" style={{ marginTop: "18px" }}>

                <h2 className="card-title">CPU / Memory</h2>

                <RangeSelector value={range} onChange={setRange} />

                {overview.metrics?.found ? (

                    <div className="chart-row">

                        <div>
                            <p className="field-hint">CPU (%)</p>
                            <LineChart points={cpuSeries?.points || []} unit="%" color="var(--viz-series-1)" />
                        </div>

                        <div>
                            <p className="field-hint">Memory (bytes)</p>
                            <LineChart points={memSeries?.points || []} unit=" B" color="var(--viz-series-2)" />
                        </div>

                    </div>

                ) : (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        CPU/memory metrics are not exposed by this hosting provider for this resource.
                    </p>

                )}

            </div>

        )}

        <div className="card" style={{ marginTop: "18px" }}>

            <h2 className="card-title">Endpoint Inventory</h2>

            <p className="field-hint" style={{ marginBottom: "12px" }}>
                Live registered routes on this backend. Health and average response time aren't
                tracked yet — that needs request-level telemetry this portal doesn't collect today.
            </p>

            {endpointsLoading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <>

                <div className="table-scroll">

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Path</th>
                                <th>Controller</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((e, i) => (

                                <tr key={`${e.method}:${e.path}:${i}`}>
                                    <td><span className="badge badge-secondary">{e.method}</span></td>
                                    <td className="smoke-test-metric-mono">{e.path}</td>
                                    <td>{e.controller}</td>
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

        <div className="card" style={{ marginTop: "18px" }}>

            <h2 className="card-title">Database Connection</h2>

            {dbHealth ? (

                <p className="field-hint">
                    {dbHealth.connected
                        ? <>Connected — <span className="smoke-test-metric-mono">{dbHealth.maskedConnection || "N/A"}</span></>
                        : (dbHealth.error || "Not connected.")}
                </p>

            ) : (
                <p className="field-hint">Loading...</p>
            )}

        </div>

        <div className="card" style={{ marginTop: "18px" }}>

            <h2 className="card-title">Connections</h2>

            <ConnectionMap
                nodes={[
                    { label: "Frontend", sub: "This portal's UI" },
                    { label: "Backend", sub: providerLabel },
                    { label: "Database", sub: "PostgreSQL" }
                ]}
            />

        </div>

        </>

    );

}

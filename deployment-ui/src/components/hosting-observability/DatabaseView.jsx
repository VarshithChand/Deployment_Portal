import { useEffect, useState } from "react";

import { getDatabaseOverview } from "../../services/hostingObservabilityService";
import LoadingSpinner from "../LoadingSpinner";
import LineChart from "../charts/LineChart";
import RangeSelector from "./RangeSelector";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";

// Database tab - whichever Postgres instance is explicitly connected on
// Settings → Credentials → Database (never an automatic DATABASE_URL
// fallback, even for the super-admin - see HostingObservabilityController.
// GetDatabase), reusing DatabaseManagementService's existing health/table
// queries plus the pg_stat_activity-based connection pool count.
// CPU/Memory/Storage graphs
// only render if the admin has additionally linked this database to a
// Render-managed resource in Settings → Hosting Observability - otherwise
// the spec-required literal fallback text is shown, never a fabricated
// number. Never renders DATABASE_URL/username/password - only the masked
// host:port/db already established by DatabaseInspectionHealthDto.
export default function HostingDatabaseView() {

    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState("1h");

    function refresh(currentRange) {

        setLoading(true);

        getDatabaseOverview(currentRange).then((data) => {
            setOverview(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setLoading(false);
        });

    }

    useEffect(() => { refresh(range); }, [range]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(overview?.tables || [], 10);

    if (loading) return <LoadingSpinner />;

    if (!overview) {
        return (
            <div className="card">
                <p className="error-message">Unable to load database information right now.</p>
            </div>
        );
    }

    const health = overview.health;
    const pool = overview.connectionPool;
    const poolPct = pool && pool.maxConnections > 0 ? Math.min(100, (pool.totalConnections / pool.maxConnections) * 100) : null;
    const poolTone = poolPct === null ? "good" : poolPct >= 90 ? "critical" : poolPct >= 70 ? "warning" : "good";

    const cpuSeries = overview.metrics?.series?.find((s) => s.name === "cpu");
    const memSeries = overview.metrics?.series?.find((s) => s.name === "memory");

    return (

        <>

        <div className="card">

            <h2 className="card-title">
                PostgreSQL{overview.providerLabel ? ` — ${overview.providerLabel}` : ""}
                {" "}
                <span className={`badge ${health.connected ? "badge-success" : "badge-danger"}`}>
                    {health.connected ? "Connected" : "Unreachable"}
                </span>
            </h2>

            {!health.connected && (
                <p className="error-message">{health.error || "Unable to connect to the database."}</p>
            )}

            {health.connected && (

                <>

                <div className="cloud-service-stat-grid">

                    <div className="cloud-service-stat-tile">
                        <span>Database</span>
                        <strong>{health.databaseName || "—"}</strong>
                    </div>

                    <div className="cloud-service-stat-tile">
                        <span>Size</span>
                        <strong>{health.databaseSizePretty || "—"}</strong>
                    </div>

                    <div className="cloud-service-stat-tile">
                        <span>Tables</span>
                        <strong>{health.tableCount}</strong>
                    </div>

                    <div className="cloud-service-stat-tile">
                        <span>Latency</span>
                        <strong>{health.latencyMs} ms</strong>
                    </div>

                </div>

                <p className="field-hint" style={{ marginTop: "12px" }}>
                    {health.maskedConnection}{health.version ? ` — ${health.version}` : ""}
                </p>

                </>

            )}

            <div className="button-row" style={{ marginTop: "14px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => refresh(range)}>Refresh</button>
            </div>

        </div>

        {health.connected && (

            <div className="card" style={{ marginTop: "18px" }}>

                <h2 className="card-title">Connections</h2>

                {pool ? (

                    <>

                    <div className="meter">

                        <div className="meter-header">
                            <span>Active + idle connections</span>
                            <span className="meter-value">{pool.totalConnections} / {pool.maxConnections}</span>
                        </div>

                        <div className="meter-track">
                            <div className={`meter-fill meter-fill-${poolTone}`} style={{ width: `${poolPct}%` }} />
                        </div>

                    </div>

                    <div className="cloud-service-stat-grid" style={{ marginTop: "12px" }}>

                        <div className="cloud-service-stat-tile">
                            <span>Active</span>
                            <strong>{pool.activeConnections}</strong>
                        </div>

                        <div className="cloud-service-stat-tile">
                            <span>Idle</span>
                            <strong>{pool.idleConnections}</strong>
                        </div>

                        <div className="cloud-service-stat-tile">
                            <span>Max</span>
                            <strong>{pool.maxConnections}</strong>
                        </div>

                    </div>

                    </>

                ) : (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Metric unavailable from this database provider.
                    </p>

                )}

            </div>

        )}

        <div className="card" style={{ marginTop: "18px" }}>

            <h2 className="card-title">CPU / Memory / Storage</h2>

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
                    {overview.metricsUnavailableReason || "Metric unavailable from this database provider."}
                </p>

            )}

        </div>

        <div className="card" style={{ marginTop: "18px" }}>

            <h2 className="card-title">Tables</h2>

            <p className="field-hint" style={{ marginBottom: "12px" }}>
                Table summary only — row contents aren't shown here.
            </p>

            {overview.tables.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left" }}>No tables found.</p>

            ) : (

                <>

                <div className="table-scroll">

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Schema</th>
                                <th>Table</th>
                                <th>Rows (approx.)</th>
                                <th>Size</th>
                                <th>Columns</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((t, i) => (

                                <tr key={`${t.schema}.${t.name}:${i}`}>
                                    <td>{t.schema}</td>
                                    <td>{t.name}</td>
                                    <td>{t.approxRowCount}</td>
                                    <td>{t.sizePretty || "—"}</td>
                                    <td>{t.columnCount}</td>
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

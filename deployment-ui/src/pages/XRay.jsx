import { useEffect, useMemo, useState } from "react";

import { getXRayOverview } from "../services/observabilityService";
import AWS_REGIONS from "../data/awsRegions";
import usePagination from "../hooks/usePagination";
import PageLayout from "../components/layout/PageLayout";
import ComboBox from "../components/common/ComboBox";
import Pagination from "../components/common/Pagination";
import StatTile from "../components/charts/StatTile";
import DonutChart from "../components/charts/DonutChart";
import BarChart from "../components/charts/BarChart";

const PAGE_SIZE = 10;

function traceHealth(trace) {
    if (trace.hasFault) return "Fault";
    if (trace.hasError) return "Error";
    if (trace.hasThrottle) return "Throttled";
    return "OK";
}

function TraceFlags({ trace }) {

    if (trace.hasFault) return <span className="badge badge-danger">Fault</span>;
    if (trace.hasError) return <span className="badge badge-warning">Error</span>;
    if (trace.hasThrottle) return <span className="badge badge-secondary">Throttled</span>;

    return <span className="badge badge-success">OK</span>;

}

// Same status color job as CloudWatch's own alarm states - OK is good,
// Error is warning, Fault is critical (a fault is a 5xx/server-side
// failure, more severe than a 4xx client error), Throttled is neutral
// (rate-limited, not necessarily broken).
function healthColor(health) {

    if (health === "OK") return "var(--viz-good)";
    if (health === "Error") return "var(--viz-warning)";
    if (health === "Fault") return "var(--viz-critical)";

    return "var(--viz-muted)";

}

// Observability's AWS X-Ray page - real data, reusing this session's
// existing AWS credential. Last 6 hours of trace summaries only (see
// ObservabilityService.GetXRayOverviewAsync) - a glance at recent request
// health, not a full trace explorer/service map.
export default function XRay() {

    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedRegion, setSelectedRegion] = useState(null);

    function load(region) {

        setLoading(true);

        getXRayOverview(region ?? selectedRegion).then((data) => {
            setOverview(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setOverview({ configured: false, error: err.response?.data?.message || "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    function handleRegionChange(region) {
        setSelectedRegion(region || null);
        load(region || null);
    }

    const traces = useMemo(() => overview?.traces || [], [overview]);

    const healthBreakdown = useMemo(() => {

        const counts = new Map();

        traces.forEach((t) => {
            const health = traceHealth(t);
            counts.set(health, (counts.get(health) || 0) + 1);
        });

        return Array.from(counts.entries()).map(([label, value]) => ({
            label, value, color: healthColor(label)
        }));

    }, [traces]);

    const slowestTraces = useMemo(() => {

        return [...traces]
            .filter((t) => t.responseTime != null)
            .sort((a, b) => b.responseTime - a.responseTime)
            .slice(0, 5)
            .map((t) => ({
                label: t.url || t.id.slice(0, 12),
                value: t.responseTime * 1000,
                detail: `${(t.responseTime * 1000).toFixed(0)}ms`
            }));

    }, [traces]);

    const errorRate = traces.length > 0
        ? (traces.filter((t) => t.hasError || t.hasFault).length / traces.length * 100).toFixed(1)
        : "0.0";

    const avgResponseMs = traces.length > 0
        ? (traces.reduce((sum, t) => sum + (t.responseTime || 0), 0) / traces.length * 1000).toFixed(0)
        : "0";

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(traces, PAGE_SIZE);

    return (

        <PageLayout title="X-Ray">

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                AWS X-Ray trace summaries from the last 6 hours for this session's connected AWS account.
            </p>

            <div className="card">

                {overview?.configured && (

                    <div className="form-group cloud-provider-select-group">
                        <label>Region</label>
                        <ComboBox
                            options={AWS_REGIONS}
                            value={selectedRegion || overview.region || ""}
                            onChange={handleRegionChange}
                            placeholder={overview.region || "us-east-1"}
                        />
                    </div>

                )}

                {loading ? (

                    <p className="empty-state">Loading X-Ray traces...</p>

                ) : !overview?.configured ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Enter your AWS credentials in Settings → Credentials → AWS to see X-Ray traces here.
                    </p>

                ) : overview.error ? (

                    <p className="error-message">{overview.error}</p>

                ) : traces.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No traces in the last 6 hours.</p>

                ) : (

                    <>

                        <h3 className="settings-subhead" style={{ marginTop: 0 }}>Analysis</h3>

                        <div className="stat-grid" style={{ marginBottom: "18px" }}>
                            <StatTile label="Total traces" value={traces.length} />
                            <StatTile
                                label="Error rate"
                                value={`${errorRate}%`}
                                tone={Number(errorRate) > 0 ? "critical" : "good"}
                            />
                            <StatTile label="Avg response time" value={`${avgResponseMs}ms`} />
                        </div>

                        <div className="chart-analysis-grid">

                            <div className="chart-analysis-card">
                                <h4>Traces by Health</h4>
                                <DonutChart data={healthBreakdown} />
                            </div>

                            <div className="chart-analysis-card">
                                <h4>Slowest Traces</h4>
                                <BarChart data={slowestTraces} showValues formatValue={(v) => `${v.toFixed(0)}ms`} />
                            </div>

                        </div>

                        <h3 className="settings-subhead" style={{ marginTop: "24px" }}>Recent Traces</h3>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Trace ID</th>
                                        <th>Status</th>
                                        <th>URL</th>
                                        <th>Response Time</th>
                                        <th>Started</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {pageItems.map((trace) => (

                                        <tr key={trace.id}>
                                            <td className="smoke-test-metric-mono">{trace.id.slice(0, 16)}...</td>
                                            <td><TraceFlags trace={trace} /></td>
                                            <td>{trace.url || "—"}</td>
                                            <td>{trace.responseTime != null ? `${(trace.responseTime * 1000).toFixed(0)}ms` : "—"}</td>
                                            <td>{trace.startTime ? new Date(trace.startTime).toLocaleString() : "—"}</td>
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

        </PageLayout>

    );

}

import { useEffect, useState } from "react";

import { getFrontendOverview } from "../../services/hostingObservabilityService";
import LoadingSpinner from "../LoadingSpinner";
import LineChart from "../charts/LineChart";
import RangeSelector from "./RangeSelector";
import ConnectionMap from "./ConnectionMap";

const PROVIDER_LABEL = { render: "Render", cloudflare: "Cloudflare Pages", netlify: "Netlify", vercel: "Vercel" };

// Frontend tab of the Hosting Providers observability dashboard - the
// portal's own configured frontend deployment target (see
// HostingObservabilityController.GetFrontend / PortalDeploymentTargetsDto),
// not any visitor's personal account. Every field either comes back real
// (Configured/Found/Error tri-state, same contract as PaasProviderStatusDto)
// or is left blank/shown as an explicit unavailable message - never guessed.
export default function FrontendView() {

    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState("1h");

    function refresh(currentRange) {

        setLoading(true);

        getFrontendOverview(currentRange).then((data) => {
            setOverview(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setLoading(false);
        });

    }

    useEffect(() => { refresh(range); }, [range]);

    if (loading) return <LoadingSpinner />;

    if (!overview?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    No frontend target configured yet. An administrator can set one up in{" "}
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
                        <span>Project</span>
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

            <h2 className="card-title">Connections</h2>

            <ConnectionMap
                nodes={[
                    { label: "Frontend", sub: providerLabel },
                    { label: "Backend", sub: "This portal's API" },
                    { label: "Database", sub: "PostgreSQL" }
                ]}
            />

        </div>

        </>

    );

}

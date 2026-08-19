import { useEffect, useMemo, useState } from "react";

import { getCloudMonitoringOverview } from "../services/observabilityService";
import PageLayout from "../components/layout/PageLayout";
import StatTile from "../components/charts/StatTile";
import DonutChart from "../components/charts/DonutChart";
import BarChart from "../components/charts/BarChart";

// Observability's GCP Cloud Monitoring page - real data, reusing this
// session's existing GCP service-account credential (same JWT-bearer
// exchange Artifact Registry already uses). Alert Policies + Uptime
// Checks in one page (see ObservabilityService.GetCloudMonitoringOverviewAsync)
// - a glance at what's configured to watch this project, not a full
// metrics explorer/dashboard.
export default function CloudMonitoring() {

    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);

    function load() {

        setLoading(true);

        getCloudMonitoringOverview().then((data) => {
            setOverview(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setOverview({ configured: false, error: err.response?.data?.message || "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(load, []);

    const alertPolicies = useMemo(() => overview?.alertPolicies || [], [overview]);
    const uptimeChecks = useMemo(() => overview?.uptimeChecks || [], [overview]);

    const enabledCount = alertPolicies.filter((p) => p.enabled).length;

    const alertPolicyBreakdown = useMemo(() => ([
        { label: "Enabled", value: enabledCount, color: "var(--viz-good)" },
        { label: "Disabled", value: alertPolicies.length - enabledCount, color: "var(--viz-muted)" }
    ]), [alertPolicies, enabledCount]);

    const uptimeChecksByType = useMemo(() => {

        const counts = new Map();

        uptimeChecks.forEach((c) => {
            const type = c.monitoredResourceType || "Unknown";
            counts.set(type, (counts.get(type) || 0) + 1);
        });

        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([label, value]) => ({ label, value }));

    }, [uptimeChecks]);

    return (

        <PageLayout title="Cloud Monitoring">

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                Alert policies and uptime checks for this session's connected GCP project.
            </p>

            <div className="card">

                {loading ? (

                    <p className="empty-state">Loading Cloud Monitoring...</p>

                ) : !overview?.configured ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Enter your GCP credentials (Project ID and service account key) in Settings →
                        Credentials → GCP to see Cloud Monitoring here.
                    </p>

                ) : overview.error ? (

                    <p className="error-message">{overview.error}</p>

                ) : (

                    <>

                        <h3 className="settings-subhead" style={{ marginTop: 0 }}>Analysis</h3>

                        <div className="stat-grid" style={{ marginBottom: "18px" }}>
                            <StatTile label="Alert policies" value={alertPolicies.length} />
                            <StatTile label="Enabled" value={enabledCount} tone="good" />
                            <StatTile label="Uptime checks" value={uptimeChecks.length} />
                        </div>

                        <div className="chart-analysis-grid">

                            <div className="chart-analysis-card">
                                <h4>Alert Policies: Enabled vs Disabled</h4>
                                <DonutChart data={alertPolicyBreakdown} />
                            </div>

                            <div className="chart-analysis-card">
                                <h4>Uptime Checks by Resource Type</h4>
                                <BarChart data={uptimeChecksByType} showValues />
                            </div>

                        </div>

                        <h3 className="settings-subhead" style={{ marginTop: "24px" }}>Alert Policies</h3>

                        {alertPolicies.length === 0 ? (

                            <p className="empty-state" style={{ textAlign: "left" }}>No alert policies found.</p>

                        ) : (

                            <div className="table-scroll">

                                <table className="table">

                                    <thead>
                                        <tr>
                                            <th>Policy</th>
                                            <th>Enabled</th>
                                            <th>Combiner</th>
                                        </tr>
                                    </thead>

                                    <tbody>

                                        {alertPolicies.map((policy) => (

                                            <tr key={policy.name}>
                                                <td>{policy.displayName || policy.name}</td>
                                                <td>
                                                    <span className={`badge ${policy.enabled ? "badge-success" : "badge-secondary"}`}>
                                                        {policy.enabled ? "Enabled" : "Disabled"}
                                                    </span>
                                                </td>
                                                <td>{policy.combinerCondition || "—"}</td>
                                            </tr>

                                        ))}

                                    </tbody>

                                </table>

                            </div>

                        )}

                        <h3 className="settings-subhead" style={{ marginTop: "24px" }}>Uptime Checks</h3>

                        {uptimeChecks.length === 0 ? (

                            <p className="empty-state" style={{ textAlign: "left" }}>No uptime checks found.</p>

                        ) : (

                            <div className="table-scroll">

                                <table className="table">

                                    <thead>
                                        <tr>
                                            <th>Check</th>
                                            <th>Resource Type</th>
                                            <th>Interval</th>
                                        </tr>
                                    </thead>

                                    <tbody>

                                        {uptimeChecks.map((check) => (

                                            <tr key={check.name}>
                                                <td>{check.displayName || check.name}</td>
                                                <td>{check.monitoredResourceType || "—"}</td>
                                                <td>{check.periodSeconds ? `${check.periodSeconds}s` : "—"}</td>
                                            </tr>

                                        ))}

                                    </tbody>

                                </table>

                            </div>

                        )}

                    </>

                )}

            </div>

        </PageLayout>

    );

}

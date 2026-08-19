import { useEffect, useMemo, useState } from "react";

import { getAzureMonitorOverview } from "../services/observabilityService";
import usePagination from "../hooks/usePagination";
import PageLayout from "../components/layout/PageLayout";
import Pagination from "../components/common/Pagination";
import StatTile from "../components/charts/StatTile";
import DonutChart from "../components/charts/DonutChart";
import BarChart from "../components/charts/BarChart";

const PAGE_SIZE = 10;

// Activity Log status -> the app's own status color job - Succeeded is
// good, Failed is critical, an in-flight state (Started/Accepted/Running)
// is warning (not yet resolved either way), anything else is neutral.
function activityStatusColor(status) {

    const value = (status || "").toLowerCase();

    if (value === "succeeded") return "var(--viz-good)";
    if (value === "failed") return "var(--viz-critical)";
    if (value === "started" || value === "accepted" || value === "running") return "var(--viz-warning)";

    return "var(--viz-muted)";

}

function ResourceList({ title, items }) {

    return (

        <>
            <h3 className="settings-subhead" style={{ marginTop: "24px" }}>{title}</h3>

            {items.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left" }}>None found.</p>

            ) : (

                <ul className="cloud-service-detail-list">
                    {items.map((item, index) => (
                        <li key={index}>
                            {item.name}
                            {item.detail && <span className="field-hint"> — {item.detail}</span>}
                        </li>
                    ))}
                </ul>

            )}

        </>

    );

}

// Observability's Azure Monitor page - real data, reusing this session's
// existing Azure credential. Log Analytics Workspaces and Application
// Insights components are pulled from the same account-wide ARM
// inventory Cloud Services' own Azure page already fetches (see
// ObservabilityService.GetAzureMonitorOverviewAsync); Recent Activity is
// a separate call to ARM's own Activity Log API, the last 24 hours only -
// a glance at what changed recently, not a full audit log viewer.
export default function AzureMonitor() {

    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);

    function load() {

        setLoading(true);

        getAzureMonitorOverview().then((data) => {
            setOverview(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setOverview({ configured: false, error: err.response?.data?.message || "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(load, []);

    const activity = useMemo(() => overview?.recentActivity || [], [overview]);
    const workspaces = useMemo(() => overview?.logAnalyticsWorkspaces || [], [overview]);
    const appInsights = useMemo(() => overview?.applicationInsights || [], [overview]);

    const resourceComposition = useMemo(() => ([
        { label: "Log Analytics Workspaces", value: workspaces.length, color: "var(--viz-series-1)" },
        { label: "Application Insights", value: appInsights.length, color: "var(--viz-series-2)" }
    ]), [workspaces, appInsights]);

    const activityStatusBreakdown = useMemo(() => {

        const counts = new Map();

        activity.forEach((a) => {
            const status = a.status || "Unknown";
            counts.set(status, (counts.get(status) || 0) + 1);
        });

        return Array.from(counts.entries()).map(([label, value]) => ({
            label, value, color: activityStatusColor(label)
        }));

    }, [activity]);

    const topOperations = useMemo(() => {

        const counts = new Map();

        activity.forEach((a) => {
            const op = a.operationName || "Unknown operation";
            counts.set(op, (counts.get(op) || 0) + 1);
        });

        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([label, value]) => ({ label, value }));

    }, [activity]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(activity, PAGE_SIZE);

    return (

        <PageLayout title="Azure Monitor">

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                Log Analytics Workspaces, Application Insights, and recent activity for this session's
                connected Azure subscription.
            </p>

            <div className="card">

                {loading ? (

                    <p className="empty-state">Loading Azure Monitor...</p>

                ) : !overview?.configured ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Enter your Azure credentials (including a Subscription ID) in Settings → Credentials
                        → Azure to see Azure Monitor here.
                    </p>

                ) : overview.error && !overview.logAnalyticsWorkspaces?.length && !overview.applicationInsights?.length ? (

                    <p className="error-message">{overview.error}</p>

                ) : (

                    <>

                        {overview.error && (
                            <p className="field-hint field-hint-bad">{overview.error}</p>
                        )}

                        <h3 className="settings-subhead" style={{ marginTop: 0 }}>Analysis</h3>

                        <div className="stat-grid" style={{ marginBottom: "18px" }}>
                            <StatTile label="Workspaces" value={workspaces.length} />
                            <StatTile label="App Insights" value={appInsights.length} />
                            <StatTile label="Activity (24h)" value={activity.length} />
                            <StatTile
                                label="Failed"
                                value={activity.filter((a) => (a.status || "").toLowerCase() === "failed").length}
                                tone={activity.some((a) => (a.status || "").toLowerCase() === "failed") ? "critical" : "default"}
                            />
                        </div>

                        <div className="chart-analysis-grid">

                            <div className="chart-analysis-card">
                                <h4>Resource Composition</h4>
                                <DonutChart data={resourceComposition} />
                            </div>

                            <div className="chart-analysis-card">
                                <h4>Recent Activity by Status</h4>
                                <DonutChart data={activityStatusBreakdown} />
                            </div>

                            <div className="chart-analysis-card">
                                <h4>Top Operations (24h)</h4>
                                <BarChart data={topOperations} showValues />
                            </div>

                        </div>

                        <ResourceList title="Log Analytics Workspaces" items={overview.logAnalyticsWorkspaces || []} />

                        <ResourceList title="Application Insights" items={overview.applicationInsights || []} />

                        <h3 className="settings-subhead" style={{ marginTop: "24px" }}>Recent Activity (24h)</h3>

                        {activity.length === 0 ? (

                            <p className="empty-state" style={{ textAlign: "left" }}>No recent activity.</p>

                        ) : (

                            <>

                                <div className="table-scroll">

                                    <table className="table">

                                        <thead>
                                            <tr>
                                                <th>Operation</th>
                                                <th>Event</th>
                                                <th>Status</th>
                                                <th>When</th>
                                            </tr>
                                        </thead>

                                        <tbody>

                                            {pageItems.map((entry, index) => (

                                                <tr key={index}>
                                                    <td>{entry.operationName || "—"}</td>
                                                    <td>{entry.eventName || "—"}</td>
                                                    <td>{entry.status || "—"}</td>
                                                    <td>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "—"}</td>
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

                    </>

                )}

            </div>

        </PageLayout>

    );

}

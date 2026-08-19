import { useEffect, useState } from "react";

import { getAzureMonitorOverview } from "../services/observabilityService";
import usePagination from "../hooks/usePagination";
import PageLayout from "../components/layout/PageLayout";
import Pagination from "../components/common/Pagination";

const PAGE_SIZE = 10;

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

    const activity = overview?.recentActivity || [];

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

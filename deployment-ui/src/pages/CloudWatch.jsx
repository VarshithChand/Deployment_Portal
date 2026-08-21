import { useEffect, useMemo, useState } from "react";

import { getCloudWatchOverview } from "../services/observabilityService";
import AWS_REGIONS from "../data/awsRegions";
import formatBytes from "../utils/formatBytes";
import usePagination from "../hooks/usePagination";
import PageLayout from "../components/layout/PageLayout";
import ComboBox from "../components/common/ComboBox";
import Pagination from "../components/common/Pagination";
import StateBadge from "../components/cloudServices/StateBadge";
import StatTile from "../components/charts/StatTile";
import DonutChart from "../components/charts/DonutChart";
import BarChart from "../components/charts/BarChart";

const PAGE_SIZE = 10;

// Alarm state -> the app's own status color, not a hand-picked hue - OK is
// good, ALARM is critical, INSUFFICIENT_DATA is a real "can't tell" state
// (warning, not silently folded into either extreme), anything else falls
// to the neutral/unknown token.
function alarmStateColor(state) {

    const value = (state || "").toLowerCase();

    if (value === "ok") return "var(--viz-good)";
    if (value === "alarm") return "var(--viz-critical)";
    if (value === "insufficient_data") return "var(--viz-warning)";

    return "var(--viz-muted)";

}

// Observability's AWS CloudWatch page - real data, reusing this
// session's existing AWS credential exactly like Cloud Services' own AWS
// pages do (no separate connection step). Alarms + Log Groups in one
// call (see ObservabilityService.GetCloudWatchOverviewAsync) - a glance
// at what's actually alarming and how much log volume exists, not a
// full metrics/dashboard/query builder.
export default function CloudWatch() {

    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedRegion, setSelectedRegion] = useState(null);

    function load(region) {

        setLoading(true);

        getCloudWatchOverview(region ?? selectedRegion).then((data) => {
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

    const alarms = useMemo(() => overview?.alarms || [], [overview]);
    const logGroups = useMemo(() => overview?.logGroups || [], [overview]);

    const alarmStateBreakdown = useMemo(() => {

        const counts = new Map();

        alarms.forEach((a) => {
            const state = a.state || "UNKNOWN";
            counts.set(state, (counts.get(state) || 0) + 1);
        });

        return Array.from(counts.entries()).map(([label, value]) => ({
            label, value, color: alarmStateColor(label)
        }));

    }, [alarms]);

    const topLogGroupsBySize = useMemo(() => {

        return [...logGroups]
            .filter((g) => g.storedBytes != null)
            .sort((a, b) => b.storedBytes - a.storedBytes)
            .slice(0, 5)
            .map((g) => ({ label: g.name, value: g.storedBytes, detail: formatBytes(g.storedBytes) }));

    }, [logGroups]);

    const totalStoredBytes = logGroups.reduce((sum, g) => sum + (g.storedBytes || 0), 0);

    const {
        page: alarmsPage, setPage: setAlarmsPage, pageCount: alarmsPageCount, pageItems: alarmsPageItems,
        totalCount: alarmsTotalCount, startIndex: alarmsStartIndex, endIndex: alarmsEndIndex
    } = usePagination(alarms, PAGE_SIZE);

    const {
        page: logsPage, setPage: setLogsPage, pageCount: logsPageCount, pageItems: logsPageItems,
        totalCount: logsTotalCount, startIndex: logsStartIndex, endIndex: logsEndIndex
    } = usePagination(logGroups, PAGE_SIZE);

    return (

        <PageLayout title="CloudWatch">

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                AWS CloudWatch alarms and log groups for this session's connected AWS account.
            </p>

            <div className="card">

                {overview?.configured && (

                    <div className="form-group cloud-provider-select-group">
                        <label htmlFor="cloudwatch-region">Region</label>
                        <ComboBox
                            id="cloudwatch-region"
                            options={AWS_REGIONS}
                            value={selectedRegion || overview.region || ""}
                            onChange={handleRegionChange}
                            placeholder={overview.region || "us-east-1"}
                        />
                    </div>

                )}

                {loading ? (

                    <p className="empty-state">Loading CloudWatch...</p>

                ) : !overview?.configured ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Enter your AWS credentials in Settings → Credentials → AWS to see CloudWatch here.
                    </p>

                ) : overview.error ? (

                    <p className="error-message">{overview.error}</p>

                ) : (

                    <>

                        <h3 className="settings-subhead" style={{ marginTop: 0 }}>Analysis</h3>

                        <div className="stat-grid" style={{ marginBottom: "18px" }}>
                            <StatTile label="Total alarms" value={alarms.length} />
                            <StatTile
                                label="In alarm"
                                value={alarms.filter((a) => (a.state || "").toLowerCase() === "alarm").length}
                                tone={alarms.some((a) => (a.state || "").toLowerCase() === "alarm") ? "critical" : "default"}
                            />
                            <StatTile label="Log groups" value={logGroups.length} />
                            <StatTile label="Total log volume" value={formatBytes(totalStoredBytes)} />
                        </div>

                        <div className="chart-analysis-grid">

                            <div className="chart-analysis-card">
                                <h4>Alarms by State</h4>
                                <DonutChart data={alarmStateBreakdown} />
                            </div>

                            <div className="chart-analysis-card">
                                <h4>Largest Log Groups</h4>
                                <BarChart data={topLogGroupsBySize} showValues formatValue={formatBytes} />
                            </div>

                        </div>

                        <h3 className="settings-subhead" style={{ marginTop: "24px" }}>Alarms</h3>

                        {alarms.length === 0 ? (

                            <p className="empty-state" style={{ textAlign: "left" }}>No alarms found.</p>

                        ) : (

                            <>

                                <div className="table-scroll">

                                    <table className="table">

                                        <thead>
                                            <tr>
                                                <th>Alarm</th>
                                                <th>State</th>
                                                <th>Metric</th>
                                                <th>Namespace</th>
                                                <th>Updated</th>
                                            </tr>
                                        </thead>

                                        <tbody>

                                            {alarmsPageItems.map((alarm) => (

                                                <tr key={alarm.name}>
                                                    <td>{alarm.name}</td>
                                                    <td><StateBadge state={alarm.state} /></td>
                                                    <td>{alarm.metricName || "—"}</td>
                                                    <td>{alarm.namespace || "—"}</td>
                                                    <td>{alarm.updatedAt ? new Date(alarm.updatedAt).toLocaleString() : "—"}</td>
                                                </tr>

                                            ))}

                                        </tbody>

                                    </table>

                                </div>

                                <Pagination
                                    page={alarmsPage}
                                    pageCount={alarmsPageCount}
                                    totalCount={alarmsTotalCount}
                                    startIndex={alarmsStartIndex}
                                    endIndex={alarmsEndIndex}
                                    onPageChange={setAlarmsPage}
                                />

                            </>

                        )}

                        <h3 className="settings-subhead" style={{ marginTop: "24px" }}>Log Groups</h3>

                        {logGroups.length === 0 ? (

                            <p className="empty-state" style={{ textAlign: "left" }}>No log groups found.</p>

                        ) : (

                            <>

                                <div className="table-scroll">

                                    <table className="table">

                                        <thead>
                                            <tr>
                                                <th>Log Group</th>
                                                <th>Size</th>
                                                <th>Retention</th>
                                                <th>Created</th>
                                            </tr>
                                        </thead>

                                        <tbody>

                                            {logsPageItems.map((group) => (

                                                <tr key={group.name}>
                                                    <td>{group.name}</td>
                                                    <td>{group.storedBytes != null ? formatBytes(group.storedBytes) : "—"}</td>
                                                    <td>{group.retentionDays ? `${group.retentionDays} days` : "Never expires"}</td>
                                                    <td>{group.createdAt ? new Date(group.createdAt).toLocaleDateString() : "—"}</td>
                                                </tr>

                                            ))}

                                        </tbody>

                                    </table>

                                </div>

                                <Pagination
                                    page={logsPage}
                                    pageCount={logsPageCount}
                                    totalCount={logsTotalCount}
                                    startIndex={logsStartIndex}
                                    endIndex={logsEndIndex}
                                    onPageChange={setLogsPage}
                                />

                            </>

                        )}

                    </>

                )}

            </div>

        </PageLayout>

    );

}

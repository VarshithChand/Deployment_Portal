import { useEffect, useState } from "react";

import { getCloudWatchOverview } from "../services/observabilityService";
import AWS_REGIONS from "../data/awsRegions";
import formatBytes from "../utils/formatBytes";
import usePagination from "../hooks/usePagination";
import PageLayout from "../components/layout/PageLayout";
import ComboBox from "../components/common/ComboBox";
import Pagination from "../components/common/Pagination";
import StateBadge from "../components/cloudServices/StateBadge";

const PAGE_SIZE = 10;

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

    const alarms = overview?.alarms || [];
    const logGroups = overview?.logGroups || [];

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

                    <p className="empty-state">Loading CloudWatch...</p>

                ) : !overview?.configured ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Enter your AWS credentials in Settings → Credentials → AWS to see CloudWatch here.
                    </p>

                ) : overview.error ? (

                    <p className="error-message">{overview.error}</p>

                ) : (

                    <>

                        <h3 className="settings-subhead" style={{ marginTop: 0 }}>Alarms</h3>

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

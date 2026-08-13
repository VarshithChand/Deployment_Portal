import { useState } from "react";

import usePolling from "../hooks/usePolling";
import { getWorkflowRuns } from "../services/historyService";

import LoadingSpinner from "../components/LoadingSpinner";
import RequireRepoSelected from "../components/RequireRepoSelected";
import PageLayout from "../components/layout/PageLayout";
import StatTile from "../components/charts/StatTile";
import Meter from "../components/charts/Meter";
import BarChart from "../components/charts/BarChart";

const TREND_DAYS = 14;

// Local calendar date, not toISOString() (which is UTC and shifts the day
// boundary for any timezone ahead of UTC).
function localDateKey(date) {

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;

}

function buildTrend(runs) {

    const days = [];
    const counts = new Map();

    for (let i = TREND_DAYS - 1; i >= 0; i--) {

        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);

        const key = localDateKey(d);

        days.push(key);
        counts.set(key, 0);

    }

    runs.forEach((run) => {

        const key = localDateKey(new Date(run.createdAt));

        if (counts.has(key)) {
            counts.set(key, counts.get(key) + 1);
        }

    });

    return days.map((key) => ({
        label: key.slice(5).replace("-", "/"),
        value: counts.get(key)
    }));

}

function buildBranchBreakdown(runs) {

    const counts = new Map();

    runs.forEach((run) => {

        const branch = run.branch || "unknown";
        counts.set(branch, (counts.get(branch) || 0) + 1);

    });

    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, value]) => ({ label, value }));

}

export default function Analytics() {

    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);

    async function load() {

        const data = await getWorkflowRuns();
        setRuns(Array.isArray(data) ? data : []);
        setLoading(false);

    }

    // 30s — GitHub's anonymous rate limit is only 60 requests/hour, and this
    // polls continuously for as long as the Analytics page stays open.
    usePolling(load, 30000);

    if (loading) {
        return <LoadingSpinner />;
    }

    const completed = runs.filter((r) => r.status === "completed");
    const successCount = completed.filter((r) => r.conclusion === "success").length;
    const failedCount = completed.length - successCount;
    const successRate = completed.length === 0 ? 0 : (successCount / completed.length) * 100;

    const trend = buildTrend(runs);
    const branchBreakdown = buildBranchBreakdown(runs);
    const topBranch = branchBreakdown[0]?.label || "-";

    return (

        <PageLayout title="Analytics">

            <RequireRepoSelected>

            <div className="stat-grid">

                <StatTile label="Total deployments" value={runs.length} />

                <StatTile label="Successful" value={successCount} tone="good" />

                <StatTile
                    label="Failed"
                    value={failedCount}
                    tone={failedCount > 0 ? "critical" : "default"}
                />

                <StatTile label="Most active branch" value={topBranch} />

            </div>

            <div className="card">

                <h2 className="card-title">
                    Success Rate
                </h2>

                <Meter
                    label={`${completed.length} completed run${completed.length === 1 ? "" : "s"}`}
                    value={successRate}
                />

            </div>

            <div className="chart-row">

                <div className="card">

                    <h2 className="card-title">
                        Deployments (last {TREND_DAYS} days)
                    </h2>

                    <BarChart data={trend} />

                </div>

                <div className="card">

                    <h2 className="card-title">
                        Top Branches
                    </h2>

                    {branchBreakdown.length === 0 ? (

                        <p className="empty-state">No deployments yet.</p>

                    ) : (

                        <BarChart
                            data={branchBreakdown}
                            showValues
                            color="var(--viz-series-2)"
                        />

                    )}

                </div>

            </div>

            </RequireRepoSelected>

        </PageLayout>

    );

}

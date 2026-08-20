import useAuth from "../../hooks/useAuth";
import useGithubDeploymentActivity from "../../hooks/useGithubDeploymentActivity";
import BarChart from "../charts/BarChart";
import DonutChart from "../charts/DonutChart";
import StatusBadge from "../StatusBadge";

const DAYS_SHOWN = 7;
const FAILURE_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "startup_failure", "action_required"]);

function dayLabel(date) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
}

// Real GitHub Actions run history for the last 7 days - shared with
// OverviewStats via useGithubDeploymentActivity (see that hook's own
// comment) so both cards ride one fetch instead of two. BarChart
// (runs/day) + DonutChart (outcome breakdown) rather than a multi-line
// chart - LineChart.jsx only ever plots one series (no dual-axis, an
// existing rule this app's chart components already follow), so two
// existing, unmodified components cover the same information without a
// new multi-series chart component built for one card.
export default function DeploymentActivityCard() {

    const { githubTokenConfigured } = useAuth();
    const { runs } = useGithubDeploymentActivity(githubTokenConfigured);

    if (runs === null) {
        return <div className="card"><p className="empty-state">Loading deployment activity...</p></div>;
    }

    if (runs.length === 0) {
        return null;
    }

    const now = new Date();

    const days = Array.from({ length: DAYS_SHOWN }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (DAYS_SHOWN - 1 - i));
        d.setHours(0, 0, 0, 0);
        return d;
    });

    const byDay = days.map((day) => {

        const next = new Date(day);
        next.setDate(next.getDate() + 1);

        const count = runs.filter((r) => {
            const t = new Date(r.createdAt);
            return t >= day && t < next;
        }).length;

        return { label: dayLabel(day), value: count };

    });

    const recentCutoff = new Date(now);
    recentCutoff.setDate(recentCutoff.getDate() - DAYS_SHOWN);
    const recentRuns = runs.filter((r) => new Date(r.createdAt) >= recentCutoff);

    const outcomeBreakdown = [
        { label: "Success", value: recentRuns.filter((r) => r.conclusion === "success").length, color: "var(--viz-good)" },
        { label: "Failed", value: recentRuns.filter((r) => FAILURE_CONCLUSIONS.has(r.conclusion)).length, color: "var(--viz-critical)" },
        { label: "In Progress", value: recentRuns.filter((r) => r.status === "in_progress" || r.status === "queued").length, color: "var(--viz-warning)" }
    ];

    return (

        <div className="card">

            <h2 className="card-title">Deployment Activity</h2>

            <div className="chart-analysis-grid">

                <div className="chart-analysis-card">
                    <h4>Runs per Day (Last {DAYS_SHOWN} Days)</h4>
                    <BarChart data={byDay} showValues />
                </div>

                <div className="chart-analysis-card">
                    <h4>Outcome Breakdown</h4>
                    <DonutChart data={outcomeBreakdown} />
                </div>

                <div className="chart-analysis-card">

                    <h4>Recent Deployments</h4>

                    <ul className="cloud-service-detail-list">
                        {runs.slice(0, 5).map((r) => (
                            <li key={`${r.repo}-${r.id}`}>
                                <span className="field-hint">{r.repo}</span> · {r.name}{" "}
                                <StatusBadge status={r.conclusion || r.status} />
                            </li>
                        ))}
                    </ul>

                </div>

            </div>

        </div>

    );

}

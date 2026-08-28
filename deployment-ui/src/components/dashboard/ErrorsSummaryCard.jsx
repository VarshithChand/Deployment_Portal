import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import useGithubDeploymentActivity from "../../hooks/useGithubDeploymentActivity";
import StatusBadge from "../StatusBadge";

// Same failure-conclusion set DeploymentActivityCard's own donut chart
// uses - kept in sync deliberately rather than each card guessing its own
// list of "this counts as a failure" strings.
const FAILURE_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "startup_failure", "action_required"]);

const MAX_SHOWN = 6;

// The Dashboard's "what's broken" panel - filters the SAME runs array
// DeploymentActivityCard already fetches (useGithubDeploymentActivity is
// one of the shared/deduped hooks - see Dashboard.jsx's own comment) down
// to failed/cancelled/timed-out runs, so this costs no extra network call
// of its own.
export default function ErrorsSummaryCard() {

    const { githubTokenConfigured } = useAuth();
    const { setTab } = useNavigation();
    const { runs } = useGithubDeploymentActivity(githubTokenConfigured);

    if (runs === null) {
        return null;
    }

    const failures = runs.filter((r) => FAILURE_CONCLUSIONS.has(r.conclusion)).slice(0, MAX_SHOWN);

    return (

        <div className="card">

            <h2 className="card-title">
                Errors
                {failures.length > 0 && (
                    <span className="badge badge-danger" style={{ marginLeft: "8px" }}>{failures.length}</span>
                )}
            </h2>

            {failures.length === 0 ? (

                <p className="empty-state">No failed runs recently.</p>

            ) : (

                <ul className="dash-mini-list">

                    {failures.map((run) => (

                        <li key={`${run.repo}-${run.id}`} className="dash-mini-list-row">

                            <button
                                type="button"
                                className="dash-mini-list-link"
                                onClick={() => setTab("history")}
                            >
                                <span className="dash-mini-list-title">{run.name || run.repo}</span>
                                <span className="dash-mini-list-sub">{run.repo}</span>
                                <StatusBadge status={run.conclusion} />
                            </button>

                        </li>

                    ))}

                </ul>

            )}

        </div>

    );

}

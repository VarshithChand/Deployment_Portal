import { useState } from "react";

import usePolling from "../../hooks/usePolling";
import useAuth from "../../hooks/useAuth";
import { getWorkflowRuns } from "../../services/historyService";
import StatusBadge from "../StatusBadge";

export default function RecentDeployments() {

    const { githubRepoConfigured } = useAuth();
    const [runs, setRuns] = useState([]);

    async function loadRuns() {

        // Dashboard (and this card with it) mounts even while
        // RequireGitHubSetup's popup is still showing — without this,
        // an unconfigured session polled GitHub every 20s regardless,
        // burning through the anonymous 60/hour rate limit before
        // anyone had a chance to paste a token in.
        if (!githubRepoConfigured) {
            return;
        }

        const data = await getWorkflowRuns();

        setRuns(Array.isArray(data) ? data.slice(0, 5) : []);

    }

    // 20s, not 5s — GitHub's anonymous rate limit is only 60 requests/hour,
    // and this polls continuously for as long as the Dashboard stays open.
    usePolling(loadRuns, 20000);

    return (

        <div className="card">

            <h2 className="card-title">

                Recent Deployments

            </h2>

            {

                runs.length === 0

                    ? (

                        <p className="empty-state">

                            No deployments yet.

                        </p>

                    )

                    : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>

                                <tr>

                                    <th>Status</th>
                                    <th>Branch</th>
                                    <th>Workflow</th>
                                    <th>Time</th>

                                </tr>

                            </thead>

                            <tbody>

                                {runs.map((run) => (

                                    <tr key={run.id}>

                                        <td>

                                            <StatusBadge status={run.conclusion || run.status} />

                                        </td>

                                        <td>{run.branch || "-"}</td>

                                        <td>{run.name || "-"}</td>

                                        <td>{new Date(run.createdAt).toLocaleString()}</td>

                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )

            }

        </div>

    );

}

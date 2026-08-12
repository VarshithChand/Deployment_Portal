import { useState } from "react";

import { getEnvironments, getEnvironmentCloudStatus } from "../../services/environmentsService";
import useNavigation from "../../hooks/useNavigation";
import useAuth from "../../hooks/useAuth";
import usePolling from "../../hooks/usePolling";

const STATUS_POLL_MS = 30000;

// status is undefined while still loading, null if the check itself
// failed, or the cloud-status DTO (see CloudStatusPanel) once it succeeds —
// three distinct states, three distinct renders.
function AwsServiceRow({ env, status, onOpen }) {

    const loading = status === undefined;

    return (

        <tr className="table-row-clickable" onClick={onOpen}>

            <td>{env.name}</td>

            <td>
                {loading ? (
                    <span className="empty-state">Checking...</span>
                ) : status === null ? (
                    <span className="badge badge-secondary">Unable to check</span>
                ) : !status.configured ? (
                    <span className="badge badge-secondary">No AWS credentials</span>
                ) : !status.found ? (
                    <span className="badge badge-danger">{status.error ? "Error" : "Not found"}</span>
                ) : (
                    <span className="badge badge-success">{status.ecsStatus || "Reachable"}</span>
                )}
            </td>

            <td>
                {!loading && status?.configured && status?.found
                    ? `${status.runningCount ?? "-"} / ${status.desiredCount ?? "-"}`
                    : "—"}
            </td>

            <td className="smoke-test-metric-mono">
                {!loading && status?.configured && status?.found ? (status.taskDefinition || "—") : "—"}
            </td>

        </tr>

    );

}

// Dashboard's persistent tracker for every AWS-backed environment, so
// seeing whether an ECS service is actually healthy doesn't require
// opening Environments and clicking into each one individually. Reuses
// the exact same getEnvironmentCloudStatus call CloudStatusPanel already
// makes on the environment detail page — no new backend endpoint needed.
export default function AwsServicesCard() {

    const { goToEnvironment } = useNavigation();
    const { githubRepoConfigured } = useAuth();

    const [environments, setEnvironments] = useState([]);
    const [statuses, setStatuses] = useState({});
    const [loading, setLoading] = useState(true);

    async function loadAwsEnvironments() {

        // Same reasoning as EnvironmentsCard/RecentDeployments — this card
        // mounts even behind RequireGitHubSetup's popup, so without this
        // guard it polled regardless of whether a repo was configured yet.
        if (!githubRepoConfigured) {
            setLoading(false);
            return;
        }

        const data = await getEnvironments();
        const awsEnvs = Array.isArray(data) ? data.filter((env) => env.cloudProvider === "aws") : [];

        setEnvironments(awsEnvs);
        setLoading(false);

        awsEnvs.forEach((env) => {

            getEnvironmentCloudStatus(env.name).then((result) => {
                setStatuses((prev) => ({ ...prev, [env.name]: result }));
            });

        });

    }

    usePolling(loadAwsEnvironments, STATUS_POLL_MS);

    if (!githubRepoConfigured) {
        return null;
    }

    return (

        <div className="card">

            <h2 className="card-title">
                AWS Services
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Live ECS status for every AWS-backed environment. Click a row to open it.
            </p>

            {loading ? (

                <p className="empty-state">Loading AWS environments...</p>

            ) : environments.length === 0 ? (

                <p className="empty-state">No AWS-backed environments configured yet.</p>

            ) : (

                <div className="table-scroll">

                <table className="table">

                    <thead>

                        <tr>
                            <th>Environment</th>
                            <th>Status</th>
                            <th>Tasks</th>
                            <th>Task Definition</th>
                        </tr>

                    </thead>

                    <tbody>

                        {environments.map((env) => (

                            <AwsServiceRow
                                key={env.name}
                                env={env}
                                status={statuses[env.name]}
                                onOpen={() => goToEnvironment(env.name)}
                            />

                        ))}

                    </tbody>

                </table>

                </div>

            )}

        </div>

    );

}

import { useEffect, useState } from "react";

import { getEnvironments } from "../../services/environmentsService";
import useNavigation from "../../hooks/useNavigation";
import StatusBadge from "../StatusBadge";
import usePolling from "../../hooks/usePolling";

const PROVIDER_LABEL = {
    aws: "AWS",
    azure: "Azure",
    none: "Not configured"
};

// Each environment is a portal-level deployment target (see
// EnvironmentDefinitionDto on the backend) tied to a CD/release workflow —
// clicking one opens Environments' detail view for that name: its latest
// commit, the artifacts that run produced, and (once credentials are
// entered there) live AWS ECS/ECR or Azure Web App status.
export default function EnvironmentsCard() {

    const { goToEnvironment } = useNavigation();

    const [environments, setEnvironments] = useState([]);
    const [loading, setLoading] = useState(true);

    async function loadEnvironments() {

        const data = await getEnvironments();
        setEnvironments(Array.isArray(data) ? data : []);
        setLoading(false);

    }

    usePolling(loadEnvironments, 30000);

    useEffect(() => {
        loadEnvironments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (

        <div className="card">

            <h2 className="card-title">
                Environments
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Click an environment to see its latest commit, deployed artifacts, and cloud status.
            </p>

            {loading ? (

                <p className="empty-state">Loading environments...</p>

            ) : environments.length === 0 ? (

                <p className="empty-state">No environments configured yet.</p>

            ) : (

                <div className="table-scroll">

                <table className="table">

                    <thead>

                        <tr>
                            <th>Environment</th>
                            <th>Cloud Target</th>
                            <th>Latest Deploy</th>
                            <th>Commit</th>
                        </tr>

                    </thead>

                    <tbody>

                        {environments.map((env) => (

                            <tr
                                key={env.name}
                                className="table-row-clickable"
                                onClick={() => goToEnvironment(env.name)}
                            >

                                <td>{env.name}</td>

                                <td>
                                    <span className={`badge ${env.cloudProvider === "none" ? "badge-secondary" : "badge-info"}`}>
                                        {PROVIDER_LABEL[env.cloudProvider] || env.cloudProvider}
                                    </span>
                                </td>

                                <td>
                                    {env.conclusion
                                        ? <StatusBadge status={env.conclusion} />
                                        : env.status
                                            ? <StatusBadge status={env.status} />
                                            : <span className="empty-state">No runs yet</span>}
                                </td>

                                <td>
                                    {env.commitSha
                                        ? <span className="smoke-test-metric-mono">{env.commitSha.slice(0, 7)}</span>
                                        : "—"}
                                </td>

                            </tr>

                        ))}

                    </tbody>

                </table>

                </div>

            )}

        </div>

    );

}

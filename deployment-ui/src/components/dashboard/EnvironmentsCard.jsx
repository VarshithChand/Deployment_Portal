import { useState } from "react";

import { getEnvironments } from "../../services/environmentsService";
import useNavigation from "../../hooks/useNavigation";
import useAuth from "../../hooks/useAuth";
import StatusBadge from "../StatusBadge";
import CloudProviderBadge from "../environments/CloudProviderBadge";
import usePolling from "../../hooks/usePolling";

// Each environment is a portal-level deployment target (see
// EnvironmentDefinitionDto on the backend) tied to a CD/release workflow —
// clicking one opens Environments' detail view for that name: its latest
// commit, the artifacts that run produced, and (once credentials are
// entered there) live AWS ECS/ECR or Azure Web App status.
export default function EnvironmentsCard() {

    const { goToEnvironment } = useNavigation();
    const { githubTokenConfigured } = useAuth();

    const [environments, setEnvironments] = useState([]);
    const [loading, setLoading] = useState(true);

    async function loadEnvironments() {

        // Same reasoning as RecentDeployments — this card mounts even
        // behind RequireGitHubSetup's popup, so without this guard it
        // polled GitHub every 30s before a token was even connected. Gated
        // on the token, not a chosen repo - RequireGitHubSetup itself no
        // longer requires one before letting you in.
        if (!githubTokenConfigured) {
            setLoading(false);
            return;
        }

        const data = await getEnvironments();
        setEnvironments(Array.isArray(data) ? data : []);
        setLoading(false);

    }

    // usePolling already fires loadEnvironments once immediately on mount
    // in addition to its interval — the separate mount-only effect this
    // used to also have was a redundant second initial fetch.
    usePolling(loadEnvironments, 30000);

    return (

        <div className="card">

            <h2 className="card-title">
                Environments
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Click an environment to see its latest commit, deployed artifacts, and cloud status.
            </p>

            {loading ? (

                // min-height approximates a loaded environment list's
                // typical size (see AllRepositoriesCard's own version of
                // this) - reduces how far the page below jumps once real
                // environments arrive.
                <p className="empty-state" style={{ minHeight: "96px" }}>Loading environments...</p>

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
                                    <CloudProviderBadge provider={env.cloudProvider} autoDetected={env.autoDetected} />
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

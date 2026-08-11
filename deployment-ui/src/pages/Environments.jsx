import { useEffect, useState } from "react";

import PageLayout from "../components/layout/PageLayout";
import PageAdminAccessButton from "../components/common/PageAdminAccessButton";
import LoadingSpinner from "../components/LoadingSpinner";
import StatusBadge from "../components/StatusBadge";
import EnvironmentDetailView from "../components/environments/EnvironmentDetailView";
import { getEnvironments } from "../services/environmentsService";
import useNavigation from "../hooks/useNavigation";

const PROVIDER_LABEL = {
    aws: "AWS",
    azure: "Azure",
    none: "Not configured"
};

export default function Environments() {

    const { pendingEnvironmentName, setPendingEnvironmentName } = useNavigation();

    const [environments, setEnvironments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);

    useEffect(() => {

        getEnvironments().then((data) => {

            setEnvironments(Array.isArray(data) ? data : []);
            setLoading(false);

        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Landed here from the Dashboard's Environments card — open straight
    // into that environment's detail view, then consume the hand-off so
    // navigating away and back doesn't reopen it unexpectedly.
    useEffect(() => {

        if (pendingEnvironmentName) {

            setSelected(pendingEnvironmentName);
            setPendingEnvironmentName(null);

        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingEnvironmentName]);

    if (loading) {
        return <LoadingSpinner />;
    }

    if (selected) {

        return (

            <EnvironmentDetailView
                name={selected}
                onBack={() => setSelected(null)}
            />

        );

    }

    return (

        <PageLayout title="Environments" actions={<PageAdminAccessButton pageKey="environments" pageLabel="Environments" />}>

            <div className="card">

                <h2 className="card-title">
                    Deployment Targets
                </h2>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    Each environment is tied to a CD/release workflow. Click one for its latest
                    commit, deployed artifacts, and live cloud status.
                </p>

                {environments.length === 0 ? (

                    <p className="empty-state">No environments configured yet.</p>

                ) : (

                    <div className="table-scroll">

                    <table className="table">

                        <thead>

                            <tr>
                                <th>Environment</th>
                                <th>CD Workflow</th>
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
                                    onClick={() => setSelected(env.name)}
                                >

                                    <td>{env.name}</td>

                                    <td>{env.workflowName}</td>

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

        </PageLayout>

    );

}

import { useEffect, useState } from "react";

import PageLayout from "../layout/PageLayout";
import StatusBadge from "../StatusBadge";
import CopyButton from "../common/CopyButton";
import CloudStatusPanel from "./CloudStatusPanel";
import formatBytes from "../../utils/formatBytes";
import { getEnvironmentDetail } from "../../services/environmentsService";
import { API_BASE } from "../../api/apiBase";

export default function EnvironmentDetailView({ name, onBack }) {

    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {

        let cancelled = false;

        setLoading(true);
        setError(false);

        getEnvironmentDetail(name).then((result) => {

            if (cancelled) return;

            if (!result) {
                setError(true);
            }
            else {
                setDetail(result);
            }

            setLoading(false);

        });

        return () => {
            cancelled = true;
        };

    }, [name]);

    return (

        <PageLayout
            title={name}
            actions={
                <button type="button" className="btn btn-secondary" onClick={onBack}>
                    ← Back to Environments
                </button>
            }
        >

            {loading && (
                <p className="empty-state">Loading environment...</p>
            )}

            {!loading && error && (
                <p className="error-message">Unable to load this environment.</p>
            )}

            {!loading && detail && (

                <>

                <div className="card">

                    <h2 className="card-title">
                        Latest Deployment
                    </h2>

                    {!detail.latestRunId ? (

                        <p className="empty-state">
                            No runs of "{detail.workflowName}" yet.
                        </p>

                    ) : (

                        <>

                        <div className="info-row">
                            <span>Workflow</span>
                            <strong>{detail.workflowName}</strong>
                        </div>

                        <div className="info-row">
                            <span>Branch</span>
                            <strong>{detail.branch || "—"}</strong>
                        </div>

                        <div className="info-row">
                            <span>Status</span>
                            <strong>
                                {detail.conclusion
                                    ? <StatusBadge status={detail.conclusion} />
                                    : <StatusBadge status={detail.status} />}
                            </strong>
                        </div>

                        <div className="info-row">
                            <span>Commit</span>
                            <strong className="smoke-test-metric-mono">
                                {detail.commitSha ? detail.commitSha.slice(0, 7) : "—"}
                                {detail.commitSha && <CopyButton value={detail.commitSha} label="Copy full commit SHA" />}
                            </strong>
                        </div>

                        <div className="info-row">
                            <span>Commit message</span>
                            <strong>{detail.commitMessage || "Not available"}</strong>
                        </div>

                        <div className="info-row">
                            <span>Deployed</span>
                            <strong>{detail.deployedAt ? new Date(detail.deployedAt).toLocaleString() : "—"}</strong>
                        </div>

                        {detail.htmlUrl && (

                            <a
                                href={detail.htmlUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="token-help-link"
                            >
                                View this run on GitHub →
                            </a>

                        )}

                        </>

                    )}

                </div>

                <br />

                <div className="card">

                    <h2 className="card-title">
                        Artifacts Deployed
                    </h2>

                    {detail.artifacts.length === 0 ? (

                        <p className="empty-state">
                            No artifacts from this run.
                        </p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th className="num">Size</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th>Download</th>
                                </tr>
                            </thead>

                            <tbody>

                                {detail.artifacts.map((artifact) => (

                                    <tr key={artifact.id}>

                                        <td>{artifact.name}</td>

                                        <td className="num">{formatBytes(artifact.size)}</td>

                                        <td>
                                            <span className={`badge ${artifact.expired ? "badge-danger" : "badge-success"}`}>
                                                {artifact.expired ? "Expired" : "Active"}
                                            </span>
                                        </td>

                                        <td>{new Date(artifact.createdAt).toLocaleString()}</td>

                                        <td>
                                            {artifact.expired ? (
                                                <span className="empty-state">—</span>
                                            ) : (
                                                <a
                                                    href={`${API_BASE}/api/github/artifacts/${artifact.id}/download`}
                                                    className="btn btn-secondary"
                                                    style={{ padding: "6px 14px", fontSize: "13px" }}
                                                >
                                                    Download
                                                </a>
                                            )}
                                        </td>

                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                </div>

                <br />

                <CloudStatusPanel
                    environmentName={name}
                    cloudProvider={detail.cloudProvider}
                    renderServiceId={detail.renderServiceId}
                    cloudflareAccountId={detail.cloudflareAccountId}
                    cloudflareProjectName={detail.cloudflareProjectName}
                    autoDetected={detail.autoDetected}
                    detectionEvidence={detail.detectionEvidence}
                />

                </>

            )}

        </PageLayout>

    );

}

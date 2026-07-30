import { Fragment, useState } from "react";

import formatBytes from "../../utils/formatBytes";
import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import useToast from "../../hooks/useToast";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import { API_BASE } from "../../api/apiBase";

export default function ArtifactsTable({ artifacts = [], owner, repository, onDelete, deletingId }) {

    const { githubTokenConfigured } = useAuth();
    const { setTab } = useNavigation();
    const toast = useToast();

    const [expandedId, setExpandedId] = useState(null);
    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(artifacts, 10);

    function handleDeleteClick(artifact) {

        if (!githubTokenConfigured) {

            toast.show(
                "A GitHub Personal Access Token is required to delete artifacts. Add one in Settings.",
                "error"
            );

            setTab("settings");
            return;

        }

        onDelete(artifact);

    }

    function toggleExpanded(id) {

        setExpandedId((current) => (current === id ? null : id));

    }

    return (

        <div className="card">

            <h2 className="card-title">
                Workflow Artifacts
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Build outputs uploaded by GitHub Actions runs, stored under{" "}
                <strong>{owner}/{repository}</strong>. Click a row for the commit it was built from.
            </p>

            {artifacts.length === 0 ? (

                <p className="empty-state">No artifacts found.</p>

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
                            <th>Delete</th>
                        </tr>

                    </thead>

                    <tbody>

                        {pageItems.map((artifact) => (

                            <Fragment key={artifact.id}>

                            <tr
                                className="table-row-clickable"
                                onClick={() => toggleExpanded(artifact.id)}
                            >

                                <td>{artifact.name}</td>

                                <td className="num">{formatBytes(artifact.size)}</td>

                                <td>
                                    <span className={`badge ${artifact.expired ? "badge-danger" : "badge-success"}`}>
                                        {artifact.expired ? "Expired" : "Active"}
                                    </span>
                                </td>

                                <td>{new Date(artifact.createdAt).toLocaleString()}</td>

                                <td onClick={(e) => e.stopPropagation()}>
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

                                <td onClick={(e) => e.stopPropagation()}>
                                    <button
                                        type="button"
                                        className="btn btn-danger"
                                        style={{ padding: "6px 14px", fontSize: "13px" }}
                                        disabled={deletingId === artifact.id}
                                        onClick={() => handleDeleteClick(artifact)}
                                    >
                                        {deletingId === artifact.id ? "Deleting..." : "Delete"}
                                    </button>
                                </td>

                            </tr>

                            {expandedId === artifact.id && (

                                <tr className="table-row-details">

                                    <td colSpan={6}>

                                        <div className="info-row">
                                            <span>Branch</span>
                                            <strong>{artifact.branch || "—"}</strong>
                                        </div>

                                        <div className="info-row">
                                            <span>Commit</span>
                                            <strong>
                                                {artifact.commitSha ? artifact.commitSha.slice(0, 7) : "—"}
                                            </strong>
                                        </div>

                                        <div className="info-row">
                                            <span>Commit message</span>
                                            <strong>{artifact.commitMessage || "Not available"}</strong>
                                        </div>

                                        {artifact.workflowRunUrl && (

                                            <a
                                                href={artifact.workflowRunUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="token-help-link"
                                            >
                                                View this run on GitHub →
                                            </a>

                                        )}

                                    </td>

                                </tr>

                            )}

                            </Fragment>

                        ))}

                    </tbody>

                </table>

                </div>

            )}

            <Pagination
                page={page}
                pageCount={pageCount}
                totalCount={totalCount}
                startIndex={startIndex}
                endIndex={endIndex}
                onPageChange={setPage}
            />

        </div>

    );

}

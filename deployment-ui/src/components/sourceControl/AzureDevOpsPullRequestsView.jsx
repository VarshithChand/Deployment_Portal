import { useEffect, useMemo, useState } from "react";

import {
    getAzureDevOpsPullRequests, approveAzureDevOpsPullRequest, completeAzureDevOpsPullRequest
} from "../../services/azureDevOpsService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import useAzureDevOpsProject from "../../hooks/useAzureDevOpsProject";
import useNavigation from "../../hooks/useNavigation";
import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";

const PAGE_SIZE = 10;

// Azure DevOps PR status as a colored badge - its own small helper since
// the vocabulary ("active"/"completed"/"abandoned") is specific to Azure
// DevOps pull requests, distinct from both StatusBadge's GitHub Actions
// run vocabulary and AzureDevOpsPipelinesView's own run State/Result pair.
function PrStatusBadge({ status }) {

    const value = (status || "").toLowerCase();

    const className = value === "completed"
        ? "badge badge-success"
        : value === "abandoned"
            ? "badge badge-danger"
            : "badge badge-info";

    return <span className={className}>{status}</span>;

}

// Azure DevOps' Pull Requests sub-page - project-wide listing (Azure
// DevOps' own endpoint spans every repository in the project at once) with
// self-service approve/complete actions, each behind its own confirm step
// - both are real mutating actions against the visitor's own connected
// Azure DevOps credential, same posture as every other mutating action in
// this app (the credential's real permission on Azure DevOps' own side is
// the auth boundary, not a portal-side gate). The project itself is picked
// once on the Dashboard sub-page and shared via AzureDevOpsProjectContext
// - this page no longer asks for one separately.
export default function AzureDevOpsPullRequestsView() {

    const { setTab } = useNavigation();
    const { project } = useAzureDevOpsProject();
    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [prs, setPrs] = useState(null);
    const [prsLoading, setPrsLoading] = useState(false);
    const [prSearch, setPrSearch] = useState("");

    const [busyPrId, setBusyPrId] = useState(null);

    function loadPullRequests(activeProject) {

        setPrsLoading(true);

        getAzureDevOpsPullRequests(activeProject.name).then((data) => {
            setPrs(data);
            setPrsLoading(false);
        }).catch((err) => {
            console.error(err);
            setPrs({ configured: false, error: "Unable to load pull requests." });
            setPrsLoading(false);
        });

    }

    useEffect(() => {

        if (project) {
            loadPullRequests(project);
        }
        else {
            setPrs(null);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id]);

    async function handleApprove(pr) {

        if (!(await confirm({
            title: `Approve "${pr.title}"?`,
            message: `Casts your approval vote on this pull request, using your own connected Azure DevOps credential.`,
            confirmLabel: "Approve",
            danger: false
        }))) {
            return;
        }

        setBusyPrId(pr.id);

        try {

            const result = await approveAzureDevOpsPullRequest(project.name, pr.repositoryId, pr.id);

            if (result.success) {
                toast.show(result.message || "Pull request approved.", "success");
            }
            else {
                toast.show(result.error || "Unable to approve the pull request.", "error");
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to approve the pull request.", "error");

        }
        finally {

            setBusyPrId(null);

        }

    }

    async function handleComplete(pr) {

        if (!(await confirm({
            title: `Complete "${pr.title}"?`,
            message: `Merges "${pr.sourceBranch}" into "${pr.targetBranch}" and marks this pull request completed. This can't be undone.`,
            confirmLabel: "Complete Pull Request",
            danger: true
        }))) {
            return;
        }

        setBusyPrId(pr.id);

        try {

            const result = await completeAzureDevOpsPullRequest(project.name, pr.repositoryId, pr.id);

            if (result.success) {
                toast.show(result.message || "Pull request completed.", "success");
                loadPullRequests(project);
            }
            else {
                toast.show(result.error || "Unable to complete the pull request.", "error");
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to complete the pull request.", "error");

        }
        finally {

            setBusyPrId(null);

        }

    }

    const filteredPrs = useMemo(() => {

        const items = prs?.pullRequests || [];
        const trimmed = prSearch.trim().toLowerCase();

        return trimmed
            ? items.filter((pr) => pr.title.toLowerCase().includes(trimmed) || pr.repositoryName.toLowerCase().includes(trimmed))
            : items;

    }, [prs, prSearch]);

    const {
        page: prPage, setPage: setPrPage, pageCount: prPageCount, pageItems: prPageItems,
        totalCount: prTotalCount, startIndex: prStartIndex, endIndex: prEndIndex
    } = usePagination(filteredPrs, PAGE_SIZE);

    if (!project) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Pick an Azure DevOps project on the{" "}
                    <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("dashboard")}>Dashboard</button>
                    {" "}first.
                </p>
            </div>
        );

    }

    return (

        <>

        {dialog}

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>{project.name}</h2>
                <div className="button-row">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadPullRequests(project)}>
                        Refresh
                    </button>
                    <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("dashboard")}>Change project</button>
                </div>
            </div>

            {prsLoading ? (

                <p className="field-hint">Loading pull requests...</p>

            ) : !prs?.configured || prs.error ? (

                <p className="error-message">{prs?.error || "Azure DevOps is not configured."}</p>

            ) : (

                <>

                <SearchBox placeholder="Search pull requests or repositories..." value={prSearch} onChange={setPrSearch} />

                {filteredPrs.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No active pull requests found.</p>

                ) : (

                    <>

                    <div className="table-scroll" style={{ marginTop: "12px" }}>

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Repository</th>
                                    <th>Branches</th>
                                    <th>Created By</th>
                                    <th>Status</th>
                                    <th><span className="visually-hidden">Actions</span></th>
                                </tr>
                            </thead>

                            <tbody>

                                {prPageItems.map((pr) => (

                                    <tr key={pr.id}>
                                        <td>
                                            {pr.webUrl ? (
                                                <a href={pr.webUrl} target="_blank" rel="noreferrer">{pr.title}</a>
                                            ) : pr.title}
                                        </td>
                                        <td>{pr.repositoryName}</td>
                                        <td>{pr.sourceBranch} → {pr.targetBranch}</td>
                                        <td>{pr.createdBy || "—"}</td>
                                        <td><PrStatusBadge status={pr.status} /></td>
                                        <td>
                                            {pr.status === "active" && (
                                                <div className="button-row">
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => handleApprove(pr)}
                                                        disabled={busyPrId === pr.id}
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-success btn-sm"
                                                        onClick={() => handleComplete(pr)}
                                                        disabled={busyPrId === pr.id}
                                                    >
                                                        {busyPrId === pr.id ? "Working..." : "Complete"}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                    <Pagination
                        page={prPage}
                        pageCount={prPageCount}
                        totalCount={prTotalCount}
                        startIndex={prStartIndex}
                        endIndex={prEndIndex}
                        onPageChange={setPrPage}
                    />

                    </>

                )}

                </>

            )}

        </div>

        </>

    );

}

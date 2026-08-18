import { useEffect, useMemo, useState } from "react";

import {
    getAzureDevOpsProjects, getAzureDevOpsPullRequests, approveAzureDevOpsPullRequest, completeAzureDevOpsPullRequest
} from "../../services/azureDevOpsService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
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
// DevOps' own endpoint spans every repository in the project at once, so
// unlike Pipelines/Build Artifacts there's no second picker below the
// project level) with self-service approve/complete actions, each behind
// its own confirm step - both are real mutating actions against the
// visitor's own connected Azure DevOps credential, same posture as every
// other mutating action in this app (the credential's real permission on
// Azure DevOps' own side is the auth boundary, not a portal-side gate).
export default function AzureDevOpsPullRequestsView() {

    const { setTab } = useNavigation();
    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [projects, setProjects] = useState(null);
    const [loading, setLoading] = useState(true);
    const [projectSearch, setProjectSearch] = useState("");

    const [selectedProject, setSelectedProject] = useState(null);
    const [prs, setPrs] = useState(null);
    const [prsLoading, setPrsLoading] = useState(false);
    const [prSearch, setPrSearch] = useState("");

    const [busyPrId, setBusyPrId] = useState(null);

    function refresh() {

        setLoading(true);

        getAzureDevOpsProjects().then((data) => {
            setProjects(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setProjects({ configured: false, error: "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    function loadPullRequests(project) {

        setPrsLoading(true);

        getAzureDevOpsPullRequests(project.name).then((data) => {
            setPrs(data);
            setPrsLoading(false);
        }).catch((err) => {
            console.error(err);
            setPrs({ configured: false, error: "Unable to load pull requests." });
            setPrsLoading(false);
        });

    }

    function openProject(project) {

        setSelectedProject(project);
        loadPullRequests(project);

    }

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

            const result = await approveAzureDevOpsPullRequest(selectedProject.name, pr.repositoryId, pr.id);

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

            const result = await completeAzureDevOpsPullRequest(selectedProject.name, pr.repositoryId, pr.id);

            if (result.success) {
                toast.show(result.message || "Pull request completed.", "success");
                loadPullRequests(selectedProject);
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

    const filteredProjects = useMemo(() => {

        const items = projects?.projects || [];
        const trimmed = projectSearch.trim().toLowerCase();

        return trimmed ? items.filter((p) => p.name.toLowerCase().includes(trimmed)) : items;

    }, [projects, projectSearch]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filteredProjects, PAGE_SIZE);

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

    // ---- Level 2: pull requests for the selected project ----

    if (selectedProject) {

        return (

            <>

            {dialog}

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedProject.name}</h2>
                    <div className="button-row">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadPullRequests(selectedProject)}>
                            Refresh
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedProject(null); setPrs(null); }}>
                            ← Back to projects
                        </button>
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
                                        <th></th>
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

    // ---- Level 1: projects ----

    if (loading) {
        return <div className="card"><p className="empty-state">Loading Azure DevOps projects...</p></div>;
    }

    if (!projects?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Connect your Azure DevOps credentials in{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>Settings → Credentials → Azure DevOps</a>
                    {" "}to browse this.
                </p>
            </div>
        );

    }

    if (projects.error) {
        return <div className="card"><p className="error-message">{projects.error}</p></div>;
    }

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Azure DevOps Projects</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
            </div>

            <SearchBox placeholder="Search projects..." value={projectSearch} onChange={setProjectSearch} />

            {filteredProjects.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No projects found.</p>

            ) : (

                <>

                <div className="table-scroll" style={{ marginTop: "12px" }}>

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Project</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((project) => (

                                <tr key={project.id} className="table-row-clickable" onClick={() => openProject(project)}>
                                    <td>{project.name}</td>
                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

                <Pagination
                    page={page}
                    pageCount={pageCount}
                    totalCount={totalCount}
                    startIndex={startIndex}
                    endIndex={endIndex}
                    onPageChange={setPage}
                />

                </>

            )}

        </div>

    );

}

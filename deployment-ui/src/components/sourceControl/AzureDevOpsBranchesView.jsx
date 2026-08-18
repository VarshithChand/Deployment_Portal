import { useEffect, useMemo, useState } from "react";

import {
    getAzureDevOpsRepositories, getAzureDevOpsBranches, createAzureDevOpsBranch, deleteAzureDevOpsBranch
} from "../../services/azureDevOpsService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import ComboBox from "../common/ComboBox";
import ClearableInput from "../common/ClearableInput";
import formatBytes from "../../utils/formatBytes";
import useNavigation from "../../hooks/useNavigation";
import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";

const PAGE_SIZE = 10;

// Azure DevOps' Branches sub-page - two levels (repositories -> branches),
// against this session's own credential (see PortalRegistryLoginSection in
// Settings → Credentials → Azure DevOps). Lists across the whole
// organization (every project's repositories), not one project at a time -
// the org-wide repository list endpoint carries each repo's own project
// name already, so no project picker is needed here (unlike Pipelines/
// Build Artifacts, which the Git refs API can't offer that shortcut for).
// Create/delete are both self-service, one Git ref update each - the
// calling session's own credential and its real permission on Azure
// DevOps' side is the auth boundary, same posture as every other mutating
// action against a visitor's own connected cloud credential in this app.
export default function AzureDevOpsBranchesView() {

    const { setTab } = useNavigation();
    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [list, setList] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [selectedRepo, setSelectedRepo] = useState(null);
    const [branches, setBranches] = useState(null);
    const [branchesLoading, setBranchesLoading] = useState(false);

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newBranchName, setNewBranchName] = useState("");
    const [sourceBranch, setSourceBranch] = useState("");
    const [creating, setCreating] = useState(false);
    const [deletingBranch, setDeletingBranch] = useState(null);

    function refresh() {

        setLoading(true);

        getAzureDevOpsRepositories().then((data) => {
            setList(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setList({ configured: false, error: "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    function loadBranches(repo) {

        setBranchesLoading(true);

        return getAzureDevOpsBranches(repo.projectName, repo.id).then((data) => {
            setBranches(data);
            setBranchesLoading(false);
            return data;
        }).catch((err) => {
            console.error(err);
            setBranches({ configured: false, error: "Unable to load branches." });
            setBranchesLoading(false);
        });

    }

    function openRepo(repo) {

        setSelectedRepo(repo);
        setShowCreateForm(false);
        setNewBranchName("");
        setSourceBranch(repo.defaultBranch || "");
        loadBranches(repo);

    }

    async function handleCreateBranch(e) {

        e.preventDefault();

        if (!newBranchName.trim()) {
            toast.show("Enter a name for the new branch.", "error");
            return;
        }

        const source = branches?.branches?.find((b) => b.name === sourceBranch);

        if (!source) {
            toast.show("Pick a branch to create the new one from.", "error");
            return;
        }

        setCreating(true);

        try {

            const result = await createAzureDevOpsBranch(selectedRepo.projectName, selectedRepo.id, newBranchName.trim(), source.objectId);

            if (result.success) {
                toast.show(result.message || "Branch created.", "success");
                setNewBranchName("");
                setShowCreateForm(false);
                loadBranches(selectedRepo);
            }
            else {
                toast.show(result.error || "Unable to create the branch.", "error");
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to create the branch.", "error");

        }
        finally {

            setCreating(false);

        }

    }

    async function handleDeleteBranch(b) {

        if (!(await confirm({
            title: `Delete "${b.name}"?`,
            message: "This permanently removes the branch from the remote repository. This can't be undone.",
            confirmLabel: "Delete Branch",
            danger: true
        }))) {
            return;
        }

        setDeletingBranch(b.name);

        try {

            const result = await deleteAzureDevOpsBranch(selectedRepo.projectName, selectedRepo.id, b.name, b.objectId);

            if (result.success) {
                toast.show(result.message || "Branch deleted.", "success");
                loadBranches(selectedRepo);
            }
            else {
                toast.show(result.error || "Unable to delete the branch.", "error");
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to delete the branch.", "error");

        }
        finally {

            setDeletingBranch(null);

        }

    }

    const filtered = useMemo(() => {

        const repos = list?.repositories || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed
            ? repos.filter((r) => r.name.toLowerCase().includes(trimmed) || r.projectName.toLowerCase().includes(trimmed))
            : repos;

    }, [list, search]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    if (selectedRepo) {

        return (

            <>

            {dialog}

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedRepo.projectName}/{selectedRepo.name}</h2>
                    <div className="button-row">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreateForm((v) => !v)}>
                            {showCreateForm ? "Cancel" : "New Branch"}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedRepo(null); setBranches(null); }}>
                            ← Back to repositories
                        </button>
                    </div>
                </div>

                {showCreateForm && (

                    <form onSubmit={handleCreateBranch} className="form-group" style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", marginBottom: "16px" }}>

                        <label>New branch name</label>
                        <ClearableInput
                            placeholder="e.g. feature/my-change"
                            value={newBranchName}
                            onChange={(e) => setNewBranchName(e.target.value)}
                            onClear={() => setNewBranchName("")}
                            autoComplete="off"
                        />

                        <label style={{ marginTop: "12px" }}>Create from</label>
                        <ComboBox
                            options={(branches?.branches || []).map((b) => ({ value: b.name, label: b.name }))}
                            value={sourceBranch}
                            onChange={setSourceBranch}
                            placeholder="Search or select a source branch..."
                            emptyLabel="No branch found"
                        />

                        <button type="submit" className="btn btn-success" style={{ marginTop: "12px" }} disabled={creating}>
                            {creating ? "Creating..." : "Create Branch"}
                        </button>

                    </form>

                )}

                {branchesLoading ? (

                    <p className="field-hint">Loading branches...</p>

                ) : !branches?.configured || branches.error ? (

                    <p className="error-message">{branches?.error || "Azure DevOps is not configured."}</p>

                ) : branches.branches.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No branches in this repository.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Branch</th>
                                    <th></th>
                                </tr>
                            </thead>

                            <tbody>

                                {branches.branches.map((b) => {

                                    const isDefault = b.name === selectedRepo.defaultBranch;

                                    return (

                                        <tr key={b.name}>
                                            <td>{b.name}{isDefault ? " (default)" : ""}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleDeleteBranch(b)}
                                                    disabled={isDefault || deletingBranch === b.name}
                                                    title={isDefault ? "The default branch can't be deleted here" : undefined}
                                                >
                                                    {deletingBranch === b.name ? "Deleting..." : "Delete"}
                                                </button>
                                            </td>
                                        </tr>

                                    );

                                })}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

            </>

        );

    }

    if (loading) {
        return <div className="card"><p className="empty-state">Loading Azure DevOps repositories...</p></div>;
    }

    if (!list?.configured) {

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

    if (list.error) {
        return <div className="card"><p className="error-message">{list.error}</p></div>;
    }

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Azure DevOps Repositories</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
            </div>

            <SearchBox placeholder="Search repositories or projects..." value={search} onChange={setSearch} />

            {filtered.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No repositories found.</p>

            ) : (

                <>

                <div className="table-scroll" style={{ marginTop: "12px" }}>

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Project</th>
                                <th>Repository</th>
                                <th>Default Branch</th>
                                <th>Size</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((repo) => (

                                <tr key={repo.id} className="table-row-clickable" onClick={() => openRepo(repo)}>
                                    <td>{repo.projectName}</td>
                                    <td>{repo.name}</td>
                                    <td>{repo.defaultBranch || "—"}</td>
                                    <td>{repo.sizeBytes ? formatBytes(repo.sizeBytes) : "—"}</td>
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

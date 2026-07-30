import { useEffect, useMemo, useState } from "react";

import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import SearchBox from "../common/SearchBox";

import {
    getCollaborators,
    getBranchAccess,
    saveBranchPurpose,
    setBranchRestriction,
    removeBranchRestriction,
    createBranch,
    deleteBranch
} from "../../services/accessService";

export default function BranchManager() {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [collaborators, setCollaborators] = useState([]);

    const [branches, setBranches] = useState([]);
    const [loadingBranches, setLoadingBranches] = useState(true);
    const [search, setSearch] = useState("");

    const [purposeDrafts, setPurposeDrafts] = useState({});
    const [savingPurpose, setSavingPurpose] = useState(null);
    const [restrictionDrafts, setRestrictionDrafts] = useState({});
    const [savingRestriction, setSavingRestriction] = useState(null);
    const [expandedBranch, setExpandedBranch] = useState(null);

    const [newBranchName, setNewBranchName] = useState("");
    const [sourceBranch, setSourceBranch] = useState("");
    const [creatingBranch, setCreatingBranch] = useState(false);
    const [deletingBranch, setDeletingBranch] = useState(null);

    async function loadCollaborators() {

        try {

            const response = await getCollaborators();
            setCollaborators(Array.isArray(response.data) ? response.data : []);

        }
        catch (err) {

            console.error(err);

        }

    }

    async function loadBranches() {

        try {

            const response = await getBranchAccess();
            const data = Array.isArray(response.data) ? response.data : [];

            setBranches(data);
            setPurposeDrafts(Object.fromEntries(data.map((b) => [b.name, b.purpose || ""])));
            setRestrictionDrafts(Object.fromEntries(data.map((b) => [b.name, b.allowedUsers || []])));

            if (!sourceBranch && data.length > 0) {
                setSourceBranch(data[0].name);
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to load branches.", "error");

        }
        finally {

            setLoadingBranches(false);

        }

        // eslint-disable-next-line react-hooks/exhaustive-deps

    }

    useEffect(() => {

        loadCollaborators();
        loadBranches();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredBranches = useMemo(() => {

        const query = search.trim().toLowerCase();

        if (!query) return branches;

        return branches.filter((b) => b.name.toLowerCase().includes(query));

    }, [branches, search]);

    async function handleCreateBranch() {

        const name = newBranchName.trim();

        if (!name) {
            toast.show("Enter a name for the new branch.", "error");
            return;
        }

        if (!sourceBranch) {
            toast.show("Pick a branch to create it from.", "error");
            return;
        }

        try {

            setCreatingBranch(true);

            await createBranch(name, sourceBranch);

            toast.show(`Branch '${name}' created from '${sourceBranch}'.`, "success");
            setNewBranchName("");
            loadBranches();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Failed to create branch '${name}'.`, "error");

        }
        finally {

            setCreatingBranch(false);

        }

    }

    async function handleDeleteBranch(branch) {

        if (!(await confirm({
            title: "Delete branch?",
            message: `Delete branch '${branch}'? This cannot be undone.`,
            confirmLabel: "Delete",
            danger: true
        }))) {
            return;
        }

        try {

            setDeletingBranch(branch);

            await deleteBranch(branch);

            toast.show(`Branch '${branch}' deleted.`, "success");
            setExpandedBranch((prev) => (prev === branch ? null : prev));
            loadBranches();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Failed to delete '${branch}'.`, "error");

        }
        finally {

            setDeletingBranch(null);

        }

    }

    async function handleSavePurpose(branch) {

        try {

            setSavingPurpose(branch);

            await saveBranchPurpose(branch, purposeDrafts[branch] || "");

            toast.show(`Purpose saved for '${branch}'.`, "success");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Failed to save purpose for '${branch}'.`, "error");

        }
        finally {

            setSavingPurpose(null);

        }

    }

    function toggleRestrictedUser(branch, username) {

        setRestrictionDrafts((prev) => {

            const current = prev[branch] || [];

            const next = current.includes(username)
                ? current.filter((u) => u !== username)
                : [...current, username];

            return { ...prev, [branch]: next };

        });

    }

    async function handleSaveRestriction(branch) {

        const usernames = restrictionDrafts[branch] || [];

        if (usernames.length === 0) {
            toast.show("Select at least one collaborator to restrict pushes to.", "error");
            return;
        }

        try {

            setSavingRestriction(branch);

            await setBranchRestriction(branch, usernames);

            toast.show(`Push access on '${branch}' restricted to ${usernames.length} user(s).`, "success");
            loadBranches();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Failed to restrict '${branch}'.`, "error");

        }
        finally {

            setSavingRestriction(null);

        }

    }

    async function handleRemoveRestriction(branch) {

        if (!(await confirm({
            title: "Remove push restriction?",
            message: `Remove the push restriction on '${branch}'? Anyone with write access will be able to push again.`,
            confirmLabel: "Remove Restriction",
            danger: true
        }))) {
            return;
        }

        try {

            setSavingRestriction(branch);

            await removeBranchRestriction(branch);

            toast.show(`Push restriction removed from '${branch}'.`, "success");
            loadBranches();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Failed to remove restriction on '${branch}'.`, "error");

        }
        finally {

            setSavingRestriction(null);

        }

    }

    return (

        <>

        {dialog}

        <div className="card">

            <h2 className="card-title">
                Create a Branch
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Branches off an existing branch's latest commit, the same as GitHub's own
                "create branch from" action.
            </p>

            <div className="access-invite-controls">

                <input
                    type="text"
                    className="form-control"
                    placeholder="New branch name"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    autoComplete="off"
                />

                <span className="access-branch-from-label">from</span>

                <select
                    className="form-control access-permission-select"
                    value={sourceBranch}
                    onChange={(e) => setSourceBranch(e.target.value)}
                >
                    {branches.map((b) => (
                        <option key={b.name} value={b.name}>{b.name}</option>
                    ))}
                </select>

                <button type="button" className="btn btn-primary" onClick={handleCreateBranch} disabled={creatingBranch}>
                    {creatingBranch ? "Creating..." : "Create Branch"}
                </button>

            </div>

        </div>

        <div className="card">

            <h2 className="card-title">
                Branches
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Note what each branch is for, and optionally restrict who can push to it. GitHub only
                enforces push restrictions on organization-owned repositories — on a personal account
                it rejects the request, and the error will say so.
            </p>

            <SearchBox
                placeholder="Search branches..."
                value={search}
                onChange={setSearch}
            />

            {loadingBranches ? (

                <p className="field-hint">Loading branches...</p>

            ) : branches.length === 0 ? (

                <p className="empty-state">No branches found.</p>

            ) : filteredBranches.length === 0 ? (

                <p className="empty-state">No matches for "{search}".</p>

            ) : (

                <div className="access-branch-list">

                    {filteredBranches.map((b) => (

                        <div className="access-branch-item" key={b.name}>

                            <div className="access-branch-header">

                                <span className="access-branch-name">{b.name}</span>

                                {b.restricted ? (
                                    <span className="badge badge-warning">Restricted ({b.allowedUsers.length})</span>
                                ) : (
                                    <span className="badge badge-secondary">Open</span>
                                )}

                                {b.creator && (
                                    <span className="access-branch-creator">created by {b.creator}</span>
                                )}

                                {b.purpose && (
                                    <span className="access-branch-purpose-preview">{b.purpose}</span>
                                )}

                                <div className="access-branch-actions">

                                    <button
                                        type="button"
                                        className="access-branch-toggle"
                                        onClick={() => setExpandedBranch(expandedBranch === b.name ? null : b.name)}
                                    >
                                        {expandedBranch === b.name ? "Hide" : "Manage"}
                                    </button>

                                    <button
                                        type="button"
                                        className="access-branch-toggle access-branch-delete"
                                        onClick={() => handleDeleteBranch(b.name)}
                                        disabled={deletingBranch === b.name}
                                    >
                                        {deletingBranch === b.name ? "Deleting..." : "Delete"}
                                    </button>

                                </div>

                            </div>

                            {expandedBranch === b.name && (

                                <div className="access-branch-body">

                                    <div className="form-group">

                                        <label>Purpose</label>

                                        <div className="access-invite-controls">

                                            <input
                                                type="text"
                                                className="form-control"
                                                placeholder="What is this branch for?"
                                                value={purposeDrafts[b.name] ?? ""}
                                                onChange={(e) => setPurposeDrafts((prev) => ({ ...prev, [b.name]: e.target.value }))}
                                            />

                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={() => handleSavePurpose(b.name)}
                                                disabled={savingPurpose === b.name}
                                            >
                                                {savingPurpose === b.name ? "Saving..." : "Save"}
                                            </button>

                                        </div>

                                    </div>

                                    <div className="form-group">

                                        <label>Assign users — restrict who can push</label>

                                        {collaborators.length === 0 ? (

                                            <p className="field-hint">
                                                Invite at least one collaborator before restricting push access.
                                            </p>

                                        ) : (

                                            <div className="access-restrict-checklist">

                                                {collaborators.map((c) => (

                                                    <label key={c.login} className="access-restrict-checkbox">
                                                        <input
                                                            type="checkbox"
                                                            checked={(restrictionDrafts[b.name] || []).includes(c.login)}
                                                            onChange={() => toggleRestrictedUser(b.name, c.login)}
                                                        />
                                                        {c.login}
                                                    </label>

                                                ))}

                                            </div>

                                        )}

                                        <div className="button-row">

                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={() => handleSaveRestriction(b.name)}
                                                disabled={savingRestriction === b.name}
                                            >
                                                {savingRestriction === b.name ? "Saving..." : "Save Restriction"}
                                            </button>

                                            {b.restricted && (

                                                <button
                                                    type="button"
                                                    className="btn btn-danger"
                                                    onClick={() => handleRemoveRestriction(b.name)}
                                                    disabled={savingRestriction === b.name}
                                                >
                                                    Remove Restriction
                                                </button>

                                            )}

                                        </div>

                                    </div>

                                </div>

                            )}

                        </div>

                    ))}

                </div>

            )}

        </div>

        </>

    );

}

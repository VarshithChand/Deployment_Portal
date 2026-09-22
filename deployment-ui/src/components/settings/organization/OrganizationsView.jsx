import { useEffect, useState } from "react";

import useToast from "../../../hooks/useToast";
import OrganizationDetail from "./OrganizationDetail";
import { listMyOrganizations, createOrganization, getOrganization } from "../../../services/organizationService";

// Settings > Organizations - list every organization the caller belongs
// to (including their own synthetic "Personal" one - see
// OrganizationService.EnsureOwnsPersonalOrganizationAsync), create a new
// real one, and drill into one to manage its Members/Invitations/Roles
// (OrganizationDetail). Selection here is local page state, not yet a
// portal-wide "current organization" concept - that's Phase 6's org
// switcher (TopBar-level, drives X-Organization-Id on every request);
// this page works standalone against whichever org id is passed to each
// call, same as any other Settings sub-page today.
export default function OrganizationsView() {

    const toast = useToast();

    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [selectedLoading, setSelectedLoading] = useState(false);

    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [savingNew, setSavingNew] = useState(false);

    function loadOrganizations() {
        setLoading(true);
        listMyOrganizations()
            .then((result) => setOrganizations(result.organizations || []))
            .catch((err) => {
                // A 503 here means organizations aren't enabled on this
                // deployment (no DATABASE_URL) - shown inline below rather
                // than as a toast, since it's a standing state, not a
                // one-off action failure.
                console.error(err);
                setOrganizations([]);
            })
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        loadOrganizations();
    }, []);

    async function handleSelect(org) {

        setSelectedLoading(true);

        try {
            const detail = await getOrganization(org.id);
            setSelectedOrg(detail);
        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to open that organization.", "error");
        }
        finally {
            setSelectedLoading(false);
        }

    }

    async function handleCreate(e) {

        e.preventDefault();
        setSavingNew(true);

        try {

            const result = await createOrganization({ name: newName, description: newDescription });

            if (!result.success) {
                toast.show(result.message || "Unable to create organization.", "error");
                return;
            }

            toast.show(`"${newName}" created.`, "success");
            setNewName("");
            setNewDescription("");
            setCreating(false);
            loadOrganizations();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to create organization.", "error");
        }
        finally {
            setSavingNew(false);
        }

    }

    if (selectedOrg) {
        return <OrganizationDetail organization={selectedOrg} onBack={() => setSelectedOrg(null)} />;
    }

    return (

        <div className="card">

            <div className="access-panel-header">
                <h2 className="card-title">Organizations</h2>
                {!creating && (
                    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                        + Create Organization
                    </button>
                )}
            </div>

            {creating && (

                <form onSubmit={handleCreate} className="settings-subsection">

                    <div className="form-group">
                        <label htmlFor="org-name">Organization Name</label>
                        <input
                            id="org-name"
                            type="text"
                            className="form-control"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="org-description">Description</label>
                        <input
                            id="org-description"
                            type="text"
                            className="form-control"
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                        />
                    </div>

                    <div className="button-row">
                        <button type="submit" className="btn btn-primary" disabled={savingNew}>
                            {savingNew ? "Creating..." : "Create Organization"}
                        </button>
                        <button type="button" className="btn" disabled={savingNew} onClick={() => setCreating(false)}>
                            Cancel
                        </button>
                    </div>

                </form>

            )}

            {loading || selectedLoading ? (

                <p className="field-hint">Loading...</p>

            ) : organizations.length === 0 ? (

                <p className="empty-state">
                    Organizations aren't available on this deployment right now.
                </p>

            ) : (

                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Your Role</th>
                                <th><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {organizations.map((org) => (
                                <tr key={org.id}>
                                    <td>{org.name}</td>
                                    <td>{org.accountType === "personal" ? "Personal" : "Organization"}</td>
                                    <td><span className="badge">{org.roleDisplayName}</span></td>
                                    <td>
                                        <button type="button" className="btn btn-secondary" onClick={() => handleSelect(org)}>
                                            {org.accountType === "personal" ? "View" : "Manage"}
                                        </button>
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

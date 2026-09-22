import { useEffect, useState } from "react";

import useToast from "../../../hooks/useToast";
import useConfirm from "../../../hooks/useConfirm";
import usePagination from "../../../hooks/usePagination";
import Pagination from "../../common/Pagination";
import InviteMemberForm from "./InviteMemberForm";
import RolesPermissionsTable from "./RolesPermissionsTable";
import AuditLogPanel from "./AuditLogPanel";
import OrgCredentialsPanel from "./OrgCredentialsPanel";
import {
    listMembers, changeMemberRole, removeMember, listPendingInvitations, revokeInvitation
} from "../../../services/organizationService";

function formatDateTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

// Members / Pending Invitations / Roles & Permissions for one selected
// organization - see OrganizationsView, which owns which org is currently
// selected (local state for now; Phase 6's org switcher will make this a
// portal-wide concept instead of something only this settings page knows
// about).
export default function OrganizationDetail({ organization, onBack }) {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const canManageMembers = organization.permissions?.includes("members.manage");
    const canViewAuditLogs = organization.permissions?.includes("audit_logs.view");
    const canReadCredentials = organization.permissions?.includes("credentials.read");
    const canWriteCredentials = organization.permissions?.includes("credentials.write");

    const [members, setMembers] = useState([]);
    const [membersLoading, setMembersLoading] = useState(true);

    const [invitations, setInvitations] = useState([]);
    const [invitationsLoading, setInvitationsLoading] = useState(true);

    const [savingMemberId, setSavingMemberId] = useState(null);

    function loadMembers() {
        setMembersLoading(true);
        listMembers(organization.id)
            .then((result) => setMembers(result.members || []))
            .catch((err) => console.error(err))
            .finally(() => setMembersLoading(false));
    }

    function loadInvitations() {
        if (!canManageMembers) {
            setInvitationsLoading(false);
            return;
        }
        setInvitationsLoading(true);
        listPendingInvitations(organization.id)
            .then((result) => setInvitations(result.invitations || []))
            .catch((err) => console.error(err))
            .finally(() => setInvitationsLoading(false));
    }

    useEffect(() => {
        loadMembers();
        loadInvitations();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organization.id]);

    const {
        page: membersPage, setPage: setMembersPage, pageCount: membersPageCount,
        pageItems: membersPageItems, totalCount: membersTotalCount,
        startIndex: membersStartIndex, endIndex: membersEndIndex
    } = usePagination(members, 10);

    const {
        page: invitationsPage, setPage: setInvitationsPage, pageCount: invitationsPageCount,
        pageItems: invitationsPageItems, totalCount: invitationsTotalCount,
        startIndex: invitationsStartIndex, endIndex: invitationsEndIndex
    } = usePagination(invitations, 10);

    async function handleChangeRole(member, newRoleKey) {

        if (newRoleKey === member.roleKey) return;

        setSavingMemberId(member.id);

        try {

            const result = await changeMemberRole(organization.id, member.id, newRoleKey);

            if (!result.success) {
                toast.show(result.message || "Unable to change role.", "error");
                return;
            }

            toast.show("Role updated.", "success");
            loadMembers();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to change role.", "error");
        }
        finally {
            setSavingMemberId(null);
        }

    }

    async function handleRemove(member) {

        if (!(await confirm({
            title: "Remove this member?",
            message: `${member.displayName || member.email || member.userId} will lose access to this organization.`,
            confirmLabel: "Remove Member",
            danger: true
        }))) {
            return;
        }

        setSavingMemberId(member.id);

        try {

            const result = await removeMember(organization.id, member.id);

            if (!result.success) {
                toast.show(result.message || "Unable to remove member.", "error");
                return;
            }

            toast.show("Member removed.", "success");
            loadMembers();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to remove member.", "error");
        }
        finally {
            setSavingMemberId(null);
        }

    }

    async function handleRevokeInvitation(invitation) {

        if (!(await confirm({
            title: "Revoke this invitation?",
            message: `The invitation to ${invitation.email} will no longer work.`,
            confirmLabel: "Revoke Invitation",
            danger: true
        }))) {
            return;
        }

        try {

            await revokeInvitation(organization.id, invitation.id);
            toast.show("Invitation revoked.", "success");
            loadInvitations();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to revoke invitation.", "error");
        }

    }

    return (

        <>

        {dialog}

        <div className="access-panel-header" style={{ marginBottom: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onBack}>&larr; All Organizations</button>
        </div>

        <div className="card">

            <div className="access-panel-header">
                <h2 className="card-title">{organization.name}</h2>
                {canManageMembers && <InviteMemberForm orgId={organization.id} onSent={loadInvitations} />}
            </div>

            <div className="settings-subsection">

                <h3 className="settings-subhead">Members</h3>

                {membersLoading ? (

                    <p className="field-hint">Loading...</p>

                ) : membersPageItems.length === 0 ? (

                    <p className="empty-state">No members yet.</p>

                ) : (

                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Joined</th>
                                    {canManageMembers && <th><span className="visually-hidden">Actions</span></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {membersPageItems.map((member) => (
                                    <tr key={member.id}>
                                        <td>{member.displayName || "—"}</td>
                                        <td>{member.email || member.userId}</td>
                                        <td>
                                            {canManageMembers ? (
                                                <select
                                                    className="form-control"
                                                    value={member.roleKey}
                                                    disabled={savingMemberId === member.id}
                                                    onChange={(e) => handleChangeRole(member, e.target.value)}
                                                >
                                                    <option value="admin">Admin</option>
                                                    <option value="contributor">Contributor</option>
                                                    <option value="read">Read</option>
                                                </select>
                                            ) : (
                                                <span className="badge">{member.roleDisplayName}</span>
                                            )}
                                        </td>
                                        <td>{formatDateTime(member.joinedAtUtc)}</td>
                                        {canManageMembers && (
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-danger"
                                                    disabled={savingMemberId === member.id}
                                                    onClick={() => handleRemove(member)}
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                )}

                <Pagination
                    page={membersPage}
                    pageCount={membersPageCount}
                    totalCount={membersTotalCount}
                    startIndex={membersStartIndex}
                    endIndex={membersEndIndex}
                    onPageChange={setMembersPage}
                />

            </div>

            {canManageMembers && (

                <div className="settings-subsection">

                    <h3 className="settings-subhead">Pending Invitations</h3>

                    {invitationsLoading ? (

                        <p className="field-hint">Loading...</p>

                    ) : invitationsPageItems.length === 0 ? (

                        <p className="empty-state">No pending invitations.</p>

                    ) : (

                        <div className="table-scroll">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>Sent</th>
                                        <th>Expires</th>
                                        <th><span className="visually-hidden">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invitationsPageItems.map((invitation) => (
                                        <tr key={invitation.id}>
                                            <td>{invitation.email}</td>
                                            <td><span className="badge">{invitation.roleDisplayName}</span></td>
                                            <td>{formatDateTime(invitation.createdAtUtc)}</td>
                                            <td>{formatDateTime(invitation.expiresAtUtc)}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-danger"
                                                    onClick={() => handleRevokeInvitation(invitation)}
                                                >
                                                    Revoke
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                    )}

                    <Pagination
                        page={invitationsPage}
                        pageCount={invitationsPageCount}
                        totalCount={invitationsTotalCount}
                        startIndex={invitationsStartIndex}
                        endIndex={invitationsEndIndex}
                        onPageChange={setInvitationsPage}
                    />

                </div>

            )}

        </div>

        <div className="card">
            <h2 className="card-title">Roles &amp; Permissions</h2>
            <p className="field-hint" style={{ marginTop: 0 }}>
                Fixed for every organization - Contributors can deploy using a saved credential without
                ever seeing it.
            </p>
            <RolesPermissionsTable />
        </div>

        {canReadCredentials && (

            <div className="card">
                <h2 className="card-title">Credentials</h2>
                <p className="field-hint" style={{ marginTop: 0 }}>
                    Used for deployments and cloud service actions in this organization. Contributors can
                    use a saved credential without ever seeing it.
                </p>
                <OrgCredentialsPanel orgId={organization.id} canWrite={canWriteCredentials} />
            </div>

        )}

        {canViewAuditLogs && (

            <div className="card">
                <h2 className="card-title">Audit Logs</h2>
                <AuditLogPanel orgId={organization.id} />
            </div>

        )}

        </>

    );

}

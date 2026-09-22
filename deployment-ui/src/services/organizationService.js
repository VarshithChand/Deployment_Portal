import organizationsApi from "../api/organizationsApi";
import invitationsApi from "../api/invitationsApi";

// Organizations, membership, and invitations - see OrganizationsController/
// OrganizationMembersController/InvitationsController. Every call here
// requires an existing session, same as authLoginService.js's post-login
// exports - authApi's token/cookie handling already covers that.
// Organizations are a Postgres-required feature server-side (see
// SettingsViewDto.OrganizationsEnabled) - every one of these can resolve
// to a 503 on a JSON-file-only deployment, which callers surface the same
// way they already handle any other backend error message.

export const listMyOrganizations = async () => {
    const response = await organizationsApi.get("/");
    return response.data;
};

export const createOrganization = async ({ name, slug, description }) => {
    const response = await organizationsApi.post("/", { name, slug, description });
    return response.data;
};

export const getOrganization = async (id) => {
    const response = await organizationsApi.get(`/${id}`);
    return response.data;
};

export const updateOrganization = async (id, { name, description }) => {
    const response = await organizationsApi.put(`/${id}`, { name, description });
    return response.data;
};

// The fixed Admin/Contributor/Read -> permission-key matrix - same for
// every organization (see OrganizationService.GetRolePermissionMatrixAsync),
// not org-scoped.
export const getRolePermissionMatrix = async () => {
    const response = await organizationsApi.get("/roles-matrix");
    return response.data;
};

export const listMembers = async (orgId) => {
    const response = await organizationsApi.get(`/${orgId}/members`);
    return response.data;
};

export const changeMemberRole = async (orgId, memberId, roleKey) => {
    const response = await organizationsApi.patch(`/${orgId}/members/${memberId}`, { roleKey });
    return response.data;
};

export const removeMember = async (orgId, memberId) => {
    const response = await organizationsApi.delete(`/${orgId}/members/${memberId}`);
    return response.data;
};

export const listPendingInvitations = async (orgId) => {
    const response = await organizationsApi.get(`/${orgId}/invitations`);
    return response.data;
};

export const sendInvitation = async (orgId, { email, roleKey }) => {
    const response = await organizationsApi.post(`/${orgId}/invitations`, { email, roleKey });
    return response.data;
};

export const revokeInvitation = async (orgId, invitationId) => {
    const response = await organizationsApi.delete(`/${orgId}/invitations/${invitationId}`);
    return response.data;
};

// Settings > Organizations > Credentials - see OrgCredentialService/
// OrganizationCredentialsController. Never returns a secret value, only
// {id, provider, name, config, configured} - see that backend's own
// comment for why.
export const listOrganizationCredentials = async (orgId) => {
    const response = await organizationsApi.get(`/${orgId}/credentials`);
    return response.data;
};

export const createOrganizationCredential = async (orgId, { provider, name, config, secret }) => {
    const response = await organizationsApi.post(`/${orgId}/credentials`, { provider, name, config, secret });
    return response.data;
};

export const deleteOrganizationCredential = async (orgId, credentialId) => {
    const response = await organizationsApi.delete(`/${orgId}/credentials/${credentialId}`);
    return response.data;
};

// Settings > Organizations > Audit Logs - audit_logs.view-gated server-side
// (Admin only in the seeded matrix). Returns the most recent 200 entries
// (see AuditLogService.ListAsync's own cap) - paginated client-side via
// usePagination, this project's own established convention.
export const listAuditLogs = async (orgId) => {
    const response = await organizationsApi.get(`/${orgId}/audit-logs`);
    return response.data;
};

// The one call in this file usable BEFORE a session is fully "in" an
// organization - see InvitationAcceptController.Accept, which itself
// still requires an authenticated caller (signed in or freshly signed up),
// just not an existing membership.
export const acceptInvitation = async (token) => {
    const response = await invitationsApi.post("/accept", { token });
    return response.data;
};

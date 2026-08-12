import { useCallback, useEffect, useState } from "react";

import useToast from "../hooks/useToast";
import useConfirm from "../hooks/useConfirm";
import PageLayout from "../components/layout/PageLayout";
import PageAdminAccessButton from "../components/common/PageAdminAccessButton";
import CopyButton from "../components/common/CopyButton";
import SectionTabs from "../components/common/SectionTabs";

import PatUserAccessModal from "../components/PatUserAccessModal";
import ApplicationSupportSection from "../components/services/ApplicationSupportSection";

import { getUsers, forceLogoutUser, blockUser, unblockUser, deleteUser, removeDuplicateUsers } from "../services/adminService";
import { getProjects } from "../services/pmscoreService";

import {
    getAuditLogs,
    getApiKeys,
    createApiKey,
    revokeApiKey
} from "../services/securityService";

// The current browser's own session key, same format PortalIdentity
// derives server-side from this same value (see apiBase.js's
// SESSION_STORAGE_KEY) - used only to stop an admin from accidentally
// blocking/signing out their own active session from this table.
const MY_SESSION_KEY = `sess:${localStorage.getItem("portalSessionId") || ""}`;

const SECTIONS = [
    { key: "users", label: "Users" },
    { key: "projects", label: "Environments" },
    { key: "security", label: "Security" },
    { key: "application-support", label: "Application Support" }
];

// Mirrors Settings.jsx's own "?view=" pattern - a raw/stale/hand-edited
// value falls back to the default section instead of rendering nothing.
function readSectionFromUrl() {

    const requested = new URLSearchParams(window.location.search).get("view");

    return SECTIONS.some((s) => s.key === requested) ? requested : "users";

}

export default function Services() {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [section, setSectionState] = useState(readSectionFromUrl);

    const setSection = useCallback((next) => {

        setSectionState(next);

        const url = new URL(window.location.href);

        if (next === "users") {
            url.searchParams.delete("view");
        }
        else {
            url.searchParams.set("view", next);
        }

        window.history.replaceState(null, "", url);

    }, []);

    // ---------- Users ----------
    // Real PAT users (see AdminUsersController) - read-only, since a PAT
    // user isn't an account created/edited here; it exists only because
    // someone configured a token in Settings > GitHub.

    const [users, setUsers] = useState([]);
    const [accessModalUser, setAccessModalUser] = useState(null);
    const [deviceInfoUser, setDeviceInfoUser] = useState(null);
    const [deduping, setDeduping] = useState(false);

    async function loadUsers() {

        try {

            const response = await getUsers();
            setUsers(Array.isArray(response.data) ? response.data : []);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to load PAT users.", "error");

        }

    }

    // Groups of repeated rows for the same real GitHub account (the
    // account column of usedEndpoints/... isn't unique - patOwnerLogin
    // is), so the "Remove Duplicates" button only shows up when there's
    // actually something to merge.
    const duplicatePatOwnerLogins = new Set(
        Object.entries(
            users.reduce((counts, u) => {
                if (!u.patOwnerLogin.startsWith("Unknown")) {
                    counts[u.patOwnerLogin] = (counts[u.patOwnerLogin] || 0) + 1;
                }
                return counts;
            }, {})
        )
            .filter(([, count]) => count > 1)
            .map(([login]) => login)
    );

    async function handleRemoveDuplicates() {

        if (!(await confirm({
            title: "Remove duplicate users?",
            message: "For every real GitHub account with more than one row here, this keeps " +
                "whichever session was active most recently and permanently deletes the rest " +
                "(their credentials, sidebar restrictions, everything). This cannot be undone.",
            confirmLabel: "Remove Duplicates",
            danger: true
        }))) {
            return;
        }

        try {

            setDeduping(true);

            const response = await removeDuplicateUsers();
            const removedCount = response.data?.removedCount ?? 0;

            toast.show(
                removedCount > 0
                    ? `Removed ${removedCount} duplicate ${removedCount === 1 ? "user" : "users"}.`
                    : "No duplicates found.",
                "success"
            );

            loadUsers();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to remove duplicates.", "error");

        }
        finally {

            setDeduping(false);

        }

    }

    async function handleForceLogoutUser(user) {

        if (!(await confirm({
            title: "Sign out this user?",
            message: `Sign out '${user.patOwnerLogin}'? Their saved token stays stored but stops ` +
                "working until they reconnect — they'll see the \"Connect your GitHub repository\" " +
                "screen again next time they use the portal (immediately, if they have it open right now).",
            confirmLabel: "Sign Out",
            danger: true
        }))) {
            return;
        }

        try {

            await forceLogoutUser(user.key);
            toast.show(`Signed out '${user.patOwnerLogin}'.`, "success");
            loadUsers();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to sign out that user.", "error");

        }

    }

    async function handleBlockUser(user) {

        if (!(await confirm({
            title: "Block this user?",
            message: `Block '${user.patOwnerLogin}'? Every request from their session will be ` +
                "rejected from now on, even with their existing token, until you unblock them - " +
                "their screen will show a blocked overlay within about 15 seconds.",
            confirmLabel: "Block",
            danger: true
        }))) {
            return;
        }

        try {

            await blockUser(user.key);
            toast.show(`Blocked '${user.patOwnerLogin}'.`, "success");
            loadUsers();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to block that user.", "error");

        }

    }

    async function handleUnblockUser(user) {

        try {

            await unblockUser(user.key);
            toast.show(`Unblocked '${user.patOwnerLogin}'.`, "success");
            loadUsers();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to unblock that user.", "error");

        }

    }

    async function handleDeleteUser(user) {

        if (!(await confirm({
            title: "Delete this user?",
            message: `Permanently delete '${user.patOwnerLogin}'? This removes their GitHub, ` +
                "AWS/Azure/GCP credentials and sidebar restrictions entirely - not a sign-out, " +
                "there's nothing to reconnect back to. If this browser returns, it starts over as " +
                "a brand-new session. This cannot be undone.",
            confirmLabel: "Delete",
            danger: true
        }))) {
            return;
        }

        try {

            await deleteUser(user.key);
            toast.show(`Deleted '${user.patOwnerLogin}'.`, "success");
            loadUsers();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to delete that user.", "error");

        }

    }

    // ---------- Projects ----------
    // The real environment list (see PmsCoreProjectsController) - read-
    // only, since editing already lives in Settings > Environments.

    const [projects, setProjects] = useState([]);

    async function loadProjects() {

        try {

            const response = await getProjects();
            setProjects(Array.isArray(response.data) ? response.data : []);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to load environments.", "error");

        }

    }

    // ---------- Security ----------

    const [auditLogs, setAuditLogs] = useState([]);
    const [apiKeys, setApiKeys] = useState([]);
    const [newKeyName, setNewKeyName] = useState("");
    const [justCreatedKey, setJustCreatedKey] = useState(null);

    async function loadSecurity() {

        try {

            // Users too, purely to drive the "API Usage" panel below
            // (PatOwnerLogin + usedEndpoints) - a failure here shouldn't
            // block Audit Log/API Keys from showing, since it's admin-
            // gated separately and a non-admin PAT-owning admin edge case
            // could otherwise blank the whole tab.
            const [logsRes, keysRes] = await Promise.all([getAuditLogs(), getApiKeys()]);
            setAuditLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
            setApiKeys(Array.isArray(keysRes.data) ? keysRes.data : []);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to load security data.", "error");

        }

        try {

            const usersRes = await getUsers();
            setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);

        }
        catch (err) {

            console.error(err);

        }

    }

    async function handleCreateApiKey(e) {

        e.preventDefault();

        try {

            const response = await createApiKey(newKeyName.trim() || "Unnamed key");
            setJustCreatedKey(response.data);
            setNewKeyName("");
            loadSecurity();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to create API key.", "error");

        }

    }

    async function handleRevokeKey(id, name) {

        if (!(await confirm({
            title: "Revoke API key?",
            message: `Revoke '${name}'? Anything using it will stop working immediately.`,
            confirmLabel: "Revoke",
            danger: true
        }))) {
            return;
        }

        try {

            await revokeApiKey(id);
            toast.show(`Revoked '${name}'.`, "success");
            loadSecurity();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to revoke key.", "error");

        }

    }

    // Always refetches on switch rather than caching "already loaded once"
    // - a section whose first load failed (a transient blip, a moment of
    // session flux around login/admin status) used to stay stuck empty
    // forever, since nothing ever retried it. Also closes the sidebar-
    // access popup if it was left open when navigating away from Users,
    // so it doesn't keep floating over whichever section you switch to.
    function switchSection(next) {

        setSection(next);

        if (next !== "users") {
            setAccessModalUser(null);
            setDeviceInfoUser(null);
        }

        if (next === "users") loadUsers();
        else if (next === "projects") loadProjects();
        else if (next === "security") loadSecurity();

    }

    // Load the default section's data once on mount.
    useEffect(() => {

        loadUsers();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (

        <PageLayout title="Services" actions={<PageAdminAccessButton pageKey="services" pageLabel="Services" />}>

            {dialog}

            <div className="card">

                <SectionTabs sections={SECTIONS} active={section} onSelect={switchSection} />

                {section === "users" && (

                    <>

                    <div className="access-panel-header">

                        <h2 className="card-title">Users</h2>

                        {duplicatePatOwnerLogins.size > 0 && (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={handleRemoveDuplicates}
                                disabled={deduping}
                            >
                                {deduping
                                    ? "Removing..."
                                    : `Remove Duplicates (${duplicatePatOwnerLogins.size})`}
                            </button>
                        )}

                    </div>

                    <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                        Real PAT users — every browser/session that has configured a Personal
                        Access Token on this portal. Click a name to manage that user's sidebar
                        access.
                    </p>

                    {users.length === 0 ? (

                        <p className="empty-state">
                            No PAT users yet — nobody has configured a Personal Access Token on
                            this portal.
                        </p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>PAT Owner</th>
                                    <th>Repository</th>
                                    <th>Restricted</th>
                                    <th>Device</th>
                                    <th>Last Active</th>
                                    <th>Status</th>
                                    <th></th>
                                </tr>
                            </thead>

                            <tbody>

                                {users.map((u) => (

                                    <tr key={u.key}>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-link"
                                                onClick={() => setAccessModalUser(u)}
                                                title="Manage sidebar access"
                                            >
                                                {u.patOwnerLogin}
                                            </button>
                                        </td>
                                        <td>{u.owner}/{u.repository}</td>
                                        <td>
                                            {u.restrictedTabCount > 0 ? (
                                                <span className="badge badge-danger">{u.restrictedTabCount} restricted</span>
                                            ) : (
                                                <span className="badge badge-success">Fully visible</span>
                                            )}
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-link"
                                                onClick={() => setDeviceInfoUser(u)}
                                                title="Show IP address"
                                            >
                                                {u.device}
                                            </button>
                                        </td>
                                        <td>
                                            {u.lastActiveUtc
                                                ? new Date(u.lastActiveUtc).toLocaleString()
                                                : "Not seen since restart"}
                                        </td>
                                        <td>
                                            {u.isBlocked ? (
                                                <span className="badge badge-danger">Blocked</span>
                                            ) : u.isSignedOut ? (
                                                <span className="badge badge-warning">Signed Out</span>
                                            ) : (
                                                <span className="badge badge-success">Active</span>
                                            )}
                                        </td>
                                        <td>

                                            <div className="button-row">

                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => handleForceLogoutUser(u)}
                                                    disabled={u.key === MY_SESSION_KEY}
                                                    title={u.key === MY_SESSION_KEY ? "You can't sign out your own session here" : undefined}
                                                >
                                                    Sign Out
                                                </button>

                                                {u.isBlocked ? (

                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => handleUnblockUser(u)}
                                                    >
                                                        Unblock
                                                    </button>

                                                ) : (

                                                    <button
                                                        type="button"
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleBlockUser(u)}
                                                        disabled={u.key === MY_SESSION_KEY}
                                                        title={u.key === MY_SESSION_KEY ? "You can't block your own session here" : undefined}
                                                    >
                                                        Block
                                                    </button>

                                                )}

                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleDeleteUser(u)}
                                                    disabled={u.key === MY_SESSION_KEY}
                                                    title={u.key === MY_SESSION_KEY ? "You can't delete your own session here" : undefined}
                                                >
                                                    Delete
                                                </button>

                                            </div>

                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                    </>

                )}

                {accessModalUser && (

                    <PatUserAccessModal
                        patUserKey={accessModalUser.key}
                        patUserLabel={accessModalUser.patOwnerLogin}
                        onClose={() => setAccessModalUser(null)}
                        onSaved={loadUsers}
                    />

                )}

                {deviceInfoUser && (

                    <div
                        className="dialog-backdrop"
                        role="presentation"
                        onClick={() => setDeviceInfoUser(null)}
                        onKeyDown={(e) => { if (e.key === "Escape") setDeviceInfoUser(null); }}
                    >

                        <div
                            className="dialog"
                            role="alertdialog"
                            aria-modal="true"
                            aria-labelledby="device-info-title"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                        >

                            <h2 id="device-info-title">
                                {deviceInfoUser.patOwnerLogin}
                            </h2>

                            <p>
                                <strong>Device:</strong> {deviceInfoUser.device}
                                <br />
                                <strong>IP address:</strong>{" "}
                                {deviceInfoUser.ipAddress || "Unknown — not seen since restart"}
                            </p>

                            <div>
                                <button type="button" className="btn" onClick={() => setDeviceInfoUser(null)}>
                                    Close
                                </button>
                            </div>

                        </div>

                    </div>

                )}

                {section === "projects" && (

                    <>

                    <h2 className="card-title">Environments</h2>

                    <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                        The portal's real environment list. Editing lives in{" "}
                        <strong>Settings → Environments</strong>, not here.
                    </p>

                    {projects.length === 0 ? (

                        <p className="empty-state">
                            No environments configured yet — add one in Settings → Environments.
                        </p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Workflow</th>
                                    <th>Cloud Provider</th>
                                </tr>
                            </thead>

                            <tbody>

                                {projects.map((p) => (

                                    <tr key={p.name}>
                                        <td>{p.name}</td>
                                        <td>{p.workflowName}</td>
                                        <td>
                                            {p.cloudProvider === "none" ? (
                                                <span className="badge badge-secondary">none</span>
                                            ) : (
                                                <span className="badge badge-info">{p.cloudProvider}</span>
                                            )}
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                    </>

                )}

                {section === "security" && (

                    <>

                    <h2 className="card-title">API Keys</h2>

                    {justCreatedKey && (

                        <div className="repo-preview" style={{ marginBottom: 16, borderColor: "var(--heading-accent)" }}>

                            <p className="repo-preview-description">
                                <strong>{justCreatedKey.name}</strong> created — copy this key now,
                                it won't be shown again:
                            </p>

                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <code className="commit-sha">{justCreatedKey.key}</code>
                                <CopyButton value={justCreatedKey.key} label="Copy API key" />
                            </div>

                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ marginTop: 10 }}
                                onClick={() => setJustCreatedKey(null)}
                            >
                                Dismiss
                            </button>

                        </div>

                    )}

                    <form style={{ display: "flex", gap: 10, marginBottom: 20 }} onSubmit={handleCreateApiKey}>
                        <input
                            className="form-control"
                            placeholder="Key name (e.g. CI pipeline)"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                        />
                        <button type="submit" className="btn btn-primary">Create Key</button>
                    </form>

                    {apiKeys.length === 0 ? (

                        <p className="empty-state">No API keys yet — create one above.</p>

                    ) : (

                        <div className="api-key-grid">

                        {apiKeys.map((k) => (

                            <div key={k.id} className="repo-preview api-key-card">

                                <div className="api-key-card-header">

                                    <strong>{k.name}</strong>

                                    <span className={`badge ${k.revoked ? "badge-danger" : "badge-success"}`}>
                                        {k.revoked ? "revoked" : "active"}
                                    </span>

                                </div>

                                <code className="commit-sha">{k.prefix}...</code>

                                <p className="api-key-card-meta">
                                    Owner: {k.ownerLogin}
                                    <br />
                                    Created {new Date(k.createdAt).toLocaleDateString()}
                                </p>

                                {!k.revoked && (
                                    <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        onClick={() => handleRevokeKey(k.id, k.name)}
                                    >
                                        Revoke
                                    </button>
                                )}

                            </div>

                        ))}

                        </div>

                    )}

                    <h2 className="card-title" style={{ marginTop: 30 }}>API Usage</h2>

                    <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                        Which of this portal's own APIs each PAT user has actually called (see the
                        Users tab for who's who) — reset on server restart, same as Last Active.
                    </p>

                    {users.length === 0 ? (

                        <p className="empty-state">No PAT users yet.</p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>PAT Owner</th>
                                    <th>APIs Used</th>
                                </tr>
                            </thead>

                            <tbody>

                                {users.map((u) => (

                                    <tr key={u.key}>
                                        <td>{u.patOwnerLogin}</td>
                                        <td>
                                            {u.usedEndpoints.length === 0 ? (
                                                <span className="empty-state">Not seen since restart</span>
                                            ) : (
                                                <div className="api-usage-list">
                                                    {u.usedEndpoints.map((endpoint) => (
                                                        <code key={endpoint} className="commit-sha api-usage-item">
                                                            {endpoint}
                                                        </code>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                    <h2 className="card-title" style={{ marginTop: 30 }}>Audit Log</h2>

                    <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                        The portal's real activity log — recent settings changes and backend
                        errors, kept in memory on the server, cleared on restart.
                    </p>

                    {auditLogs.length === 0 ? (

                        <p className="empty-state">No activity recorded yet.</p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>When</th>
                                    <th>Level</th>
                                    <th>Category</th>
                                    <th>Message</th>
                                </tr>
                            </thead>

                            <tbody>

                                {auditLogs.map((entry, i) => (

                                    <tr key={`${entry.timestamp}-${i}`}>
                                        <td>{new Date(entry.timestamp).toLocaleString()}</td>
                                        <td>
                                            <span className={`badge ${entry.level === "Error" ? "badge-danger" : "badge-info"}`}>
                                                {entry.level}
                                            </span>
                                        </td>
                                        <td>{entry.category}</td>
                                        <td>{entry.message}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                    </>

                )}

                {section === "application-support" && <ApplicationSupportSection />}

            </div>

        </PageLayout>

    );

}

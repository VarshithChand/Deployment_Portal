import { Fragment, useEffect, useState } from "react";

import useToast from "../hooks/useToast";
import useConfirm from "../hooks/useConfirm";
import PageLayout from "../components/layout/PageLayout";
import CopyButton from "../components/common/CopyButton";
import SectionTabs from "../components/common/SectionTabs";

import {
    getUsers,
    createUser,
    updateUser,
    removeUser,
    getRoles
} from "../services/adminService";

import {
    getProjects,
    createProject,
    updateProject,
    removeProject,
    getProjectTasks,
    createTask,
    updateTask,
    removeTask
} from "../services/pmscoreService";

import {
    getAuditLogs,
    getApiKeys,
    createApiKey,
    revokeApiKey
} from "../services/securityService";

const SECTIONS = [
    { key: "users", label: "Users (AdminAPI)" },
    { key: "projects", label: "Projects (PMSCoreAPI)" },
    { key: "security", label: "Security (SecurityAPI)" }
];

const PROJECT_STATUSES = ["Planning", "Active", "OnHold", "Completed"];
const TASK_STATUSES = ["Todo", "InProgress", "Done"];

export default function Services() {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [section, setSection] = useState("users");
    const [loaded, setLoaded] = useState({ users: false, projects: false, security: false });

    // ---------- Users ----------

    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [showNewUser, setShowNewUser] = useState(false);
    const [newUser, setNewUser] = useState({ username: "", email: "", role: "Viewer" });

    async function loadUsers() {

        try {

            const [usersRes, rolesRes] = await Promise.all([getUsers(), getRoles()]);
            setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
            setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to reach AdminAPI. Is it running?", "error");

        }
        finally {

            setLoaded((l) => ({ ...l, users: true }));

        }

    }

    async function handleCreateUser(e) {

        e.preventDefault();

        if (!newUser.username.trim()) {
            toast.show("A username is required.", "error");
            return;
        }

        try {

            await createUser(newUser);
            toast.show(`User '${newUser.username}' created.`, "success");
            setNewUser({ username: "", email: "", role: "Viewer" });
            setShowNewUser(false);
            loadUsers();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to create user.", "error");

        }

    }

    async function handleRoleChange(id, role) {

        try {

            await updateUser(id, { role });
            toast.show("Role updated.", "success");
            loadUsers();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to update role.", "error");

        }

    }

    async function handleToggleActive(user) {

        try {

            await updateUser(user.id, { active: !user.active });
            loadUsers();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to update user.", "error");

        }

    }

    async function handleRemoveUser(id, username) {

        if (!(await confirm({
            title: "Remove user?",
            message: `Remove '${username}'? This cannot be undone.`,
            confirmLabel: "Remove",
            danger: true
        }))) {
            return;
        }

        try {

            await removeUser(id);
            toast.show(`Removed '${username}'.`, "success");
            loadUsers();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to remove user.", "error");

        }

    }

    // ---------- Projects ----------

    const [projects, setProjects] = useState([]);
    const [expandedProject, setExpandedProject] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [showNewProject, setShowNewProject] = useState(false);
    const [newProject, setNewProject] = useState({ name: "", description: "" });
    const [newTaskTitle, setNewTaskTitle] = useState("");
    const [newTaskAssignee, setNewTaskAssignee] = useState("");

    async function loadProjects() {

        try {

            const response = await getProjects();
            setProjects(Array.isArray(response.data) ? response.data : []);

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to reach PMSCoreAPI. Is it running?", "error");

        }
        finally {

            setLoaded((l) => ({ ...l, projects: true }));

        }

    }

    async function handleCreateProject(e) {

        e.preventDefault();

        if (!newProject.name.trim()) {
            toast.show("A project name is required.", "error");
            return;
        }

        try {

            await createProject(newProject);
            toast.show(`Project '${newProject.name}' created.`, "success");
            setNewProject({ name: "", description: "" });
            setShowNewProject(false);
            loadProjects();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to create project.", "error");

        }

    }

    async function handleProjectStatusChange(id, status) {

        try {

            await updateProject(id, { status });
            loadProjects();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to update project.", "error");

        }

    }

    async function handleRemoveProject(id, name) {

        if (!(await confirm({
            title: "Remove project?",
            message: `Remove '${name}' and all of its tasks? This cannot be undone.`,
            confirmLabel: "Remove",
            danger: true
        }))) {
            return;
        }

        try {

            await removeProject(id);
            toast.show(`Removed '${name}'.`, "success");
            if (expandedProject === id) setExpandedProject(null);
            loadProjects();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to remove project.", "error");

        }

    }

    async function toggleProjectTasks(id) {

        if (expandedProject === id) {
            setExpandedProject(null);
            return;
        }

        setExpandedProject(id);
        setLoadingTasks(true);

        try {

            const response = await getProjectTasks(id);
            setTasks(Array.isArray(response.data) ? response.data : []);

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to load tasks.", "error");

        }
        finally {

            setLoadingTasks(false);

        }

    }

    async function handleCreateTask(e, projectId) {

        e.preventDefault();

        if (!newTaskTitle.trim()) return;

        try {

            await createTask(projectId, { title: newTaskTitle.trim(), assignee: newTaskAssignee.trim() });
            setNewTaskTitle("");
            setNewTaskAssignee("");
            const response = await getProjectTasks(projectId);
            setTasks(Array.isArray(response.data) ? response.data : []);

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to create task.", "error");

        }

    }

    async function handleTaskStatusChange(taskId, projectId, status) {

        try {

            await updateTask(taskId, { status });
            const response = await getProjectTasks(projectId);
            setTasks(Array.isArray(response.data) ? response.data : []);

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to update task.", "error");

        }

    }

    async function handleRemoveTask(taskId, projectId) {

        try {

            await removeTask(taskId);
            const response = await getProjectTasks(projectId);
            setTasks(Array.isArray(response.data) ? response.data : []);

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to remove task.", "error");

        }

    }

    // ---------- Security ----------

    const [auditLogs, setAuditLogs] = useState([]);
    const [apiKeys, setApiKeys] = useState([]);
    const [newKeyName, setNewKeyName] = useState("");
    const [justCreatedKey, setJustCreatedKey] = useState(null);

    async function loadSecurity() {

        try {

            const [logsRes, keysRes] = await Promise.all([getAuditLogs(), getApiKeys()]);
            setAuditLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
            setApiKeys(Array.isArray(keysRes.data) ? keysRes.data : []);

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to reach SecurityAPI. Is it running?", "error");

        }
        finally {

            setLoaded((l) => ({ ...l, security: true }));

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

    function switchSection(next) {

        setSection(next);

        if (next === "users" && !loaded.users) loadUsers();
        else if (next === "projects" && !loaded.projects) loadProjects();
        else if (next === "security" && !loaded.security) loadSecurity();

    }

    // Load the default section's data once on mount.
    useEffect(() => {

        loadUsers();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (

        <PageLayout title="Services">

            {dialog}

            <div className="card">

                <SectionTabs sections={SECTIONS} active={section} onSelect={switchSection} />

                {section === "users" && (

                    <>

                    <div className="access-panel-header">
                        <h2 className="card-title">Users</h2>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowNewUser((v) => !v)}
                        >
                            {showNewUser ? "Cancel" : "+ New User"}
                        </button>
                    </div>

                    {showNewUser && (

                        <form className="card" style={{ marginBottom: 20 }} onSubmit={handleCreateUser}>

                            <div className="form-group">
                                <label>Username</label>
                                <input
                                    className="form-control"
                                    value={newUser.username}
                                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label>Email</label>
                                <input
                                    className="form-control"
                                    type="email"
                                    value={newUser.email}
                                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label>Role</label>
                                <select
                                    className="form-control"
                                    value={newUser.role}
                                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                                >
                                    {(roles.length > 0 ? roles : ["Admin", "Manager", "Viewer"]).map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>

                            <button type="submit" className="btn btn-primary">Create User</button>

                        </form>

                    )}

                    {users.length === 0 ? (

                        <p className="empty-state">No users yet — or AdminAPI isn't reachable.</p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th></th>
                                </tr>
                            </thead>

                            <tbody>

                                {users.map((u) => (

                                    <tr key={u.id}>
                                        <td>{u.username}</td>
                                        <td>{u.email}</td>
                                        <td>
                                            <select
                                                className="form-control"
                                                style={{ maxWidth: 130 }}
                                                value={u.role}
                                                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                            >
                                                {(roles.length > 0 ? roles : ["Admin", "Manager", "Viewer"]).map((r) => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className={`badge ${u.active ? "badge-success" : "badge-secondary"}`}
                                                style={{ border: "none", cursor: "pointer" }}
                                                onClick={() => handleToggleActive(u)}
                                                title="Click to toggle"
                                            >
                                                {u.active ? "active" : "inactive"}
                                            </button>
                                        </td>
                                        <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-danger btn-sm"
                                                onClick={() => handleRemoveUser(u.id, u.username)}
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                    </>

                )}

                {section === "projects" && (

                    <>

                    <div className="access-panel-header">
                        <h2 className="card-title">Projects</h2>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowNewProject((v) => !v)}
                        >
                            {showNewProject ? "Cancel" : "+ New Project"}
                        </button>
                    </div>

                    {showNewProject && (

                        <form className="card" style={{ marginBottom: 20 }} onSubmit={handleCreateProject}>

                            <div className="form-group">
                                <label>Name</label>
                                <input
                                    className="form-control"
                                    value={newProject.name}
                                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label>Description</label>
                                <input
                                    className="form-control"
                                    value={newProject.description}
                                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                                />
                            </div>

                            <button type="submit" className="btn btn-primary">Create Project</button>

                        </form>

                    )}

                    {projects.length === 0 ? (

                        <p className="empty-state">No projects yet — or PMSCoreAPI isn't reachable.</p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th></th>
                                </tr>
                            </thead>

                            <tbody>

                                {projects.map((p) => (

                                    <Fragment key={p.id}>

                                    <tr>
                                        <td>{p.name}</td>
                                        <td>{p.description}</td>
                                        <td>
                                            <select
                                                className="form-control"
                                                style={{ maxWidth: 130 }}
                                                value={p.status}
                                                onChange={(e) => handleProjectStatusChange(p.id, e.target.value)}
                                            >
                                                {PROJECT_STATUSES.map((s) => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                                        <td>

                                            <div className="button-row">

                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => toggleProjectTasks(p.id)}
                                                >
                                                    {expandedProject === p.id ? "Hide Tasks" : "Tasks"}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleRemoveProject(p.id, p.name)}
                                                >
                                                    Remove
                                                </button>

                                            </div>

                                        </td>
                                    </tr>

                                    {expandedProject === p.id && (

                                        <tr>
                                            <td colSpan={5}>

                                                {loadingTasks ? (

                                                    <p className="field-hint">Loading tasks...</p>

                                                ) : (

                                                    <>

                                                    <form
                                                        style={{ display: "flex", gap: 10, marginBottom: 12 }}
                                                        onSubmit={(e) => handleCreateTask(e, p.id)}
                                                    >
                                                        <input
                                                            className="form-control"
                                                            placeholder="Task title"
                                                            value={newTaskTitle}
                                                            onChange={(e) => setNewTaskTitle(e.target.value)}
                                                        />
                                                        <input
                                                            className="form-control"
                                                            placeholder="Assignee"
                                                            value={newTaskAssignee}
                                                            onChange={(e) => setNewTaskAssignee(e.target.value)}
                                                        />
                                                        <button type="submit" className="btn btn-primary btn-sm">Add Task</button>
                                                    </form>

                                                    {tasks.length === 0 ? (

                                                        <p className="empty-state">No tasks in this project yet.</p>

                                                    ) : (

                                                        <div className="table-scroll">
                                                        <table className="table">

                                                            <thead>
                                                                <tr>
                                                                    <th>Title</th>
                                                                    <th>Assignee</th>
                                                                    <th>Status</th>
                                                                    <th></th>
                                                                </tr>
                                                            </thead>

                                                            <tbody>

                                                                {tasks.map((t) => (

                                                                    <tr key={t.id}>
                                                                        <td>{t.title}</td>
                                                                        <td>{t.assignee || "—"}</td>
                                                                        <td>
                                                                            <select
                                                                                className="form-control"
                                                                                style={{ maxWidth: 130 }}
                                                                                value={t.status}
                                                                                onChange={(e) => handleTaskStatusChange(t.id, p.id, e.target.value)}
                                                                            >
                                                                                {TASK_STATUSES.map((s) => (
                                                                                    <option key={s} value={s}>{s}</option>
                                                                                ))}
                                                                            </select>
                                                                        </td>
                                                                        <td>
                                                                            <button
                                                                                type="button"
                                                                                className="btn btn-danger btn-sm"
                                                                                onClick={() => handleRemoveTask(t.id, p.id)}
                                                                            >
                                                                                Remove
                                                                            </button>
                                                                        </td>
                                                                    </tr>

                                                                ))}

                                                            </tbody>

                                                        </table>
                                                        </div>

                                                    )}

                                                    </>

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

                        <p className="empty-state">No API keys yet — or SecurityAPI isn't reachable.</p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Prefix</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th></th>
                                </tr>
                            </thead>

                            <tbody>

                                {apiKeys.map((k) => (

                                    <tr key={k.id}>
                                        <td>{k.name}</td>
                                        <td className="commit-sha">{k.prefix}...</td>
                                        <td>
                                            <span className={`badge ${k.revoked ? "badge-danger" : "badge-success"}`}>
                                                {k.revoked ? "revoked" : "active"}
                                            </span>
                                        </td>
                                        <td>{new Date(k.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            {!k.revoked && (
                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleRevokeKey(k.id, k.name)}
                                                >
                                                    Revoke
                                                </button>
                                            )}
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                    <h2 className="card-title" style={{ marginTop: 30 }}>Audit Log</h2>

                    {auditLogs.length === 0 ? (

                        <p className="empty-state">No audit log entries yet.</p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>When</th>
                                    <th>Actor</th>
                                    <th>Action</th>
                                    <th>Resource</th>
                                    <th>Outcome</th>
                                </tr>
                            </thead>

                            <tbody>

                                {auditLogs.map((entry) => (

                                    <tr key={entry.id}>
                                        <td>{new Date(entry.timestamp).toLocaleString()}</td>
                                        <td>{entry.actor}</td>
                                        <td>{entry.action}</td>
                                        <td>{entry.resource}</td>
                                        <td>
                                            <span className={`badge ${entry.outcome === "Success" ? "badge-success" : "badge-danger"}`}>
                                                {entry.outcome}
                                            </span>
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                    </>

                )}

            </div>

        </PageLayout>

    );

}

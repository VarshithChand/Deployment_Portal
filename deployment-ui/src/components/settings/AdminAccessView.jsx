import { useRef, useState } from "react";

import ClearableInput from "../common/ClearableInput";
import SectionTabs from "../common/SectionTabs";
import SidebarStateToggle from "../common/SidebarStateToggle";
import TypedConfirmDialog from "../cloudServices/TypedConfirmDialog";
import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import {
    resetUserMfa, generateMfaRecoveryCode, requireUserMfa, unrequireUserMfa,
    sendExportOtp, exportBackup, importBackup, wipeDatabase
} from "../../services/adminService";

const IMPORT_CONFIRM_PHRASE = "OVERWRITE EVERYTHING";
const WIPE_CONFIRM_PHRASE = "DELETE ALL DATA";

const TABS = [
    { key: "allowlist", label: "Admin Allowlist" },
    { key: "mfa", label: "MFA" },
    { key: "service-access", label: "Service Access" },
    { key: "backup", label: "Backup & Restore" }
];

// Settings > Admin Access - restricted to the single super-admin identity
// (see constants/settingsViews.js's SUPER_ADMIN_ONLY_VIEWS, enforced here
// only for hiding the tile/redirecting the view; the real enforcement is
// server-side, AdminGate.DenyUnlessSuperAdminAsync on every action this
// page calls). Four tabs, one console: who gets Admin (Admin Allowlist),
// who has MFA set up (MFA), what each PAT user can see in the sidebar
// (Service Access - the SAME feature Settings > Sidebar Access exposes to
// every general admin, reused here unchanged rather than duplicated, just
// with a second entry point for the super-admin), and a full export/import
// of this portal's own persisted state (Backup & Restore).
export default function AdminAccessView({
    adminUsernamesText,
    setAdminUsernamesText,
    handleSaveAdmins,
    adminEmailsText,
    setAdminEmailsText,
    handleSaveAdminEmails,
    savingAdminEmails,
    suspendedAdminUsernames,
    handleToggleSuspendAdmin,
    handleClear,
    patUsers,
    patUsersLoading,
    refreshPatUsers,
    selectedPatUserKey,
    setSelectedPatUserKey,
    sidebarAccessLoading,
    sidebarAccessMap,
    setSidebarTabState,
    sidebarTabs,
    handleSaveSidebarAccess,
    savingSidebarAccess,
    handleClearSidebarAccess,
    clearingSidebarAccess
}) {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [tab, setTab] = useState("allowlist");

    // ---- Admin Allowlist (per-row, not a raw textarea) -----------------
    //
    // Two separate backend lists share one input/table now: a GitHub
    // username (checked by AuthService.ExchangeCodeForUserAsync for a
    // GitHub-OAuth login) or an email (checked by AccountAuthService.
    // ResolveRoleSync/AuthService for every login method, including
    // password and Google - see SettingsController.SaveAdminEmails' own
    // comment on why that's "the actual source of truth going forward").
    // A GitHub username can never contain "@" (not a legal character in
    // one), so that single character reliably tells the two apart in both
    // directions - no separate "type" state needed anywhere below.
    const isEmailEntry = (value) => value.includes("@");

    const [newAdminEntry, setNewAdminEntry] = useState("");
    const [savingRow, setSavingRow] = useState(null);
    const [blockingKey, setBlockingKey] = useState(null);

    const adminUsernames = adminUsernamesText.split(",").map((u) => u.trim()).filter(Boolean);
    const adminEmails = adminEmailsText.split(",").map((e) => e.trim()).filter(Boolean);

    // Matches an allowlist entry to a real PAT session by GitHub login
    // (case-insensitive - GitHub usernames aren't case-sensitive) - used
    // for the Session column only; Suspend itself no longer needs one
    // (see handleSuspendClick below). Never matches an email entry - a PAT
    // session is keyed by GitHub login, which an email-only (password/
    // Google) admin was never issued.
    function findPatUser(username) {
        return (patUsers || []).find((u) => u.patOwnerLogin?.toLowerCase() === username.toLowerCase());
    }

    function isSuspended(username) {
        return (suspendedAdminUsernames || []).some((u) => u.toLowerCase() === username.toLowerCase());
    }

    async function handleAddAdmin(e) {

        e.preventDefault();

        const entry = newAdminEntry.trim();

        if (!entry) return;

        const isEmail = isEmailEntry(entry);
        const list = isEmail ? adminEmails : adminUsernames;

        if (list.some((v) => v.toLowerCase() === entry.toLowerCase())) {
            toast.show(`'${entry}' is already on the allowlist.`, "error");
            return;
        }

        const updated = [...list, isEmail ? entry.toLowerCase() : entry];

        try {

            setSavingRow(entry);

            if (isEmail) {
                setAdminEmailsText(updated.join(", "));
                await handleSaveAdminEmails(updated);
            }
            else {
                setAdminUsernamesText(updated.join(", "));
                await handleSaveAdmins(updated);
            }

            setNewAdminEntry("");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to add that entry.", "error");

        }
        finally {

            setSavingRow(null);

        }

    }

    async function handleRemoveAdmin(entry) {

        const isEmail = isEmailEntry(entry);

        if (!(await confirm({
            title: "Remove from admin allowlist?",
            message: `'${entry}' loses the Admin role on their next login. This only removes ` +
                "admin privileges - it doesn't block or delete their account.",
            confirmLabel: "Remove",
            danger: true
        }))) {
            return;
        }

        const list = isEmail ? adminEmails : adminUsernames;
        const updated = list.filter((v) => v.toLowerCase() !== entry.toLowerCase());

        try {

            setSavingRow(entry);

            if (isEmail) {
                setAdminEmailsText(updated.join(", "));
                await handleSaveAdminEmails(updated);
            }
            else {
                setAdminUsernamesText(updated.join(", "));
                await handleSaveAdmins(updated);
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to remove that entry.", "error");

        }
        finally {

            setSavingRow(null);

        }

    }

    // Mirrors handleClear("admins", ...) below, just for the email list -
    // that generic clear mechanism only ever touched AdminGitHubUsernames,
    // so this calls the email save path directly with an empty list
    // instead. handleSaveAdminEmails (in Settings.jsx) already carries its
    // own bootstrap-mode warning if this would leave BOTH lists empty.
    async function handleClearAdminEmails() {

        if (!(await confirm({
            title: "Clear saved data?",
            message: "Clear all saved admin emails? This cannot be undone.",
            confirmLabel: "Clear",
            danger: true
        }))) {
            return;
        }

        setAdminEmailsText("");
        await handleSaveAdminEmails([]);

    }

    // Stays on the allowlist (unlike Remove, which deletes the row) but
    // immediately stops counting as Admin - see AdminGate.IsAdminOrBootstrap,
    // which cross-checks this even against a session whose JWT already has
    // the Admin role claim baked in, so this takes effect on that person's
    // very next request. No logout, no re-typing the username to bring
    // them back later.
    async function handleSuspendClick(username) {

        try {

            setBlockingKey(username);
            await handleToggleSuspendAdmin(username, !isSuspended(username));

        }
        finally {

            setBlockingKey(null);

        }

    }

    // ---- MFA Console -----------------------------------------------

    const [resettingKey, setResettingKey] = useState(null);
    const [generatingKey, setGeneratingKey] = useState(null);
    const [requiringKey, setRequiringKey] = useState(null);
    const [revealedCode, setRevealedCode] = useState(null);

    // Toggles the admin-set "must set up MFA" flag - doesn't enroll the
    // user itself (only their own phone can scan a QR code), just makes
    // MfaEnforcementGate's nudge mandatory for them next time they load
    // the app, same escalation an AWS/Azure/GCP credential already
    // triggers on its own (see BootstrapController's MfaNudge block).
    async function handleToggleRequireMfa(user) {

        const wasRequired = user.isMfaRequired;

        if (!(await confirm({
            title: wasRequired ? "Remove the MFA requirement?" : "Require MFA for this user?",
            message: wasRequired
                ? `'${user.patOwnerLogin}' will no longer be nudged to set up MFA on their next visit ` +
                  "(unless a cloud credential they've saved makes it mandatory on its own)."
                : `'${user.patOwnerLogin}' will see a mandatory "set up MFA" prompt the next time they ` +
                  "load the portal, escalating to a full-screen block after 2 skips - same as saving " +
                  "an AWS/Azure/GCP credential already triggers. This doesn't enroll them for you; " +
                  "only their own authenticator app can do that.",
            confirmLabel: wasRequired ? "Remove Requirement" : "Require MFA"
        }))) {
            return;
        }

        try {

            setRequiringKey(user.key);
            await (wasRequired ? unrequireUserMfa(user.key) : requireUserMfa(user.key));
            toast.show(
                wasRequired ? `MFA no longer required for '${user.patOwnerLogin}'.` : `MFA now required for '${user.patOwnerLogin}'.`,
                "success"
            );
            refreshPatUsers();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to update this user's MFA requirement.", "error");

        }
        finally {

            setRequiringKey(null);

        }

    }

    async function handleResetMfa(user) {

        if (!(await confirm({
            title: "Reset this user's MFA?",
            message: `Reset MFA for '${user.patOwnerLogin}'? This removes their authenticator ` +
                "setup and any outstanding recovery codes entirely - they'll need to reconnect " +
                "without a code, then re-enroll if they still want MFA protecting their account.",
            confirmLabel: "Reset MFA",
            danger: true
        }))) {
            return;
        }

        try {

            setResettingKey(user.key);
            await resetUserMfa(user.key);
            toast.show(`MFA reset for '${user.patOwnerLogin}'.`, "success");
            refreshPatUsers();

        }
        catch (err) {

            console.error(err);
            toast.show("Failed to reset that user's MFA.", "error");

        }
        finally {

            setResettingKey(null);

        }

    }

    async function handleGenerateRecoveryCode(user) {

        if (!(await confirm({
            title: "Generate a recovery code?",
            message: `Generate a one-time recovery code for '${user.patOwnerLogin}'? Relay it to ` +
                "them directly (phone, chat) - it's shown only once, right here, and never sent " +
                "or stored anywhere the user themselves can read it.",
            confirmLabel: "Generate Code"
        }))) {
            return;
        }

        try {

            setGeneratingKey(user.key);
            const response = await generateMfaRecoveryCode(user.key);
            setRevealedCode({ login: user.patOwnerLogin, code: response.data.code });

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to generate a recovery code.", "error");

        }
        finally {

            setGeneratingKey(null);

        }

    }

    // ---- Backup & Restore -----------------------------------------

    const [pendingImport, setPendingImport] = useState(null);
    const [importing, setImporting] = useState(false);
    const importFileRef = useRef(null);

    // Export is now a two-step, OTP-gated flow (see OtpPurpose.BackupExport's
    // own comment for why this file specifically needs a fresh code, not
    // just the standing super-admin session) - sendingOtp covers the first
    // request, otpDialogOpen/otpCode/verifyingOtp cover the code-entry step
    // that follows it.
    const [sendingOtp, setSendingOtp] = useState(false);
    const [otpDialogOpen, setOtpDialogOpen] = useState(false);
    const [otpCode, setOtpCode] = useState("");
    const [verifyingOtp, setVerifyingOtp] = useState(false);

    async function handleStartExport() {

        setSendingOtp(true);

        try {

            const response = await sendExportOtp();

            if (!response.data.success) {
                toast.show(response.data.message || "Couldn't send the verification code.", "error");
                return;
            }

            toast.show("A verification code has been sent to your email address.", "success");
            setOtpCode("");
            setOtpDialogOpen(true);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to send the verification code.", "error");

        }
        finally {

            setSendingOtp(false);

        }

    }

    async function handleVerifyExportOtp() {

        setVerifyingOtp(true);

        try {

            const response = await exportBackup(otpCode.trim());

            if (!response.data.success) {
                toast.show(response.data.message || "Invalid or expired verification code.", "error");
                return;
            }

            const blob = new Blob([JSON.stringify(response.data.backup, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = `deployment-portal-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.show("Backup downloaded. Store it somewhere as protected as your credentials — never in a git repo.", "success");
            setOtpDialogOpen(false);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to export the backup.", "error");

        }
        finally {

            setVerifyingOtp(false);

        }

    }

    function handleImportFileChosen(e) {

        const file = e.target.files?.[0];
        e.target.value = "";

        if (!file) return;

        const reader = new FileReader();

        reader.onload = () => {

            try {
                setPendingImport(JSON.parse(reader.result));
            }
            catch {
                toast.show("That file isn't valid JSON — is it really an exported backup?", "error");
            }

        };

        reader.onerror = () => toast.show("Couldn't read that file.", "error");
        reader.readAsText(file);

    }

    async function handleConfirmImport() {

        setImporting(true);

        try {

            await importBackup(pendingImport);
            toast.show("Backup restored. Restart or redeploy the backend now — the restored encryption keys only take effect on a fresh process.", "success");
            setPendingImport(null);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to import that backup.", "error");

        }
        finally {

            setImporting(false);

        }

    }

    // "Delete All Data" - the server emails a full safety-net backup to
    // this admin's own address BEFORE wiping anything (see
    // BackupController.Wipe) - the success toast below is what actually
    // confirms that happened, not a separate step this page has to manage.
    const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
    const [wiping, setWiping] = useState(false);

    async function handleConfirmWipe() {

        setWiping(true);

        try {

            const response = await wipeDatabase(WIPE_CONFIRM_PHRASE);

            if (!response.data.success) {
                toast.show(response.data.message || "Failed to delete all data.", "error");
                return;
            }

            toast.show(response.data.message || "All data deleted.", "success");
            setWipeDialogOpen(false);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to delete all data.", "error");

        }
        finally {

            setWiping(false);

        }

    }

    // Deliberately NOT filtering out "Unknown (...)" rows the way Round
    // 15's dedupe feature does - that filter exists so dedupe never
    // merges two unrelated people who happen to share an unreadable
    // token. Here it would do the opposite of what this console is for:
    // hiding exactly the accounts an admin is most likely to need (a
    // locked-out/signed-out session GitHub can't currently re-verify) -
    // Round 16's own ResolveCurrentLoginForKeyAsync already reads the raw
    // stored token directly for this exact reason, bypassing the masking
    // that produces "Unknown" in the first place.
    const mfaUsers = patUsers || [];

    return (

        <>

        {dialog}

        <SectionTabs sections={TABS} active={tab} onSelect={setTab} />

        {tab === "allowlist" && (

            <div className="card">

                <h2 className="card-title">Admin Allowlist</h2>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    A GitHub username or an email gets the Admin role on login (whichever this
                    person actually signs in with — email/password and Google logins only ever
                    match by email). Everyone else who logs in gets Viewer.
                    {" "}<strong>Suspend</strong> (GitHub usernames only) strips Admin immediately —
                    even from an already-signed-in session, no logout needed — while leaving them
                    able to keep using the portal as a normal Viewer; the entry stays on this list
                    so <strong>Unsuspend</strong> restores Admin without retyping it.
                    {" "}<strong>Remove</strong> deletes the entry from this list entirely.
                    Neither one blocks someone from the portal — for that, use Services → Users.
                </p>

                <form onSubmit={handleAddAdmin} className="button-row" style={{ flexWrap: "nowrap", marginBottom: "16px" }}>

                    <div style={{ flex: 1 }}>
                        <ClearableInput
                            id="new-admin-entry"
                            placeholder="GitHub username or email"
                            value={newAdminEntry}
                            onChange={(e) => setNewAdminEntry(e.target.value)}
                            onClear={() => setNewAdminEntry("")}
                            autoComplete="off"
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={!newAdminEntry.trim() || savingRow !== null}>
                        Add
                    </button>

                </form>

                {adminUsernames.length === 0 && adminEmails.length === 0 ? (

                    <p className="empty-state field-hint-bad">
                        Empty — bootstrap mode is active, every visitor is treated as Admin until
                        someone's added here.
                    </p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Username or Email</th>
                                    <th>Session</th>
                                    <th><span className="visually-hidden">Actions</span></th>
                                </tr>
                            </thead>

                            <tbody>

                                {[
                                    ...adminUsernames.map((username) => ({ value: username, isEmail: false })),
                                    ...adminEmails.map((email) => ({ value: email, isEmail: true }))
                                ].map(({ value, isEmail }) => {

                                    const patUser = !isEmail ? findPatUser(value) : null;
                                    const busy = savingRow === value;
                                    const suspended = !isEmail && isSuspended(value);
                                    const toggling = blockingKey === value;

                                    return (

                                        <tr key={value}>

                                            <td>{isEmail ? value : `@${value}`}</td>

                                            <td>
                                                {isEmail ? (
                                                    <span className="badge badge-secondary">—</span>
                                                ) : suspended ? (
                                                    <span className="badge badge-warning">Suspended</span>
                                                ) : !patUser ? (
                                                    <span className="badge badge-secondary">No session</span>
                                                ) : patUser.isBlocked ? (
                                                    <span className="badge badge-danger">Blocked</span>
                                                ) : (
                                                    <span className="badge badge-success">Active</span>
                                                )}
                                            </td>

                                            <td>

                                                <div className="button-row">

                                                    {!isEmail && (
                                                        <button
                                                            type="button"
                                                            className={`btn btn-sm ${suspended ? "btn-secondary" : "btn-danger"}`}
                                                            onClick={() => handleSuspendClick(value)}
                                                            disabled={toggling}
                                                            aria-label={`${suspended ? "Unsuspend" : "Suspend"} @${value}`}
                                                        >
                                                            {toggling ? "..." : suspended ? "Unsuspend" : "Suspend"}
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleRemoveAdmin(value)}
                                                        disabled={busy}
                                                    >
                                                        {busy ? "..." : "Remove"}
                                                    </button>

                                                </div>

                                            </td>

                                        </tr>

                                    );

                                })}

                            </tbody>

                        </table>

                    </div>

                )}

                <div className="button-row" style={{ marginTop: "16px" }}>

                    <button type="button" className="btn btn-danger" onClick={() => handleClear("admins", "admin username allowlist")}>
                        Clear Usernames
                    </button>

                    <button type="button" className="btn btn-danger" onClick={handleClearAdminEmails}>
                        Clear Emails
                    </button>

                </div>

            </div>

        )}

        {tab === "mfa" && (

            <div className="card">

                <h2 className="card-title">MFA Console</h2>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    Every PAT user's MFA status. "Require MFA" nudges a not-yet-enrolled user to set
                    theirs up, escalating to a full-screen block if they skip it twice - it doesn't
                    enroll them for you, only their own authenticator app can do that. "Reset MFA"
                    removes an existing enrollment entirely (they re-enroll from scratch). "Generate
                    Recovery Code" issues a single one-time code for someone locked out of their
                    authenticator app, without resetting anything - users never see their own recovery
                    codes, only an admin can issue one.
                </p>

                {patUsersLoading ? (

                    <p className="field-hint">Loading...</p>

                ) : mfaUsers.length === 0 ? (

                    <p className="empty-state">No PAT users yet.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>MFA</th>
                                    <th><span className="visually-hidden">Actions</span></th>
                                </tr>
                            </thead>

                            <tbody>

                                {mfaUsers.map((u) => (

                                    <tr key={u.key}>

                                        <td>@{u.patOwnerLogin}</td>

                                        <td>
                                            <span className={`badge ${u.isMfaEnabled ? "badge-success" : "badge-secondary"}`}>
                                                {u.isMfaEnabled ? "Enabled" : "Off"}
                                            </span>
                                            {!u.isMfaEnabled && u.isMfaRequired && (
                                                <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                                                    Required
                                                </span>
                                            )}
                                        </td>

                                        <td>

                                            {/* Not gated on u.isMfaEnabled - that flag is only ever
                                                meaningful for a row with a currently-resolvable login
                                                (see GetPatUsersAsync), so a flaky/"Unknown" row would
                                                hide both actions right when they're most needed. Both
                                                backend actions re-resolve the login themselves and fail
                                                cleanly (400/404 with a real message) when there's
                                                genuinely nothing to act on. */}
                                            <div className="button-row">

                                                    {!u.isMfaEnabled && (

                                                        <button
                                                            type="button"
                                                            className={`btn btn-sm ${u.isMfaRequired ? "btn-secondary" : "btn-primary"}`}
                                                            onClick={() => handleToggleRequireMfa(u)}
                                                            disabled={requiringKey === u.key}
                                                        >
                                                            {requiringKey === u.key ? "..." : u.isMfaRequired ? "Remove Requirement" : "Require MFA"}
                                                        </button>

                                                    )}

                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => handleGenerateRecoveryCode(u)}
                                                        disabled={generatingKey === u.key}
                                                    >
                                                        {generatingKey === u.key ? "..." : "Generate Recovery Code"}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleResetMfa(u)}
                                                        disabled={resettingKey === u.key}
                                                    >
                                                        {resettingKey === u.key ? "..." : "Reset MFA"}
                                                    </button>

                                            </div>

                                        </td>

                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

        )}

        {tab === "service-access" && (

            <>

            <div className="card">

                <h2 className="card-title">Service Access</h2>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    Pick a PAT user below, then restrict any sidebar section (every service this
                    portal integrates with) for just them. <strong>Locked</strong> keeps it visible
                    but disabled, with a lock icon in place of its usual one. <strong>Hidden</strong>
                    {" "}removes it from the sidebar entirely. Settings and Dashboard can't be
                    restricted, so there's always a way back in. The same console any general admin
                    can already reach at Settings → Sidebar Access — this is a second way in, not a
                    separate copy of it.
                </p>

                {patUsersLoading ? (

                    <p className="field-hint">Loading PAT users...</p>

                ) : patUsers.length === 0 ? (

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
                                <th><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>

                        <tbody>

                            {patUsers.map((u) => (

                                <tr key={u.key} className={selectedPatUserKey === u.key ? "table-row-active" : ""}>
                                    <td>{u.patOwnerLogin}</td>
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
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => setSelectedPatUserKey(
                                                selectedPatUserKey === u.key ? null : u.key
                                            )}
                                        >
                                            {selectedPatUserKey === u.key ? "Close" : "Manage Access"}
                                        </button>
                                    </td>
                                </tr>

                            ))}

                        </tbody>

                    </table>

                    </div>

                )}

            </div>

            {selectedPatUserKey && (

                <div className="card">

                    <h2 className="card-title">
                        Service Access — {patUsers.find((u) => u.key === selectedPatUserKey)?.patOwnerLogin || selectedPatUserKey}
                    </h2>

                    {sidebarAccessLoading ? (

                        <p className="field-hint">Loading this user's service access...</p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Service</th>
                                    <th>Access</th>
                                </tr>
                            </thead>

                            <tbody>

                                {sidebarTabs.map(({ key, label }) => (

                                    <tr key={key}>
                                        <td>{label}</td>
                                        <td>
                                            <SidebarStateToggle
                                                value={sidebarAccessMap[key]}
                                                onChange={(state) => setSidebarTabState(key, state)}
                                            />
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                    <div className="button-row" style={{ marginTop: "15px" }}>

                        <button type="button" className="btn btn-primary" onClick={handleSaveSidebarAccess} disabled={savingSidebarAccess || sidebarAccessLoading}>
                            {savingSidebarAccess ? "Saving..." : "Save Service Access"}
                        </button>

                        <button type="button" className="btn btn-danger" onClick={handleClearSidebarAccess} disabled={clearingSidebarAccess || sidebarAccessLoading}>
                            {clearingSidebarAccess ? "Resetting..." : "Reset This User To Visible"}
                        </button>

                    </div>

                </div>

            )}

            </>

        )}

        {tab === "backup" && (

            <div className="card">

                <h2 className="card-title">Backup &amp; Restore</h2>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    A full export of everything this portal has saved — the admin allowlist, every
                    PAT user's settings, and every connected credential (GitHub PAT, cloud secret
                    keys, database passwords, everything in Settings → Credentials). Built for
                    moving off a Render free-tier Postgres database before its 30-day expiration
                    deletes it: export here, store the file in whatever new database or secret
                    store you're moving to, then import it there once this portal is pointed at
                    the new database.
                </p>

                <p className="field-hint field-hint-bad" style={{ margin: "0 0 15px" }}>
                    Treat the exported file as sensitive as every one of those credentials in
                    plain text — it carries the encryption key that unlocks all of them, not just
                    the encrypted values. Never commit it to a git repo (not even a private one —
                    the same rule as never committing a raw GitHub PAT), and delete it once it's
                    safely stored wherever you're keeping it.
                </p>

                <div className="button-row">

                    <button type="button" className="btn btn-primary" onClick={handleStartExport} disabled={sendingOtp}>
                        {sendingOtp ? "Sending code..." : "Export Backup"}
                    </button>

                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => importFileRef.current?.click()}
                        disabled={importing}
                    >
                        Import Backup...
                    </button>

                    <input
                        ref={importFileRef}
                        type="file"
                        accept="application/json"
                        onChange={handleImportFileChosen}
                        style={{ display: "none" }}
                    />

                </div>

                <hr className="dashboard-section-divider" />

                <h3 className="settings-subhead" style={{ color: "#dc2626" }}>Delete All Data</h3>

                <p className="field-hint field-hint-bad" style={{ margin: "0 0 15px" }}>
                    Permanently wipes the admin allowlist, every account, and every connected
                    credential - everything Backup & Restore above exports. Before anything is
                    deleted, a full backup is automatically emailed to your own admin address, so
                    this is recoverable through Import Backup above, not a true point of no return.
                    The encryption keys are left in place - there's nothing left for them to decrypt
                    either way, and the next request after this simply re-seeds a fresh default
                    admin account, same as a brand new deployment.
                </p>

                <button type="button" className="btn btn-danger" onClick={() => setWipeDialogOpen(true)}>
                    Delete All Data
                </button>

            </div>

        )}

        <TypedConfirmDialog
            open={!!pendingImport}
            title="Overwrite everything with this backup?"
            message={(
                <>
                    This replaces the admin allowlist, every PAT user's settings, and every
                    connected credential currently in this portal with what's in the imported
                    file. There is no undo. After this succeeds, restart or redeploy the backend —
                    the restored encryption keys only take effect on a fresh process.
                </>
            )}
            resourceName={IMPORT_CONFIRM_PHRASE}
            confirmLabel={importing ? "Restoring..." : "Restore Backup"}
            loading={importing}
            onConfirm={handleConfirmImport}
            onCancel={() => !importing && setPendingImport(null)}
        />

        <TypedConfirmDialog
            open={wipeDialogOpen}
            title="Delete all portal data?"
            message={(
                <>
                    A full backup will be emailed to your own admin address first, then the admin
                    allowlist, every account, and every connected credential in this portal is
                    permanently deleted. The next request re-seeds a fresh default admin account,
                    same as a brand new deployment.
                </>
            )}
            resourceName={WIPE_CONFIRM_PHRASE}
            confirmLabel={wiping ? "Deleting..." : "Delete All Data"}
            loading={wiping}
            onConfirm={handleConfirmWipe}
            onCancel={() => !wiping && setWipeDialogOpen(false)}
        />

        {otpDialogOpen && (

            <div
                className="dialog-backdrop"
                role="presentation"
                onClick={(e) => { if (e.target === e.currentTarget && !verifyingOtp) setOtpDialogOpen(false); }}
            >

                <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="export-otp-title">

                    <h2 id="export-otp-title" style={{ marginTop: 0 }}>Enter your verification code</h2>

                    <p className="field-hint">
                        A 6-digit code was just emailed to your admin address - it expires in 5 minutes.
                    </p>

                    <div className="form-group">
                        <label htmlFor="export-otp-code">Verification code</label>
                        <input
                            id="export-otp-code"
                            type="text"
                            inputMode="numeric"
                            className="form-control"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            autoComplete="off"
                            placeholder="123456"
                        />
                    </div>

                    <div className="button-row">

                        <button
                            type="button"
                            className="btn btn-primary"
                            disabled={otpCode.length !== 6 || verifyingOtp}
                            onClick={handleVerifyExportOtp}
                        >
                            {verifyingOtp ? "Verifying..." : "Verify & Download"}
                        </button>

                        <button type="button" className="btn btn-secondary" onClick={() => setOtpDialogOpen(false)} disabled={verifyingOtp}>
                            Cancel
                        </button>

                    </div>

                </div>

            </div>

        )}

        {revealedCode && (

            <div className="dialog-backdrop" role="presentation">

                <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="recovery-code-title">

                    <h2 id="recovery-code-title" style={{ marginTop: 0 }}>
                        Recovery code for @{revealedCode.login}
                    </h2>

                    <p className="field-hint">
                        Shown only this once - relay it to the user directly. It works one time.
                    </p>

                    <div className="repo-preview" style={{ textAlign: "center", borderColor: "var(--heading-accent)" }}>
                        <code className="commit-sha" style={{ fontSize: 18 }}>{revealedCode.code}</code>
                    </div>

                    <div className="button-row" style={{ marginTop: 16 }}>
                        <button type="button" className="btn btn-primary" onClick={() => setRevealedCode(null)}>
                            Done
                        </button>
                    </div>

                </div>

            </div>

        )}

        </>

    );

}

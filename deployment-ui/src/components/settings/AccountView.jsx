import { useEffect, useRef, useState } from "react";

import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import AccountAvatar from "../common/AccountAvatar";
import MfaSection from "./credentials/MfaSection";
import AccountPasswordSection from "./credentials/AccountPasswordSection";
import performSignOut from "../../utils/performSignOut";
import {
    getMyAccount, updateMyProfile, uploadMyAvatar, removeMyAvatar,
    getMySessions, revokeMySession, getMyLoginHistory, deleteMyAccount
} from "../../services/authLoginService";

// Client-side resize before upload - keeps every avatar small (server also
// caps it defensively, see AccountAuthController.MaxAvatarBase64Length) and
// avoids adding an image-processing dependency for something a <canvas>
// already does natively. Always exports PNG so the server's fixed
// "data:image/png;base64," prefix (BuildAvatarDataUri) is always correct.
const AVATAR_MAX_DIMENSION = 256;

function resizeImageToBase64(file) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onerror = () => reject(reader.error);

        reader.onload = () => {

            const img = new Image();

            img.onerror = () => reject(new Error("Not a readable image."));

            img.onload = () => {

                const scale = Math.min(1, AVATAR_MAX_DIMENSION / Math.max(img.width, img.height));
                const width = Math.round(img.width * scale);
                const height = Math.round(img.height * scale);

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL("image/png");
                resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));

            };

            img.src = reader.result;

        };

        reader.readAsDataURL(file);

    });

}

// Coarse, good-enough device/browser label for the Active Sessions list -
// not trying to be a full UA parser, just enough that someone can tell
// "Chrome on Windows" from "Safari on iPhone" at a glance.
function describeUserAgent(userAgent) {

    if (!userAgent) return "Unknown device";

    const browser = /Edg\//.test(userAgent) ? "Edge"
        : /Chrome\//.test(userAgent) ? "Chrome"
        : /Firefox\//.test(userAgent) ? "Firefox"
        : /Safari\//.test(userAgent) ? "Safari"
        : "Browser";

    const os = /iPhone|iPad/.test(userAgent) ? "iOS"
        : /Android/.test(userAgent) ? "Android"
        : /Mac OS X/.test(userAgent) ? "macOS"
        : /Windows/.test(userAgent) ? "Windows"
        : /Linux/.test(userAgent) ? "Linux"
        : "Unknown OS";

    return `${browser} on ${os}`;

}

function formatDateTime(value) {

    if (!value) return "—";

    return new Date(value).toLocaleString();

}

// Settings > Account - the user-facing home for everything about THEIR OWN
// identity: Profile (avatar/name/username/phone - email is read-only, see
// its own comment below), Security (password via the existing
// AccountPasswordSection, 2FA via the existing MfaSection, this account's
// own Active Sessions and Login History), and a Danger Zone (Sign Out,
// Delete Account). Distinct from Settings > Credentials > Account, which is
// only the legacy "set a password" sub-tab - this is the full page.
export default function AccountView() {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();
    const fileInputRef = useRef(null);

    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(true);

    const [editingProfile, setEditingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState({ displayName: "", username: "", phoneNumber: "" });
    const [savingProfile, setSavingProfile] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const [sessions, setSessions] = useState([]);
    const [sessionsLoading, setSessionsLoading] = useState(true);
    const [revokingJti, setRevokingJti] = useState(null);

    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(true);

    const [signingOut, setSigningOut] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [deleteForm, setDeleteForm] = useState({ currentPassword: "", confirmPhrase: "" });
    const [deleting, setDeleting] = useState(false);

    function loadAccount() {

        setLoading(true);

        getMyAccount()
            .then((result) => {
                setAccount(result);
                setProfileForm({
                    displayName: result.displayName || "",
                    username: result.username || "",
                    phoneNumber: result.phoneNumber || ""
                });
            })
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));

    }

    function loadSessions() {

        setSessionsLoading(true);

        getMySessions()
            .then((result) => setSessions(result.sessions || []))
            .catch((err) => console.error(err))
            .finally(() => setSessionsLoading(false));

    }

    function loadHistory() {

        setHistoryLoading(true);

        getMyLoginHistory()
            .then((result) => setHistory(result.history || []))
            .catch((err) => console.error(err))
            .finally(() => setHistoryLoading(false));

    }

    useEffect(() => {
        loadAccount();
        loadSessions();
        loadHistory();
    }, []);

    // Both lists here are real, growing per-account collections (one row
    // per device, one row per login attempt) - see the pagination-policy
    // memory this project standardized on. Page size 10 matches this
    // codebase's own default for lists with no more specific convention.
    const {
        page: sessionsPage, setPage: setSessionsPage, pageCount: sessionsPageCount,
        pageItems: sessionsPageItems, totalCount: sessionsTotalCount,
        startIndex: sessionsStartIndex, endIndex: sessionsEndIndex
    } = usePagination(sessions, 10);

    const {
        page: historyPage, setPage: setHistoryPage, pageCount: historyPageCount,
        pageItems: historyPageItems, totalCount: historyTotalCount,
        startIndex: historyStartIndex, endIndex: historyEndIndex
    } = usePagination(history, 10);

    async function handleSaveProfile(e) {

        e.preventDefault();
        setSavingProfile(true);

        try {

            await updateMyProfile(profileForm);
            toast.show("Profile updated.", "success");
            setEditingProfile(false);
            loadAccount();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to update profile.", "error");
        }
        finally {
            setSavingProfile(false);
        }

    }

    function handleCancelProfile() {

        setProfileForm({
            displayName: account?.displayName || "",
            username: account?.username || "",
            phoneNumber: account?.phoneNumber || ""
        });
        setEditingProfile(false);

    }

    async function handleAvatarPick(e) {

        const file = e.target.files?.[0];
        e.target.value = "";

        if (!file) return;

        setUploadingAvatar(true);

        try {

            const base64 = await resizeImageToBase64(file);
            const result = await uploadMyAvatar(base64);

            if (!result.success) {
                toast.show(result.message || "Unable to upload photo.", "error");
                return;
            }

            toast.show("Profile photo updated.", "success");
            loadAccount();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to upload photo.", "error");
        }
        finally {
            setUploadingAvatar(false);
        }

    }

    async function handleRemoveAvatar() {

        setUploadingAvatar(true);

        try {
            await removeMyAvatar();
            toast.show("Profile photo removed.", "success");
            loadAccount();
        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to remove photo.", "error");
        }
        finally {
            setUploadingAvatar(false);
        }

    }

    async function handleRevokeSession(jti, isCurrent) {

        if (!(await confirm({
            title: isCurrent ? "Sign out this device?" : "Sign out that device?",
            message: isCurrent
                ? "This is the device you're using right now - you'll be signed out immediately."
                : "That device will be signed out the next time it makes a request.",
            confirmLabel: "Sign Out Device",
            danger: true
        }))) {
            return;
        }

        setRevokingJti(jti);

        try {

            await revokeMySession(jti);

            if (isCurrent) {
                await performSignOut();
                return;
            }

            toast.show("Device signed out.", "success");
            loadSessions();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to sign out that device.", "error");
        }
        finally {
            setRevokingJti(null);
        }

    }

    async function handleSignOut() {

        if (!(await confirm({
            title: "Sign out?",
            message: "You'll be signed out and returned to the login screen. Nothing you've " +
                "saved is cleared - your GitHub token and any AWS/Azure/GCP credentials are " +
                "still there the next time you sign back in.",
            confirmLabel: "Sign Out"
        }))) {
            return;
        }

        setSigningOut(true);
        await performSignOut();

    }

    async function handleDeleteAccount(e) {

        e.preventDefault();

        if (!(await confirm({
            title: "Delete your account?",
            message: "This permanently deletes your account, MFA enrollment, linked cloud " +
                "credentials, and sidebar access settings. This cannot be undone.",
            confirmLabel: "Delete Account",
            danger: true
        }))) {
            return;
        }

        setDeleting(true);

        try {

            const result = await deleteMyAccount(deleteForm);

            if (!result.success) {
                toast.show(result.message || "Unable to delete account.", "error");
                return;
            }

            window.location.href = window.location.origin;

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to delete account.", "error");
            setDeleting(false);
        }

    }

    return (

        <>

        {dialog}

        <div className="card">

            <h2 className="card-title">Profile</h2>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : (

                <>

                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>

                    <AccountAvatar
                        avatarUrl={account?.avatarUrl}
                        name={account?.displayName || account?.username || account?.email}
                        size={64}
                    />

                    <div style={{ display: "flex", gap: 8 }}>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handleAvatarPick}
                        />

                        <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={uploadingAvatar}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {uploadingAvatar ? "Working..." : "Change Photo"}
                        </button>

                        {account?.avatarUrl && (
                            <button
                                type="button"
                                className="btn"
                                disabled={uploadingAvatar}
                                onClick={handleRemoveAvatar}
                            >
                                Remove
                            </button>
                        )}

                    </div>

                </div>

                <form onSubmit={handleSaveProfile}>

                    <div className="form-group">
                        <label htmlFor="account-email">Email</label>
                        <input
                            id="account-email"
                            type="email"
                            className="form-control"
                            value={account?.email || ""}
                            disabled
                        />
                        <p className="field-hint" style={{ marginBottom: 0 }}>
                            Your email is tied to how you sign in and can't be changed here.
                        </p>
                    </div>

                    <div className="form-group">
                        <label htmlFor="account-display-name">Name</label>
                        <input
                            id="account-display-name"
                            type="text"
                            className="form-control"
                            value={profileForm.displayName}
                            disabled={!editingProfile}
                            onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="account-username">Username</label>
                        <input
                            id="account-username"
                            type="text"
                            className="form-control"
                            value={profileForm.username}
                            disabled={!editingProfile}
                            onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="account-phone">Phone Number</label>
                        <input
                            id="account-phone"
                            type="tel"
                            className="form-control"
                            value={profileForm.phoneNumber}
                            disabled={!editingProfile}
                            onChange={(e) => setProfileForm({ ...profileForm, phoneNumber: e.target.value })}
                        />
                    </div>

                    <div className="button-row">

                        {editingProfile ? (

                            <>
                                <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                                    {savingProfile ? "Saving..." : "Save"}
                                </button>
                                <button type="button" className="btn" disabled={savingProfile} onClick={handleCancelProfile}>
                                    Cancel
                                </button>
                            </>

                        ) : (

                            <button type="button" className="btn btn-primary" onClick={() => setEditingProfile(true)}>
                                Edit Profile
                            </button>

                        )}

                    </div>

                </form>

                </>

            )}

        </div>

        <div className="card">

            <h2 className="card-title">Security</h2>

            <AccountPasswordSection />

            <MfaSection />

            <div className="settings-subsection">

                <h3 className="settings-subhead">Active Sessions</h3>

                <p className="field-hint" style={{ marginTop: 0 }}>
                    Every device currently signed in to this account.
                </p>

                {sessionsLoading ? (

                    <p className="field-hint">Loading...</p>

                ) : sessions.length === 0 ? (

                    <p className="empty-state">No active sessions.</p>

                ) : (

                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Device</th>
                                    <th>IP Address</th>
                                    <th>Last Active</th>
                                    <th><span className="visually-hidden">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessionsPageItems.map((s) => (
                                    <tr key={s.jti}>
                                        <td>
                                            {describeUserAgent(s.userAgent)}
                                            {s.isCurrent && <span className="badge badge-success" style={{ marginLeft: 8 }}>This device</span>}
                                        </td>
                                        <td>{s.ipAddress || "—"}</td>
                                        <td>{formatDateTime(s.lastSeenAtUtc)}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-danger"
                                                disabled={revokingJti === s.jti}
                                                onClick={() => handleRevokeSession(s.jti, s.isCurrent)}
                                            >
                                                {revokingJti === s.jti ? "Working..." : "Sign Out"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                )}

                <Pagination
                    page={sessionsPage}
                    pageCount={sessionsPageCount}
                    totalCount={sessionsTotalCount}
                    startIndex={sessionsStartIndex}
                    endIndex={sessionsEndIndex}
                    onPageChange={setSessionsPage}
                />

            </div>

            <div className="settings-subsection">

                <h3 className="settings-subhead">Login History</h3>

                {historyLoading ? (

                    <p className="field-hint">Loading...</p>

                ) : history.length === 0 ? (

                    <p className="empty-state">No login history yet.</p>

                ) : (

                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>When</th>
                                    <th>Device</th>
                                    <th>IP Address</th>
                                    <th>Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historyPageItems.map((h, i) => (
                                    <tr key={historyStartIndex + i}>
                                        <td>{formatDateTime(h.timestampUtc)}</td>
                                        <td>{describeUserAgent(h.userAgent)}</td>
                                        <td>{h.ipAddress || "—"}</td>
                                        <td>
                                            <span className={`badge ${h.success ? "badge-success" : "badge-danger"}`}>
                                                {h.success ? "Success" : "Failed"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                )}

                <Pagination
                    page={historyPage}
                    pageCount={historyPageCount}
                    totalCount={historyTotalCount}
                    startIndex={historyStartIndex}
                    endIndex={historyEndIndex}
                    onPageChange={setHistoryPage}
                />

            </div>

        </div>

        <div className="card">

            <h2 className="card-title">Danger Zone</h2>

            <div className="settings-subsection">

                <h3 className="settings-subhead">Sign Out</h3>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    Signs you out and returns you to the login screen - nothing is cleared.
                </p>

                <button type="button" className="btn btn-secondary" onClick={handleSignOut} disabled={signingOut}>
                    {signingOut ? "Signing out..." : "Sign Out"}
                </button>

            </div>

            <div className="settings-subsection">

                <h3 className="settings-subhead">Delete Account</h3>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    Permanently deletes your account, MFA enrollment, linked cloud credentials, and
                    sidebar access settings. This cannot be undone.
                </p>

                {showDelete ? (

                    <form onSubmit={handleDeleteAccount}>

                        {account?.hasPassword ? (

                            <div className="form-group">
                                <label htmlFor="delete-current-password">Current Password</label>
                                <input
                                    id="delete-current-password"
                                    type="password"
                                    className="form-control"
                                    value={deleteForm.currentPassword}
                                    onChange={(e) => setDeleteForm({ ...deleteForm, currentPassword: e.target.value })}
                                    autoComplete="current-password"
                                />
                            </div>

                        ) : (

                            <div className="form-group">
                                <label htmlFor="delete-confirm-phrase">Type DELETE to confirm</label>
                                <input
                                    id="delete-confirm-phrase"
                                    type="text"
                                    className="form-control"
                                    value={deleteForm.confirmPhrase}
                                    onChange={(e) => setDeleteForm({ ...deleteForm, confirmPhrase: e.target.value })}
                                    autoComplete="off"
                                />
                            </div>

                        )}

                        <div className="button-row">
                            <button type="submit" className="btn btn-danger" disabled={deleting}>
                                {deleting ? "Deleting..." : "Confirm Delete Account"}
                            </button>
                            <button type="button" className="btn" disabled={deleting} onClick={() => setShowDelete(false)}>
                                Cancel
                            </button>
                        </div>

                    </form>

                ) : (

                    <button type="button" className="btn btn-danger" onClick={() => setShowDelete(true)}>
                        Delete Account
                    </button>

                )}

            </div>

        </div>

        </>

    );

}

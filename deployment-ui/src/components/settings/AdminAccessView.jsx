import { useState } from "react";

import ClearableInput from "../common/ClearableInput";
import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import { resetUserMfa, generateMfaRecoveryCode, requireUserMfa, unrequireUserMfa } from "../../services/adminService";

// Settings > Admin Access - restricted to the single super-admin identity
// (see constants/settingsViews.js's SUPER_ADMIN_ONLY_VIEWS, enforced here
// only for hiding the tile/redirecting the view; the real enforcement is
// server-side, AdminGate.DenyUnlessSuperAdminAsync on every action this
// page calls). Bundles the two things that used to be reachable by anyone
// (Admin Allowlist, an open tab in Credentials) or by any general admin
// (MFA reset, on Services > Users) into one place only VarshithChand can
// even see.
export default function AdminAccessView({
    adminUsernamesText,
    setAdminUsernamesText,
    handleSaveAdmins,
    savingAdmins,
    handleClear,
    patUsers,
    patUsersLoading,
    refreshPatUsers
}) {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

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

        <div className="card">

            <h2 className="card-title">Admin Allowlist</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                GitHub usernames that get the Admin role on login. Everyone else who logs in gets
                Viewer. Restricted to a single administrator account, same as Database Management.
            </p>

            <div className="form-group">
                <label htmlFor="admin-allowlist-usernames">GitHub Usernames (comma-separated)</label>
                <ClearableInput
                    id="admin-allowlist-usernames"
                    placeholder="octocat, hubot"
                    value={adminUsernamesText}
                    onChange={(e) => setAdminUsernamesText(e.target.value)}
                    onClear={() => setAdminUsernamesText("")}
                    autoComplete="off"
                    name="admin-usernames"
                />
            </div>

            <div className="button-row">

                <button type="button" className="btn btn-primary" onClick={handleSaveAdmins} disabled={savingAdmins}>
                    {savingAdmins ? "Saving..." : "Save Admin Allowlist"}
                </button>

                <button type="button" className="btn btn-danger" onClick={() => handleClear("admins", "admin allowlist")}>
                    Clear
                </button>

            </div>

        </div>

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

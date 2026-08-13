import { useState } from "react";

import ClearableInput from "../common/ClearableInput";
import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import { resetUserMfa, generateMfaRecoveryCode } from "../../services/adminService";

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
    const [revealedCode, setRevealedCode] = useState(null);

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

    const mfaUsers = (patUsers || []).filter((u) => !u.patOwnerLogin.startsWith("Unknown"));

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
                <label>GitHub Usernames (comma-separated)</label>
                <ClearableInput
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
                Every PAT user's MFA status. "Reset MFA" removes their enrollment entirely (they
                re-enroll from scratch). "Generate Recovery Code" issues a single one-time code for
                someone locked out of their authenticator app, without resetting anything - users
                never see their own recovery codes, only an admin can issue one.
            </p>

            {patUsersLoading ? (

                <p className="field-hint">Loading...</p>

            ) : mfaUsers.length === 0 ? (

                <p className="empty-state">No confirmed PAT users yet.</p>

            ) : (

                <div className="table-scroll">

                    <table className="table">

                        <thead>
                            <tr>
                                <th>User</th>
                                <th>MFA</th>
                                <th></th>
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
                                    </td>

                                    <td>

                                        {u.isMfaEnabled && (

                                            <div className="button-row">

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

                                        )}

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

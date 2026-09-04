import { useEffect, useState } from "react";

import useToast from "../../../hooks/useToast";
import { getMyAccount, setPassword, changeMyPassword } from "../../../services/authLoginService";

const EMPTY_FORM = { newPassword: "", confirmPassword: "" };
const EMPTY_CHANGE_FORM = { currentPassword: "", newPassword: "", confirmPassword: "" };

// A Google/GitHub-only account never gets a PasswordHash (see
// PortalUserAccount.HasPassword) - fine for signing in with that provider,
// but it means there's nothing for email/username + password login (or a
// Forgot Password OTP reset, which refuses to touch a passwordless account -
// see AccountAuthService.RequestPasswordResetAsync) to ever work with. This
// is the one-time, self-service way to add a password to such an account
// without creating a second, disconnected one - once set, the SAME account
// works both ways: Google/GitHub here, or email/username + this password
// anywhere else (a device without that provider signed in, for instance).
// Once a password DOES exist, this same component switches to a Change
// Password form instead (see the hasPassword branch below) - see
// AccountAuthService.ChangePasswordAsync's own comment for why that
// re-verifies the current password rather than trusting the session alone.
export default function AccountPasswordSection() {

    const toast = useToast();

    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const [changeForm, setChangeForm] = useState(EMPTY_CHANGE_FORM);
    const [changing, setChanging] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);

    function refresh() {

        setLoading(true);

        getMyAccount()
            .then((result) => setAccount(result))
            .catch(() => setAccount(null))
            .finally(() => setLoading(false));

    }

    useEffect(refresh, []);

    async function handleSubmit(e) {

        e.preventDefault();

        if (form.newPassword.length < 8) {
            toast.show("Password must be at least 8 characters.", "error");
            return;
        }

        if (form.newPassword !== form.confirmPassword) {
            toast.show("Passwords don't match.", "error");
            return;
        }

        setSaving(true);

        try {

            const result = await setPassword(form.newPassword);

            if (!result.success) {
                toast.show(result.message || "Unable to set password.", "error");
                return;
            }

            toast.show("Password set — you can now log in with your email or username and this password, on any device.", "success");
            setForm(EMPTY_FORM);
            refresh();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to set password.", "error");
        }
        finally {
            setSaving(false);
        }

    }

    async function handleChangeSubmit(e) {

        e.preventDefault();

        if (changeForm.newPassword.length < 8) {
            toast.show("Password must be at least 8 characters.", "error");
            return;
        }

        if (changeForm.newPassword !== changeForm.confirmPassword) {
            toast.show("Passwords don't match.", "error");
            return;
        }

        setChanging(true);

        try {

            const result = await changeMyPassword(changeForm.currentPassword, changeForm.newPassword);

            if (!result.success) {
                toast.show(result.message || "Unable to change password.", "error");
                return;
            }

            toast.show("Password changed.", "success");
            setChangeForm(EMPTY_CHANGE_FORM);
            setShowChangePassword(false);

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to change password.", "error");
        }
        finally {
            setChanging(false);
        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                Password
                {" "}
                {!loading && account?.hasPassword && (
                    <span className="badge badge-success">Set</span>
                )}
            </h3>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : account?.hasPassword ? (

                <>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    This account already has a password — you can log in with{" "}
                    <strong>{account.email}</strong> (or your username) and that password on
                    any device, in addition to however you signed in here.
                </p>

                {showChangePassword ? (

                    <form onSubmit={handleChangeSubmit}>

                        <div className="form-group">
                            <label htmlFor="account-current-password">Current Password</label>
                            <input
                                id="account-current-password"
                                type={showPassword ? "text" : "password"}
                                className="form-control"
                                value={changeForm.currentPassword}
                                onChange={(e) => setChangeForm({ ...changeForm, currentPassword: e.target.value })}
                                autoComplete="current-password"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="account-change-new-password">New Password</label>
                            <input
                                id="account-change-new-password"
                                type={showPassword ? "text" : "password"}
                                className="form-control"
                                placeholder="At least 8 characters"
                                value={changeForm.newPassword}
                                onChange={(e) => setChangeForm({ ...changeForm, newPassword: e.target.value })}
                                autoComplete="new-password"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="account-change-confirm-password">Confirm New Password</label>
                            <input
                                id="account-change-confirm-password"
                                type={showPassword ? "text" : "password"}
                                className="form-control"
                                value={changeForm.confirmPassword}
                                onChange={(e) => setChangeForm({ ...changeForm, confirmPassword: e.target.value })}
                                autoComplete="new-password"
                            />
                        </div>

                        <div className="form-group">
                            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 400 }}>
                                <input
                                    type="checkbox"
                                    checked={showPassword}
                                    onChange={(e) => setShowPassword(e.target.checked)}
                                />
                                Show password
                            </label>
                        </div>

                        <div className="button-row">
                            <button type="submit" className="btn btn-primary" disabled={changing}>
                                {changing ? "Saving..." : "Change Password"}
                            </button>
                            <button
                                type="button"
                                className="btn"
                                disabled={changing}
                                onClick={() => { setShowChangePassword(false); setChangeForm(EMPTY_CHANGE_FORM); }}
                            >
                                Cancel
                            </button>
                        </div>

                    </form>

                ) : (

                    <button type="button" className="btn btn-secondary" onClick={() => setShowChangePassword(true)}>
                        Change Password
                    </button>

                )}

                </>

            ) : (

                <>

                    <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                        This account (<strong>{account?.email}</strong>) currently only signs in
                        through {account?.provider === "google" ? "Google" : "GitHub"} — there's no
                        password to fall back to on a device where that isn't signed in. Set one
                        below to also be able to log in with your email or username and this
                        password, anywhere.
                    </p>

                    <form onSubmit={handleSubmit}>

                        <div className="form-group">
                            <label htmlFor="account-new-password">New Password</label>
                            <input
                                id="account-new-password"
                                type={showPassword ? "text" : "password"}
                                className="form-control"
                                placeholder="At least 8 characters"
                                value={form.newPassword}
                                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                                autoComplete="new-password"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="account-confirm-password">Confirm Password</label>
                            <input
                                id="account-confirm-password"
                                type={showPassword ? "text" : "password"}
                                className="form-control"
                                placeholder="Re-enter your password"
                                value={form.confirmPassword}
                                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                                autoComplete="new-password"
                            />
                        </div>

                        <div className="form-group">
                            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 400 }}>
                                <input
                                    type="checkbox"
                                    checked={showPassword}
                                    onChange={(e) => setShowPassword(e.target.checked)}
                                />
                                Show password
                            </label>
                        </div>

                        <div className="button-row">
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? "Saving..." : "Set Password"}
                            </button>
                        </div>

                    </form>

                </>

            )}

        </div>

    );

}

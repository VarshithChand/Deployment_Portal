import { useEffect, useState } from "react";
import { toDataURL } from "qrcode";

import ClearableInput from "../../common/ClearableInput";
import useToast from "../../../hooks/useToast";
import useLockoutCountdown from "../../../hooks/useLockoutCountdown";
import {
    getMfaStatus, enrollMfa, verifyMfaEnrollment, disableMfa,
    getMfaNotificationEmail, setMfaNotificationEmail
} from "../../../services/mfaService";

// Multi-factor auth (TOTP, Google-Authenticator-compatible) tied to the
// current session's own GitHub identity, not this browser - the same
// identity Round 14's cross-session credential migration resolves
// tokens against, so enabling it here protects that GitHub account
// wherever its PAT gets reconnected from, not just this one session (see
// RequireGitHubSetup's MFA step, gated server-side by MfaGate). Session-
// scoped like every other Credentials tab here only in the sense that
// you have to already be connected to reach this page at all - the
// protection itself follows the login, not the browser.
// onEnrolled (optional): called right after a successful enroll/verify -
// used by MfaEnforcementGate to refresh AuthContext's own mfaNudge* flags
// (server-computed, only updated via a fresh bootstrap call), since this
// component's own `refresh()` above only re-checks ITS OWN status, not the
// app-wide nudge/block state that lives in AuthContext.
// showCancelEnrollButton (default true): hidden by MfaEnforcementGate's
// MANDATORY blocked screen specifically - that screen already has its own
// "Cancel" button (which actually signs the session out, the real exit
// from a screen that can't otherwise be skipped), so this component's own
// "Cancel" - which only resets the QR view back to "not enrolling" and
// leaves you exactly as stuck - was a second, identically-labeled button
// doing something confusingly different. The nudge dialog's own
// "Set Up Now" flow keeps this button (its own dialog "Close" reads as a
// clearly different action, not a same-label collision).
export default function MfaSection({ onEnrolled, showCancelEnrollButton = true }) {

    const toast = useToast();

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    const [enrolling, setEnrolling] = useState(false);
    const [enrollData, setEnrollData] = useState(null);
    const [qrDataUrl, setQrDataUrl] = useState("");
    const [code, setCode] = useState("");
    const [verifying, setVerifying] = useState(false);

    const [showDisable, setShowDisable] = useState(false);
    const [disableCode, setDisableCode] = useState("");
    const [disableRecoveryCode, setDisableRecoveryCode] = useState("");
    const [disabling, setDisabling] = useState(false);

    // Shared by both the verify-enrollment and disable forms below - both
    // hit the same per-login lockout server-side (see MfaLockoutPolicy),
    // so only one of them is ever meaningfully "active" at a time anyway.
    const [lockedUntilUtc, setLockedUntilUtc] = useState(null);
    const { isLocked, formatted: lockoutFormatted } = useLockoutCountdown(lockedUntilUtc);

    const [notificationEmail, setNotificationEmailState] = useState("");
    const [notificationEmailInput, setNotificationEmailInput] = useState("");
    const [savingEmail, setSavingEmail] = useState(false);

    function refresh() {

        setLoading(true);

        getMfaStatus()
            .then((result) => setStatus(result))
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));

    }

    useEffect(refresh, []);

    // Only meaningful once MFA is enabled - SetMfaNotificationEmailAsync
    // is itself a no-op otherwise, so there's nothing to fetch before then.
    useEffect(() => {

        if (!status?.enabled) return;

        getMfaNotificationEmail()
            .then((result) => {
                setNotificationEmailState(result.email || "");
                setNotificationEmailInput(result.email || "");
            })
            .catch((err) => console.error(err));

    }, [status?.enabled]);

    function extractLockout(err) {
        if (err.response?.data?.code === "MFA_LOCKED") {
            setLockedUntilUtc(err.response.data.lockedUntilUtc);
            return true;
        }
        return false;
    }

    async function handleSaveNotificationEmail() {

        try {

            setSavingEmail(true);
            const result = await setMfaNotificationEmail(notificationEmailInput.trim());
            setNotificationEmailState(result.email);
            toast.show("Notification email saved.", "success");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save that email.", "error");

        }
        finally {

            setSavingEmail(false);

        }

    }

    useEffect(() => {

        if (!enrollData?.otpauthUri) {
            setQrDataUrl("");
            return;
        }

        let cancelled = false;

        toDataURL(enrollData.otpauthUri, { margin: 1, width: 220 })
            .then((url) => { if (!cancelled) setQrDataUrl(url); })
            .catch((err) => console.error(err));

        return () => { cancelled = true; };

    }, [enrollData]);

    async function handleStartEnroll() {

        try {

            const result = await enrollMfa();
            setEnrollData(result);
            setEnrolling(true);
            setCode("");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to start MFA enrollment.", "error");

        }

    }

    function cancelEnroll() {
        setEnrolling(false);
        setEnrollData(null);
        setQrDataUrl("");
        setCode("");
    }

    async function handleVerifyEnroll(e) {

        e.preventDefault();
        setVerifying(true);

        try {

            await verifyMfaEnrollment(code);

            setEnrolling(false);
            setEnrollData(null);
            setQrDataUrl("");
            setCode("");
            setLockedUntilUtc(null);

            toast.show("MFA enabled.", "success");
            refresh();
            onEnrolled?.();

        }
        catch (err) {

            console.error(err);
            setCode("");

            if (!extractLockout(err)) {
                toast.show(err.response?.data?.message || "Invalid verification code.", "error");
            }

        }
        finally {

            setVerifying(false);

        }

    }

    async function handleDisable(e) {

        e.preventDefault();
        setDisabling(true);

        try {

            await disableMfa(
                disableRecoveryCode ? { recoveryCode: disableRecoveryCode } : { code: disableCode }
            );

            toast.show("MFA disabled.", "success");
            setShowDisable(false);
            setDisableCode("");
            setDisableRecoveryCode("");
            setLockedUntilUtc(null);
            refresh();

        }
        catch (err) {

            console.error(err);
            setDisableCode("");
            setDisableRecoveryCode("");

            if (!extractLockout(err)) {
                toast.show(err.response?.data?.message || "Invalid verification code.", "error");
            }

        }
        finally {

            setDisabling(false);

        }

    }

    if (enrolling) {

        return (

            <div className="settings-subsection">

                <h3 className="settings-subhead">Enable MFA</h3>

                <p className="field-hint" style={{ marginTop: 0 }}>
                    Scan this QR code using Google Authenticator (or any standard TOTP app).
                </p>

                {qrDataUrl && (
                    <div style={{ textAlign: "center", margin: "12px 0" }}>
                        <img src={qrDataUrl} alt="MFA enrollment QR code" width={220} height={220} />
                    </div>
                )}

                <p className="field-hint">
                    Can't scan it? Enter this code manually: <code className="commit-sha">{enrollData?.secret}</code>
                </p>

                <form onSubmit={handleVerifyEnroll}>

                    <div className="form-group">
                        <label htmlFor="mfa-enroll-code">6-digit code</label>
                        <input
                            id="mfa-enroll-code"
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            className="form-control"
                            placeholder="123456"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                            autoComplete="off"
                            autoFocus
                            disabled={isLocked}
                        />
                    </div>

                    {isLocked && (
                        <p className="field-hint field-hint-bad" role="alert">
                            Too many wrong codes. Try again in <strong>{lockoutFormatted}</strong>.
                        </p>
                    )}

                    <div className="button-row">

                        <button type="submit" className="btn btn-primary" disabled={verifying || code.length !== 6 || isLocked}>
                            {isLocked ? `Locked (${lockoutFormatted})` : verifying ? "Verifying..." : "Verify & Enable"}
                        </button>

                        {showCancelEnrollButton && (
                            <button type="button" className="btn" onClick={cancelEnroll} disabled={verifying}>
                                Cancel
                            </button>
                        )}

                    </div>

                </form>

            </div>

        );

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">
                Multi-Factor Authentication
                {" "}
                {!loading && status?.enabled && (
                    <span className="badge badge-success">Enabled</span>
                )}
            </h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                {status?.enabled
                    ? "Reconnecting your GitHub token (from any browser) will ask for a code from your authenticator app. If you ever lose access to it, contact your portal admin for a one-time reset code — this portal doesn't hand out self-managed recovery codes."
                    : "Use Google Authenticator (or any standard TOTP app) to protect your Deployment Portal account. Once enabled, reconnecting your GitHub token from any browser will ask for a code. If you ever lose your device, your portal admin can issue you a one-time reset code."}
            </p>

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : status?.enabled ? (

                showDisable ? (

                    <form onSubmit={handleDisable}>

                        <div className="form-group">
                            <label htmlFor="mfa-disable-code">6-digit code</label>
                            <ClearableInput
                                id="mfa-disable-code"
                                inputMode="numeric"
                                placeholder="123456"
                                value={disableCode}
                                onChange={(e) => { setDisableCode(e.target.value.replace(/\D/g, "")); setDisableRecoveryCode(""); }}
                                onClear={() => setDisableCode("")}
                                autoComplete="off"
                                name="mfa-disable-code"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="mfa-disable-recovery">Or a recovery code</label>
                            <ClearableInput
                                id="mfa-disable-recovery"
                                placeholder="8H7K-XP2Q"
                                value={disableRecoveryCode}
                                onChange={(e) => { setDisableRecoveryCode(e.target.value); setDisableCode(""); }}
                                onClear={() => setDisableRecoveryCode("")}
                                autoComplete="off"
                                name="mfa-disable-recovery"
                            />
                            <p className="field-hint" style={{ marginBottom: 0 }}>
                                Only your portal admin can issue one of these.
                            </p>
                        </div>

                        {isLocked && (
                            <p className="field-hint field-hint-bad" role="alert">
                                Too many wrong codes. Try again in <strong>{lockoutFormatted}</strong>.
                            </p>
                        )}

                        <div className="button-row">

                            <button
                                type="submit"
                                className="btn btn-danger"
                                disabled={disabling || (!disableCode && !disableRecoveryCode) || isLocked}
                            >
                                {isLocked ? `Locked (${lockoutFormatted})` : disabling ? "Disabling..." : "Confirm Disable MFA"}
                            </button>

                            <button type="button" className="btn" onClick={() => setShowDisable(false)} disabled={disabling}>
                                Cancel
                            </button>

                        </div>

                    </form>

                ) : (

                    <>

                    <button type="button" className="btn btn-danger" onClick={() => setShowDisable(true)}>
                        Disable MFA
                    </button>

                    <div className="form-group" style={{ marginTop: 20 }}>

                        <label htmlFor="mfa-notification-email">Lockout notification email</label>

                        <p className="field-hint" style={{ marginTop: 0 }}>
                            If this account gets locked out after too many wrong codes, we'll email this
                            address so you (or your admin) know right away.
                        </p>

                        <div className="button-row">

                            <div style={{ flex: 1 }}>
                                <ClearableInput
                                    id="mfa-notification-email"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={notificationEmailInput}
                                    onChange={(e) => setNotificationEmailInput(e.target.value)}
                                    onClear={() => setNotificationEmailInput("")}
                                    autoComplete="email"
                                    name="mfa-notification-email"
                                />
                            </div>

                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleSaveNotificationEmail}
                                disabled={savingEmail || notificationEmailInput.trim() === notificationEmail}
                            >
                                {savingEmail ? "Saving..." : "Save"}
                            </button>

                        </div>

                    </div>

                    </>

                )

            ) : (

                <button type="button" className="btn btn-primary" onClick={handleStartEnroll}>
                    Enable MFA
                </button>

            )}

        </div>

    );

}

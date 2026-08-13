import { useEffect, useState } from "react";

import { getMfaPendingStatus, verifyLoginMfa, cancelLoginMfa } from "../services/authLoginService";
import Logo from "../components/common/Logo";

// Page 2 of the two-page login flow. No QR code here — enrollment (and
// its QR) lives exclusively in Settings > Credentials > MFA; this page
// only ever asks for a 6-digit code (or a recovery code) against a
// pending session the backend already created in step 1.
//
// "Never grant authentication merely because the frontend remembers the
// PAT was accepted" — so this never trusts its own memory of having just
// come from PatLoginPage. On mount, and again whenever the tab regains
// focus (covers a refresh, a background tab left open past its TTL, or
// another tab/window having already completed or cancelled this same
// pending session), it re-asks the server whether a pending challenge is
// still actually valid before showing the form at all.
export default function MfaVerifyPage({ onBack }) {

    const [checking, setChecking] = useState(true);
    const [code, setCode] = useState("");
    const [useRecovery, setUseRecovery] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    async function checkPending() {

        try {

            const result = await getMfaPendingStatus();

            if (!result.pending) {
                onBack("Your verification session has expired. Please sign in again.");
                return;
            }

            setChecking(false);

        }
        catch {

            // A failed check is not proof of a valid session either — fail
            // closed, same as a confirmed "not pending" response.
            onBack("Your verification session has expired. Please sign in again.");

        }

    }

    useEffect(() => {

        checkPending();

        function onVisible() {
            if (document.visibilityState === "visible") checkPending();
        }

        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleBack() {

        try {
            await cancelLoginMfa();
        }
        catch { /* best-effort — the pending entry also just expires on its own TTL */ }

        onBack();

    }

    async function handleSubmit(e) {

        e.preventDefault();

        if (!code.trim()) return;

        setSubmitting(true);
        setError("");

        try {

            const payload = useRecovery ? { recoveryCode: code.trim() } : { code: code.trim() };
            const result = await verifyLoginMfa(payload);

            if (!result.success) {

                setCode("");

                if (result.code === "MFA_SESSION_EXPIRED") {
                    onBack("Your verification session has expired. Please sign in again.");
                    return;
                }

                setError(result.message || "Invalid verification code. Please try again.");
                setSubmitting(false);
                return;

            }

            // Real credential now saved server-side — reload so bootstrap
            // picks it up and the normal app shell takes over.
            window.location.reload();

        }
        catch {

            setCode("");
            setError("Invalid verification code. Please try again.");
            setSubmitting(false);

        }

    }

    if (checking) {

        return (
            <div className="auth-page">
                <div className="auth-page-card" role="main" aria-busy="true">
                    <Logo showEyebrow={false} size={40} />
                </div>
            </div>
        );

    }

    return (

        <div className="auth-page">

            <div className="auth-page-card" role="main" aria-labelledby="mfa-verify-title">

                <Logo showEyebrow={false} size={40} />

                <h1 id="mfa-verify-title" className="setup-gate-title">
                    Multi-Factor Authentication
                </h1>

                <p className="field-hint" style={{ textAlign: "center" }}>
                    Verify your identity. Enter the {useRecovery ? "recovery code" : "6-digit code from your authenticator app"}.
                </p>

                <form onSubmit={handleSubmit} className="setup-gate-form">

                    <div className="form-group">
                        <label htmlFor="mfa-verify-code">{useRecovery ? "Recovery code" : "6-digit code"}</label>
                        <input
                            id="mfa-verify-code"
                            type="text"
                            inputMode={useRecovery ? "text" : "numeric"}
                            maxLength={useRecovery ? 9 : 6}
                            className="form-control"
                            placeholder={useRecovery ? "8H7K-XP2Q" : "123456"}
                            value={code}
                            onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, ""))}
                            autoComplete="off"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <p className="field-hint field-hint-bad" role="alert">{error}</p>
                    )}

                    <button type="submit" className="btn btn-primary" disabled={submitting || !code.trim()}>
                        {submitting ? "Verifying..." : "Verify"}
                    </button>

                </form>

                <div>
                    <button
                        type="button"
                        className="token-help-link"
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        onClick={() => { setUseRecovery((v) => !v); setCode(""); setError(""); }}
                    >
                        {useRecovery ? "Use an authenticator code instead" : "Use recovery code instead"}
                    </button>
                </div>

                <div>
                    <button type="button" className="btn" onClick={handleBack} disabled={submitting}>
                        &larr; Back to Login
                    </button>
                </div>

            </div>

        </div>

    );

}

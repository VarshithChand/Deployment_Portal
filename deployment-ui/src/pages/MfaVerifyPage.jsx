import { useEffect, useRef, useState } from "react";

import { getMfaPendingStatus, verifyLoginMfa, cancelLoginMfa, sendMfaEmailOtp } from "../services/authLoginService";
import Logo from "../components/common/Logo";
import useTheme from "../hooks/useTheme";
import useToast from "../hooks/useToast";
import useLockoutCountdown from "../hooks/useLockoutCountdown";
import { SunIcon, MoonIcon } from "../components/layout/SidebarIcons";

const RESEND_COOLDOWN_SECONDS = 45;

// Page 2 of the two-page login flow. No QR code here — enrollment (and
// its QR) lives exclusively in Settings > Credentials > MFA; this page
// only ever asks for a 6-digit code (or a recovery code) against a
// pending session the backend already created in step 1.
//
// "Never grant authentication merely because the frontend remembers the
// primary factor was accepted" — so this never trusts its own memory of
// having just come from LoginSignupPage. On mount, and again whenever the tab regains
// focus (covers a refresh, a background tab left open past its TTL, or
// another tab/window having already completed or cancelled this same
// pending session), it re-asks the server whether a pending challenge is
// still actually valid before showing the form at all.
export default function MfaVerifyPage({ onBack }) {

    const { theme, toggleTheme } = useTheme();
    const toast = useToast();

    const [checking, setChecking] = useState(true);
    const [code, setCode] = useState("");
    const [useRecovery, setUseRecovery] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [lockedUntilUtc, setLockedUntilUtc] = useState(null);

    // The alternate "Send OTP to Email" verification path, alongside the
    // default authenticator-code entry and the recovery-code fallback
    // below - useEmailOtp/useRecovery are mutually exclusive (see the two
    // toggle buttons near the bottom of this form). emailOtpSent tracks
    // whether a code has actually gone out yet in THIS mode, separately
    // from the resend cooldown, since the box row/button copy differ
    // before vs. after the first send.
    const [useEmailOtp, setUseEmailOtp] = useState(false);
    const [emailOtpSent, setEmailOtpSent] = useState(false);
    const [emailOtpSending, setEmailOtpSending] = useState(false);
    const [emailOtpCooldown, setEmailOtpCooldown] = useState(0);

    const { isLocked, formatted: lockoutFormatted } = useLockoutCountdown(lockedUntilUtc);

    const otpRefs = useRef([]);

    useEffect(() => {

        if (emailOtpCooldown <= 0) return;

        const timer = setTimeout(() => setEmailOtpCooldown((s) => Math.max(0, s - 1)), 1000);
        return () => clearTimeout(timer);

    }, [emailOtpCooldown]);

    async function handleSwitchToEmailOtp() {
        setUseRecovery(false);
        setUseEmailOtp(true);
        setCode("");
        setError("");
        setEmailOtpSent(false);
        await handleSendEmailOtp();
    }

    function handleSwitchToTotp() {
        setUseEmailOtp(false);
        setUseRecovery(false);
        setCode("");
        setError("");
    }

    function handleSwitchToRecovery() {
        setUseEmailOtp(false);
        setUseRecovery(true);
        setCode("");
        setError("");
    }

    async function handleSendEmailOtp() {

        if (emailOtpCooldown > 0 || emailOtpSending) return;

        setEmailOtpSending(true);
        setError("");

        try {

            const result = await sendMfaEmailOtp();

            if (!result.success) {

                if (result.code === "MFA_SESSION_EXPIRED") {
                    onBack("Your verification session has expired. Please sign in again.");
                    return;
                }

                setError(result.message || "Couldn't send the verification email.");

                if (typeof result.cooldownSeconds === "number") {
                    setEmailOtpCooldown(result.cooldownSeconds);
                }

                return;

            }

            setCode("");
            setEmailOtpSent(true);
            setEmailOtpCooldown(RESEND_COOLDOWN_SECONDS);
            toast.show("OTP sent to your registered email address.", "success");

        }
        catch {
            setError("Couldn't send the verification email. Try again in a moment.");
        }
        finally {
            setEmailOtpSending(false);
        }

    }

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

    // The 6 individual boxes are just a presentation over the same `code`
    // string the submit handler already used before this was boxes at
    // all - each box writes its digit into the right position and the
    // rest of this component (validation, the actual verify call) never
    // needed to know the input is split up.
    function handleOtpChange(index, rawValue) {

        const digit = rawValue.replace(/\D/g, "").slice(-1);
        const next = code.padEnd(6, " ").split("");

        next[index] = digit || " ";

        const joined = next.join("").trimEnd();
        setCode(joined);

        if (digit && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }

    }

    function handleOtpKeyDown(index, e) {

        if (e.key === "Backspace" && !(code[index]?.trim()) && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }

    }

    // A code pasted anywhere in the row (password managers/clipboard
    // commonly paste the whole 6 digits at once, not one at a time) fills
    // every box from wherever the paste landed, not just the first one.
    function handleOtpPaste(index, e) {

        e.preventDefault();

        const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6 - index);

        if (!digits) return;

        const next = code.padEnd(6, " ").split("");

        for (let i = 0; i < digits.length; i++) {
            next[index + i] = digits[i];
        }

        const joined = next.join("").trimEnd();
        setCode(joined);

        const focusIndex = Math.min(index + digits.length, 5);
        otpRefs.current[focusIndex]?.focus();

    }

    // For the OTP-box path, code can contain internal spaces (a gap left
    // by skipping a box) that a plain .trim() wouldn't catch - this is
    // what actually decides "ready to submit" for both paths.
    const isCodeComplete = useRecovery
        ? code.trim().length > 0
        : code.replace(/\s/g, "").length === 6;

    async function handleSubmit(e) {

        e.preventDefault();

        if (!isCodeComplete || isLocked) return;

        setSubmitting(true);
        setError("");

        try {

            const payload = useRecovery
                ? { recoveryCode: code.trim() }
                : { code: code.replace(/\s/g, ""), isEmailOtp: useEmailOtp };
            const result = await verifyLoginMfa(payload);

            if (!result.success) {

                setCode("");

                if (result.code === "MFA_SESSION_EXPIRED") {
                    onBack("Your verification session has expired. Please sign in again.");
                    return;
                }

                // Retrying the code won't help here - the code was right,
                // but this same account is already active on another
                // device (see AuthController.MfaVerify). Bouncing back to
                // login (same as an expired session) rather than leaving
                // them stuck re-entering a code that was never the problem.
                if (result.code === "ALREADY_CONNECTED_ELSEWHERE") {
                    onBack(result.message);
                    return;
                }

                if (result.code === "MFA_LOCKED") {
                    setLockedUntilUtc(result.lockedUntilUtc);
                    setError(result.message || "Too many wrong codes - try again later.");
                    setSubmitting(false);
                    return;
                }

                setError(result.message || "Invalid verification code. Please try again.");
                setSubmitting(false);
                otpRefs.current[0]?.focus();
                return;

            }

            // A fresh success clears any lockout this login may have been
            // building toward (see MfaLockoutPolicy.RecordSuccessAsync on
            // the backend) - nothing left to count down here either.
            setLockedUntilUtc(null);

            // Real credential now saved server-side — reload so bootstrap
            // picks it up and the normal app shell takes over.
            window.location.reload();

        }
        catch {

            setCode("");
            setError("Invalid verification code. Please try again.");
            setSubmitting(false);
            otpRefs.current[0]?.focus();

        }

    }

    const themeToggle = (

        <button
            type="button"
            className="auth-theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>

    );

    if (checking) {

        return (
            <div className="auth-page">
                <div className="auth-page-card" role="main" aria-busy="true">
                    {themeToggle}
                    <div className="auth-page-logo">
                        <Logo showEyebrow={false} compact size={34} />
                    </div>
                </div>
            </div>
        );

    }

    return (

        <div className="auth-page">

            <div className="auth-page-card" role="main" aria-labelledby="mfa-verify-title">

                {themeToggle}

                <div className="auth-page-logo">
                    <Logo showEyebrow={false} compact size={34} />
                </div>

                <h1 id="mfa-verify-title" className="setup-gate-title">
                    Multi-Factor Authentication
                </h1>

                <p className="field-hint" style={{ textAlign: "center" }}>
                    {useRecovery
                        ? "Verify your identity. Enter the recovery code."
                        : useEmailOtp
                            ? "Enter the verification code sent to your email address."
                            : "Verify your identity. Enter the 6-digit code from your authenticator app."}
                </p>

                {useEmailOtp && (

                    <p className="field-hint" style={{ textAlign: "center" }}>
                        {emailOtpCooldown > 0 ? (
                            <span>Resend OTP in {emailOtpCooldown}s</span>
                        ) : (
                            <button
                                type="button"
                                className="auth-chip-btn"
                                onClick={handleSendEmailOtp}
                                disabled={emailOtpSending}
                            >
                                {emailOtpSending ? "Sending..." : emailOtpSent ? "Resend OTP" : "Send OTP"}
                            </button>
                        )}
                    </p>

                )}

                <form onSubmit={handleSubmit} className="setup-gate-form">

                    <div className="form-group">
                        <label htmlFor="mfa-verify-code-0">
                            {useRecovery ? "Recovery code" : useEmailOtp ? "Email verification code" : "6-digit code"}
                        </label>

                        {useRecovery ? (

                            <input
                                id="mfa-verify-code-0"
                                type="text"
                                className="form-control"
                                placeholder="8H7K-XP2Q"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                autoComplete="off"
                                autoFocus
                                disabled={isLocked}
                            />

                        ) : (

                            <div className="auth-otp">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <input
                                        key={i}
                                        id={i === 0 ? "mfa-verify-code-0" : undefined}
                                        ref={(el) => { otpRefs.current[i] = el; }}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        className={code[i]?.trim() ? "filled" : ""}
                                        value={code[i]?.trim() || ""}
                                        onChange={(e) => handleOtpChange(i, e.target.value)}
                                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                        onPaste={(e) => handleOtpPaste(i, e)}
                                        autoComplete="off"
                                        autoFocus={i === 0}
                                        disabled={isLocked}
                                    />
                                ))}
                            </div>

                        )}

                    </div>

                    {isLocked ? (
                        <p className="field-hint field-hint-bad" role="alert">
                            Too many wrong codes. Try again in <strong>{lockoutFormatted}</strong>.
                        </p>
                    ) : error && (
                        <p className="field-hint field-hint-bad" role="alert">{error}</p>
                    )}

                    <button type="submit" className="btn btn-primary" disabled={submitting || !isCodeComplete || isLocked}>
                        {isLocked ? `Locked (${lockoutFormatted})` : submitting ? "Verifying..." : "Verify"}
                    </button>

                </form>

                <div className="button-row" style={{ flexWrap: "wrap", justifyContent: "center", gap: "6px 14px" }}>

                    {useRecovery && (
                        <button type="button" className="auth-chip-btn" onClick={handleSwitchToTotp}>
                            Use an authenticator code instead
                        </button>
                    )}

                    {!useRecovery && (
                        <button type="button" className="auth-chip-btn" onClick={handleSwitchToRecovery}>
                            Use recovery code instead
                        </button>
                    )}

                    {!useEmailOtp && (
                        <button type="button" className="auth-chip-btn" onClick={handleSwitchToEmailOtp}>
                            Send OTP to Email
                        </button>
                    )}

                    {useEmailOtp && (
                        <button type="button" className="auth-chip-btn" onClick={handleSwitchToTotp}>
                            Use an authenticator code instead
                        </button>
                    )}

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

import { useState } from "react";

import { signUp, logIn, requestPasswordReset, resetPassword } from "../services/authLoginService";
import { API_BASE, getSessionId } from "../api/apiBase";
import Logo from "../components/common/Logo";
import useTheme from "../hooks/useTheme";
import useToast from "../hooks/useToast";
import { SunIcon, MoonIcon } from "../components/layout/SidebarIcons";

// Same stroke-weight/line-cap style as PatLoginPage's old KeyIcon, so
// these read as part of the same icon set.
function EmailIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="2" y="4" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2.5 5L9 10L15.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function PasswordIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="4" y="8" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 8V5.5a3 3 0 0 1 6 0V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

// Open eye - shown while the password is masked, click to reveal.
function EyeIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M1.5 9S4.5 3.5 9 3.5 16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.5" />
        </svg>
    );
}

// Slashed eye - shown while the password is revealed, click to mask again.
function EyeOffIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M2.3 5.4C1.2 6.6 1.5 9 1.5 9s3 5.5 7.5 5.5c1.09 0 2.08-.32 2.95-.79M14.6 12c1.16-1.16 1.9-3 1.9-3s-3-5.5-7.5-5.5c-.62 0-1.2.1-1.76.28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7.1 7.1a2.25 2.25 0 0 0 3.18 3.18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M2 2l14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

// Google's real 4-color "G" mark - brand recognition matters for an OAuth
// button, so this is the standard glyph, not an abstracted icon-set piece.
function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.95v2.33A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.05l3.02-2.33Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.95l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
        </svg>
    );
}

// GitHub's Octocat mark, single-path, currentColor - matches the theme
// like every other icon on this page instead of a fixed brand color.
function GitHubIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
    );
}

// Replaces PatLoginPage - the ONLY thing a not-yet-authenticated visitor
// sees (see App.jsx's top-level gate; TopBar/Sidebar never mount
// alongside this). Three ways in, all funneling into the same server-side
// MFA-pending check as each other (see OAuthLoginFinisher/
// AccountAuthController): email/password (with self-serve signup), or a
// redirect to the Google/GitHub OAuth flows.
export default function LoginSignupPage({ onMfaRequired }) {

    const { theme, toggleTheme } = useTheme();
    const toast = useToast();

    const [mode, setMode] = useState("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    // Set once a fresh signup's response comes back with
    // emailVerificationRequired:true (see AccountAuthController.
    // FinishPrimaryFactorAsync) - the account exists but nothing else about
    // it (role, MFA, a session) is resolved yet, so there's nothing to do
    // here but tell them to go click the link. The rest of "verify -> MFA
    // setup -> dashboard" happens after they leave this tab entirely and
    // click the emailed link (see AccountAuthController.VerifyEmail) -
    // mandatory MFA enrollment itself is enforced server-side from there on
    // (see MfaEnforcementGate/PortalUserAccount.MustSetUpMfa), not by
    // anything in this component.
    const [checkEmailSent, setCheckEmailSent] = useState(false);

    // Present only when this page was opened from the link in a password-
    // reset email (see AccountAuthController.ForgotPassword's resetUrl) -
    // read once on mount, not re-checked, since nothing after this changes
    // the URL until a full reload happens anyway.
    const [resetToken] = useState(() => new URLSearchParams(window.location.search).get("resetToken"));
    const [showForgotForm, setShowForgotForm] = useState(false);
    const [forgotSent, setForgotSent] = useState(false);
    const [forgotSubmitting, setForgotSubmitting] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [resetSubmitting, setResetSubmitting] = useState(false);
    const [resetError, setResetError] = useState("");

    const isSignup = mode === "signup";

    async function handleSubmit(e) {

        e.preventDefault();

        if (!email.trim() || !password) {
            setError(isSignup ? "Email and password are required." : "Email/username and password are required.");
            return;
        }

        setSubmitting(true);
        setError("");

        try {

            const result = isSignup
                ? await signUp(email.trim(), password, displayName.trim() || undefined)
                : await logIn(email.trim(), password);

            if (!result.success) {
                setError(result.message || "Unable to sign in.");
                setSubmitting(false);
                return;
            }

            if (result.emailVerificationRequired) {
                setCheckEmailSent(true);
                setSubmitting(false);
                return;
            }

            if (result.mfaRequired) {
                onMfaRequired();
                return;
            }

            // Real session cookie now set server-side — reload so
            // bootstrap picks it up and the normal app shell takes over
            // (MfaEnforcementGate handles mandatory enrollment from there
            // if this account still needs it - see PortalUserAccount.
            // MustSetUpMfa).
            window.location.reload();

        }
        catch (err) {

            setError(err.response?.data?.message || "Unable to sign in.");
            setSubmitting(false);

        }

    }

    function handleForgotPassword(e) {
        e.preventDefault();
        setError("");
        setShowForgotForm(true);
    }

    // Always shows the same "check your email" confirmation regardless of
    // what the server actually did - see AccountAuthController.
    // ForgotPassword, which deliberately never reveals whether the email
    // matched an account, so there's nothing more specific to show here
    // even on request.success === true.
    async function handleRequestReset(e) {

        e.preventDefault();

        if (!email.trim()) {
            setError("Enter your email address.");
            return;
        }

        setForgotSubmitting(true);
        setError("");

        try {
            await requestPasswordReset(email.trim());
            setForgotSent(true);
        }
        catch (err) {
            setError(err.response?.data?.message || "Something went wrong. Try again.");
        }
        finally {
            setForgotSubmitting(false);
        }

    }

    // Same shape of response as handleSubmit's signup/login branch -
    // ResetPassword routes through the identical FinishPrimaryFactorAsync
    // tail server-side, so mfaRequired/token/success all mean the same
    // thing here.
    async function handleResetSubmit(e) {

        e.preventDefault();

        if (newPassword.length < 8) {
            setResetError("Password must be at least 8 characters.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setResetError("Passwords don't match.");
            return;
        }

        setResetSubmitting(true);
        setResetError("");

        try {

            const result = await resetPassword(resetToken, newPassword);

            if (!result.success) {
                setResetError(result.message || "Unable to reset password.");
                setResetSubmitting(false);
                return;
            }

            if (result.mfaRequired) {
                onMfaRequired();
                return;
            }

            toast.show("Password updated.", "success");
            // Strips ?resetToken= before the reload picks up the new
            // session, same reasoning as VerifyEmail's own URL cleanup -
            // a refresh afterward shouldn't re-show this form with a
            // token that's already been consumed.
            window.location.href = window.location.pathname;

        }
        catch (err) {

            setResetError(err.response?.data?.message || "Unable to reset password.");
            setResetSubmitting(false);

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

    // Reached only via the link in a password-reset email - resetToken was
    // read from the URL once on mount. Takes priority over every other
    // state on this page since arriving here means exactly one thing:
    // finish setting a new password.
    if (resetToken) {

        return (

            <div className="auth-page">

                <div className="auth-page-card" role="main" aria-labelledby="reset-password-title">

                    {themeToggle}

                    <div className="auth-page-logo">
                        <Logo showEyebrow={false} compact size={34} />
                    </div>

                    <h1 id="reset-password-title" className="setup-gate-title">
                        Set a new password
                    </h1>

                    <p className="field-hint" style={{ textAlign: "center" }}>
                        Choose a new password for your account.
                    </p>

                    <form onSubmit={handleResetSubmit} className="setup-gate-form">

                        <div className="form-group">
                            <label htmlFor="new-password">New password</label>
                            <div className="auth-page-field">
                                <PasswordIcon />
                                <input
                                    id="new-password"
                                    type={showNewPassword ? "text" : "password"}
                                    placeholder="At least 8 characters"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    autoComplete="new-password"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    className="auth-page-field-toggle"
                                    onClick={() => setShowNewPassword((v) => !v)}
                                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                                    aria-pressed={showNewPassword}
                                >
                                    {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirm-new-password">Confirm new password</label>
                            <div className="auth-page-field">
                                <PasswordIcon />
                                <input
                                    id="confirm-new-password"
                                    type={showNewPassword ? "text" : "password"}
                                    placeholder="Type it again"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>

                        {resetError && (
                            <p className="field-hint field-hint-bad" role="alert">{resetError}</p>
                        )}

                        <button type="submit" className="btn btn-primary" disabled={resetSubmitting}>
                            {resetSubmitting ? "Please wait..." : "Set new password"}
                        </button>

                    </form>

                </div>

            </div>

        );

    }

    if (showForgotForm) {

        return (

            <div className="auth-page">

                <div className="auth-page-card" role="main" aria-labelledby="forgot-password-title">

                    {themeToggle}

                    <div className="auth-page-logo">
                        <Logo showEyebrow={false} compact size={34} />
                    </div>

                    {forgotSent ? (

                        <>

                            <h1 id="forgot-password-title" className="setup-gate-title">
                                Check your email
                            </h1>

                            <p className="field-hint" style={{ textAlign: "center" }}>
                                If <strong>{email.trim()}</strong> has an account, we've sent a link to reset
                                its password. The link expires in 1 hour.
                            </p>

                            <p className="field-hint" style={{ textAlign: "center" }}>
                                <button
                                    type="button"
                                    className="token-help-link"
                                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                                    onClick={() => { setShowForgotForm(false); setForgotSent(false); setError(""); }}
                                >
                                    Back to sign in
                                </button>
                            </p>

                        </>

                    ) : (

                        <>

                            <h1 id="forgot-password-title" className="setup-gate-title">
                                Reset your password
                            </h1>

                            <p className="field-hint" style={{ textAlign: "center" }}>
                                Enter the email on your account and we'll send you a link to set a new password.
                            </p>

                            <form onSubmit={handleRequestReset} className="setup-gate-form">

                                <div className="form-group">
                                    <label htmlFor="forgot-email">Email</label>
                                    <div className="auth-page-field">
                                        <EmailIcon />
                                        <input
                                            id="forgot-email"
                                            type="email"
                                            placeholder="you@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            autoComplete="email"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <p className="field-hint field-hint-bad" role="alert">{error}</p>
                                )}

                                <button type="submit" className="btn btn-primary" disabled={forgotSubmitting}>
                                    {forgotSubmitting ? "Please wait..." : "Send reset link"}
                                </button>

                            </form>

                            <p style={{ textAlign: "center", margin: "8px 0 0" }}>
                                <button
                                    type="button"
                                    className="token-help-link"
                                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                                    onClick={() => { setShowForgotForm(false); setError(""); }}
                                >
                                    Back to sign in
                                </button>
                            </p>

                        </>

                    )}

                </div>

            </div>

        );

    }

    // Terminal state for this tab - there is nothing left to submit here.
    // The rest of the flow (verify -> mandatory MFA setup -> dashboard)
    // continues only once they open the email and click the link, which
    // lands them back on the app fresh (see AccountAuthController.
    // VerifyEmail and MfaEnforcementGate).
    if (checkEmailSent) {

        return (

            <div className="auth-page">

                <div className="auth-page-card" role="main" aria-labelledby="check-email-title">

                    {themeToggle}

                    <div className="auth-page-logo">
                        <Logo showEyebrow={false} compact size={34} />
                    </div>

                    <h1 id="check-email-title" className="setup-gate-title">
                        Check your email
                    </h1>

                    <p className="field-hint" style={{ textAlign: "center" }}>
                        We sent a verification link to <strong>{email.trim()}</strong>. Open it and click
                        {" "}<strong>Verify Your Email</strong> to finish creating your account and set up MFA.
                    </p>

                    <p className="field-hint" style={{ textAlign: "center" }}>
                        Didn&apos;t get it? Check spam, or{" "}
                        <button
                            type="button"
                            className="token-help-link"
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                            onClick={() => { setCheckEmailSent(false); setMode("login"); setError(""); }}
                        >
                            go back
                        </button>.
                    </p>

                </div>

            </div>

        );

    }

    return (

        <div className="auth-page">

            <div className="auth-page-card" role="main" aria-labelledby="login-signup-title">

                {themeToggle}

                <div className="auth-page-logo">
                    <Logo showEyebrow={false} compact size={34} />
                </div>

                <h1 id="login-signup-title" className="setup-gate-title">
                    {isSignup ? "Create your account" : "Welcome back"}
                </h1>

                <p className="field-hint" style={{ textAlign: "center" }}>
                    {isSignup
                        ? "Sign up with your email to get started."
                        : "Sign in to continue to the Deployment Portal."}
                </p>

                <form onSubmit={handleSubmit} className="setup-gate-form">

                    {isSignup && (
                        <div className="form-group">
                            <label htmlFor="login-display-name">Name (optional)</label>
                            <input
                                id="login-display-name"
                                type="text"
                                className="form-control"
                                placeholder="Jane Doe"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                autoComplete="name"
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="login-email">{isSignup ? "Email" : "Email or Username"}</label>
                        <div className="auth-page-field">
                            <EmailIcon />
                            <input
                                id="login-email"
                                // Signup always creates a real account by email - a
                                // username is derived automatically server-side (see
                                // AccountAuthService.DeriveUniqueUsernameAsync), not
                                // typed here. Login accepts either, so it can't use
                                // type="email" (a browser would block submitting a
                                // plain username as invalid).
                                type={isSignup ? "email" : "text"}
                                placeholder={isSignup ? "you@example.com" : "you@example.com or username"}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete={isSignup ? "email" : "username"}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="login-password" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>Password</span>
                            {!isSignup && (
                                <button
                                    type="button"
                                    className="token-help-link"
                                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "12.5px" }}
                                    onClick={handleForgotPassword}
                                >
                                    Forgot?
                                </button>
                            )}
                        </label>
                        <div className="auth-page-field">
                            <PasswordIcon />
                            <input
                                id="login-password"
                                type={showPassword ? "text" : "password"}
                                placeholder={isSignup ? "At least 8 characters" : "Your password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete={isSignup ? "new-password" : "current-password"}
                            />
                            <button
                                type="button"
                                className="auth-page-field-toggle"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                aria-pressed={showPassword}
                            >
                                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <p className="field-hint field-hint-bad" role="alert">{error}</p>
                    )}

                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                        {submitting ? "Please wait..." : isSignup ? "Sign Up" : "Log In"}
                    </button>

                </form>

                <p style={{ textAlign: "center", margin: "8px 0 0" }}>
                    <button
                        type="button"
                        className="token-help-link"
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        onClick={() => { setMode(isSignup ? "login" : "signup"); setError(""); }}
                    >
                        {isSignup ? "Already have an account? Log in" : "New here? Create an account"}
                    </button>
                </p>

                <div className="auth-page-divider">
                    <span>or continue with</span>
                </div>

                <div className="button-row" style={{ justifyContent: "center" }}>

                    <a href={`${API_BASE}/api/auth/google/login?sid=${encodeURIComponent(getSessionId())}`} className="btn btn-secondary">
                        <GoogleIcon />
                        {" "}Google
                    </a>

                    <a href={`${API_BASE}/api/auth/github/login?sid=${encodeURIComponent(getSessionId())}`} className="btn btn-secondary">
                        <GitHubIcon />
                        {" "}GitHub
                    </a>

                </div>

            </div>

        </div>

    );

}

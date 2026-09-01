import { useState } from "react";
import {
    Rocket, ShieldCheck, KeyRound, Lock, Eye, EyeOff, User,
    Server, Clock
} from "lucide-react";

import { signUp, logIn, requestPasswordReset, resetPassword } from "../services/authLoginService";
import { API_BASE, getSessionId } from "../api/apiBase";
import useTheme from "../hooks/useTheme";
import useToast from "../hooks/useToast";
import { SunIcon, MoonIcon } from "../components/layout/SidebarIcons";

// Matches the Dashboard's own "ops console" layout (Round 7 - Dashboard.
// jsx) for the one other page a visitor sees before any of the app's own
// chrome exists (this renders before TopBar/Sidebar ever mount - see
// App.jsx's top-level gate). Every color below is one of this app's own
// theme tokens (var(--card-bg)/--text/--text-muted/--stroke/--heading-
// accent/--viz-good/etc - the same ones .card/StatusBadge use everywhere
// else), scoped under .aw-root - so this page matches every other page
// and follows the light/dark toggle, rather than being a separate fixed-
// dark identity (an earlier version of this page was exactly that; it
// didn't match the rest of the app and was explicitly asked to be fixed).
// GitHub's brand mark isn't in lucide-react (dropped in this app's
// installed version, same gap Dashboard.jsx hit) - GitHubIcon below is
// the same inline octocat path the previous version of this page used.
const S = { ok: "var(--viz-good)", running: "var(--heading-accent)", warn: "var(--viz-warning)" };

const PROVIDERS = [
    { n: "GitHub", s: "ok" }, { n: "Azure DevOps", s: "ok" },
    { n: "AWS", s: "ok" }, { n: "Azure", s: "ok" }, { n: "GCP", s: "warn" },
    { n: "Render", s: "ok" }, { n: "Cloudflare", s: "ok" }, { n: "Harbor", s: "ok" },
    { n: "ECR", s: "ok" }, { n: "SonarQube", s: "ok" }
];

// A static illustration of what's behind the login, not live data - unlike
// every in-app page this session has been careful to only ever show real
// numbers on, there's no session yet here to fetch anything real WITH.
// Framed as a preview/mockup (aria-hidden, no claim of live status)
// specifically so it doesn't read as a lie about current system state.
const PREVIEW_RUNS = [
    { wf: "deploy-api.yml", env: "acpt", sha: "a91f3c7", s: "running", time: "now" },
    { wf: "deploy-ui.yml", env: "prod", sha: "b4a0f91", s: "ok", time: "6h ago" }
];

function GoogleMark() {
    return <span className="oauth-g" aria-hidden>G</span>;
}

function GitHubIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
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

    const [mode, setMode] = useState("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

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

    const isReg = mode === "register";

    async function handleSubmit(e) {

        e.preventDefault();

        if (!email.trim() || !password) {
            setError(isReg ? "Email and password are required." : "Email/username and password are required.");
            return;
        }

        setSubmitting(true);
        setError("");

        try {

            const result = isReg
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
            window.location.href = window.location.pathname;

        }
        catch (err) {

            setResetError(err.response?.data?.message || "Unable to reset password.");
            setResetSubmitting(false);

        }

    }

    // This page renders before any of the app's own chrome (TopBar/
    // Sidebar) mounts, so it needs its own theme toggle - every other page
    // reaches useTheme via TopBar instead.
    const themeToggle = (
        <button
            type="button"
            className="aw-theme-toggle"
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

            <div className="aw-root">
                <style>{CSS}</style>
                {themeToggle}

                <div className="aw-split aw-split-solo">

                    <main className="authcol">

                        <div className="card" role="main" aria-labelledby="reset-password-title">

                            <div className="card-body">

                                <h2 id="reset-password-title">Set a new password</h2>

                                <p className="lede">Choose a new password for your account.</p>

                                <form className="form" onSubmit={handleResetSubmit}>

                                    <label className="field">
                                        <span>New password</span>
                                        <div className="input">
                                            <Lock size={15} />
                                            <input
                                                type={showNewPassword ? "text" : "password"}
                                                placeholder="At least 8 characters"
                                                autoComplete="new-password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                className="peek"
                                                aria-label={showNewPassword ? "Hide password" : "Show password"}
                                                aria-pressed={showNewPassword}
                                                onClick={() => setShowNewPassword((v) => !v)}
                                            >
                                                {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                            </button>
                                        </div>
                                    </label>

                                    <label className="field">
                                        <span>Confirm new password</span>
                                        <div className="input">
                                            <Lock size={15} />
                                            <input
                                                type={showNewPassword ? "text" : "password"}
                                                placeholder="Type it again"
                                                autoComplete="new-password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                            />
                                        </div>
                                    </label>

                                    {resetError && (
                                        <p className="form-error" role="alert">{resetError}</p>
                                    )}

                                    <button type="submit" className="primary" disabled={resetSubmitting}>
                                        {resetSubmitting ? "Please wait..." : "Set new password"}
                                    </button>

                                </form>

                            </div>

                        </div>

                    </main>

                </div>

            </div>

        );

    }

    if (showForgotForm) {

        return (

            <div className="aw-root">
                <style>{CSS}</style>
                {themeToggle}

                <div className="aw-split aw-split-solo">

                    <main className="authcol">

                        <div className="card" role="main" aria-labelledby="forgot-password-title">

                            {forgotSent ? (

                                <div className="card-body card-body-center">

                                    <span className="check-glyph"><ShieldCheck size={22} /></span>

                                    <h2 id="forgot-password-title">Check your email</h2>

                                    <p className="lede" style={{ textAlign: "center" }}>
                                        If <strong>{email.trim()}</strong> has an account, we've sent a link to
                                        reset its password. The link expires in 1 hour.
                                    </p>

                                    <p className="allowlist">
                                        <button
                                            type="button"
                                            className="linklike"
                                            onClick={() => { setShowForgotForm(false); setForgotSent(false); setError(""); }}
                                        >
                                            Back to sign in
                                        </button>
                                    </p>

                                </div>

                            ) : (

                                <div className="card-body">

                                    <h2 id="forgot-password-title">Reset your password</h2>

                                    <p className="lede">
                                        Enter the email on your account and we'll send you a link to set a new
                                        password.
                                    </p>

                                    <form className="form" onSubmit={handleRequestReset}>

                                        <label className="field">
                                            <span>Email</span>
                                            <div className="input">
                                                <span className="at">@</span>
                                                <input
                                                    type="email"
                                                    placeholder="you@example.com"
                                                    autoComplete="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    autoFocus
                                                />
                                            </div>
                                        </label>

                                        {error && (
                                            <p className="form-error" role="alert">{error}</p>
                                        )}

                                        <button type="submit" className="primary" disabled={forgotSubmitting}>
                                            {forgotSubmitting ? "Please wait..." : "Send reset link"}
                                        </button>

                                    </form>

                                    <p className="allowlist">
                                        <button
                                            type="button"
                                            className="linklike"
                                            onClick={() => { setShowForgotForm(false); setError(""); }}
                                        >
                                            Back to sign in
                                        </button>
                                    </p>

                                </div>

                            )}

                        </div>

                    </main>

                </div>

            </div>

        );

    }

    if (checkEmailSent) {

        return (

            <div className="aw-root">
                <style>{CSS}</style>
                {themeToggle}

                <div className="aw-split aw-split-solo">

                    <main className="authcol">

                        <div className="card" role="main" aria-labelledby="check-email-title">

                            <div className="card-body card-body-center">

                                <span className="check-glyph"><ShieldCheck size={22} /></span>

                                <h2 id="check-email-title">Check your email</h2>

                                <p className="lede" style={{ textAlign: "center" }}>
                                    We sent a verification link to <strong>{email.trim()}</strong>. Open it and
                                    click <strong>Verify Your Email</strong> to finish creating your account and
                                    set up MFA.
                                </p>

                                <p className="allowlist">
                                    Didn&apos;t get it? Check spam, or{" "}
                                    <button
                                        type="button"
                                        className="linklike"
                                        onClick={() => { setCheckEmailSent(false); setMode("signin"); setError(""); }}
                                    >
                                        go back
                                    </button>.
                                </p>

                            </div>

                        </div>

                    </main>

                </div>

            </div>

        );

    }

    return (

        <div className="aw-root">
            <style>{CSS}</style>
            {themeToggle}

            <div className="aw-split">

                {/* ---------------- brand / showcase ---------------- */}
                <aside className="showcase">

                    <div className="brand">
                        <span className="glyph"><Rocket size={17} strokeWidth={2.4} /></span>
                        <span className="brand-name">Deployment Portal</span>
                    </div>

                    <div className="pitch">
                        <h1>Every deployment, one console.</h1>
                        <p>
                            Trigger releases, watch runs, and approve promotions across GitHub Actions,
                            AWS, Azure, GCP, and your registries — without hopping between ten dashboards.
                        </p>
                    </div>

                    {/* console preview - illustrative, not live data (see PREVIEW_RUNS comment) */}
                    <div className="preview" aria-hidden>

                        <div className="preview-bar">
                            <span className="live"><span className="live-dot" />What's behind the login</span>
                        </div>

                        <div className="preview-runs">
                            {PREVIEW_RUNS.map((r, i) => (
                                <div key={i} className="prun">
                                    <span className="pdot" style={{ background: S[r.s] }}>
                                        {r.s === "running" && <span className="pping" style={{ background: S[r.s] }} />}
                                    </span>
                                    <span className="mono pwf">{r.wf}</span>
                                    <span className={"penv " + r.env}>{r.env}</span>
                                    <span className="mono psha">{r.sha}</span>
                                    <span className="ptime"><Clock size={10} />{r.time}</span>
                                    {r.s === "running" && <span className="pprog"><i /></span>}
                                </div>
                            ))}
                        </div>

                        <div className="preview-chips">
                            {PROVIDERS.map((p) => (
                                <span key={p.n} className="chip">
                                    <span className="cdot" style={{ background: S[p.s] }} />{p.n}
                                </span>
                            ))}
                            <span className="chip more">+20 more</span>
                        </div>

                    </div>

                    <ul className="trust">
                        <li><ShieldCheck size={14} /> Multi-factor auth is required for every account</li>
                        <li><KeyRound size={14} /> Cloud keys and tokens encrypted at rest</li>
                        <li><Server size={14} /> Role-based access, enforced on every request</li>
                    </ul>

                </aside>

                {/* ---------------- auth card ---------------- */}
                <main className="authcol">

                    <div className="card">

                        <div className="tabs" role="tablist" aria-label="Sign in or create account">

                            <button role="tab" aria-selected={!isReg}
                                className={"tab" + (!isReg ? " on" : "")}
                                onClick={() => { setMode("signin"); setError(""); }}>
                                Sign in
                            </button>

                            <button role="tab" aria-selected={isReg}
                                className={"tab" + (isReg ? " on" : "")}
                                onClick={() => { setMode("register"); setError(""); }}>
                                Create account
                            </button>

                            <span className="tab-ink" style={{ transform: isReg ? "translateX(100%)" : "none" }} />

                        </div>

                        <div className="card-body">

                            <h2>{isReg ? "Request access" : "Welcome back"}</h2>

                            <p className="lede">
                                {isReg
                                    ? "New accounts need an allowlisted email. You'll verify it, then set up MFA."
                                    : "Sign in to reach your deployments, resources, and approvals."}
                            </p>

                            <div className="oauth">

                                <a
                                    className="oauth-btn"
                                    href={`${API_BASE}/api/auth/google/login?sid=${encodeURIComponent(getSessionId())}`}
                                >
                                    <GoogleMark /> Continue with Google
                                </a>

                                <a
                                    className="oauth-btn"
                                    href={`${API_BASE}/api/auth/github/login?sid=${encodeURIComponent(getSessionId())}`}
                                >
                                    <GitHubIcon /> Continue with GitHub
                                </a>

                            </div>

                            <div className="divider"><span>or use your email</span></div>

                            <form className={"form" + (isReg ? " reg" : "")} onSubmit={handleSubmit}>

                                {isReg && (
                                    <label className="field">
                                        <span>Name (optional)</span>
                                        <div className="input">
                                            <User size={15} />
                                            <input
                                                type="text"
                                                placeholder="Jane Doe"
                                                autoComplete="name"
                                                value={displayName}
                                                onChange={(e) => setDisplayName(e.target.value)}
                                            />
                                        </div>
                                    </label>
                                )}

                                <label className="field">
                                    <span>{isReg ? "Email" : "Email or Username"}</span>
                                    <div className="input">
                                        <span className="at">@</span>
                                        <input
                                            // Signup always creates a real account by email - a
                                            // username is derived automatically server-side (see
                                            // AccountAuthService.DeriveUniqueUsernameAsync), not
                                            // typed here. Login accepts either, so it can't use
                                            // type="email" (a browser would block submitting a
                                            // plain username as invalid).
                                            type={isReg ? "email" : "text"}
                                            placeholder={isReg ? "you@example.com" : "you@example.com or username"}
                                            autoComplete={isReg ? "email" : "username"}
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                </label>

                                <label className="field">
                                    <span className="field-top">
                                        Password
                                        {!isReg && (
                                            <button type="button" className="forgot" onClick={handleForgotPassword}>Forgot?</button>
                                        )}
                                    </span>
                                    <div className="input">
                                        <Lock size={15} />
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder={isReg ? "At least 8 characters" : "Your password"}
                                            autoComplete={isReg ? "new-password" : "current-password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="peek"
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                            aria-pressed={showPassword}
                                            onClick={() => setShowPassword((v) => !v)}
                                        >
                                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    </div>
                                </label>

                                {error && (
                                    <p className="form-error" role="alert">{error}</p>
                                )}

                                <button type="submit" className="primary" disabled={submitting}>
                                    {submitting ? "Please wait..." : isReg ? "Create account" : "Sign in"}
                                </button>

                                {isReg && (
                                    <div className="mfa-note">
                                        <ShieldCheck size={14} />
                                        <span>After email verification, you'll set up MFA before the dashboard opens.</span>
                                    </div>
                                )}

                            </form>

                            <p className="allowlist">
                                {isReg
                                    ? "Can't get in? Ask an admin to add your email to the allowlist."
                                    : "Access is invite-only. Ask an admin if your email isn't allowlisted yet."}
                            </p>

                        </div>

                    </div>

                    <p className="foot">Internal tool for the platform team · Deployment Portal</p>

                </main>

            </div>

        </div>

    );

}

const CSS = `
.aw-root{
  color:var(--text);
  min-height:100vh; -webkit-font-smoothing:antialiased;
}
.aw-root *{box-sizing:border-box;}
.aw-root .mono{font-family:'JetBrains Mono',ui-monospace,monospace; font-feature-settings:"tnum";}
.aw-root button{font-family:inherit; cursor:pointer;}
.aw-root a{color:inherit; text-decoration:none;}
.aw-root :focus-visible{outline:2px solid var(--heading-accent); outline-offset:2px; border-radius:8px;}

/* Fixed (not absolute, unlike .auth-theme-toggle) since this page's
   layout has no single relatively-positioned card wrapper common to
   every one of its 4 states (main/forgot/reset/check-email) to anchor to. */
.aw-root .aw-theme-toggle{
  position:fixed; top:18px; right:18px; width:34px; height:34px; border-radius:10px;
  display:grid; place-items:center; background:var(--card-bg); border:1px solid var(--stroke);
  color:var(--text-muted); cursor:pointer; z-index:10;
  transition:color .15s ease, transform .15s ease, border-color .15s ease;
}
.aw-root .aw-theme-toggle:hover{color:var(--heading-accent); border-color:var(--heading-accent); transform:translateY(-1px);}

.aw-root .aw-split{display:grid; grid-template-columns:1.15fr .85fr; min-height:100vh; max-width:1240px; margin:0 auto;}
.aw-root .aw-split-solo{grid-template-columns:1fr; align-items:center; justify-items:center; max-width:520px;}

/* ---------- showcase ---------- */
.aw-root .showcase{padding:44px 54px; display:flex; flex-direction:column; gap:30px; border-right:1px solid var(--border);}
.aw-root .brand{display:flex; align-items:center; gap:11px;}
.aw-root .glyph{width:32px; height:32px; border-radius:9px; display:grid; place-items:center; color:#fff;
  background:linear-gradient(135deg, var(--heading-accent), var(--accent-secondary));
  box-shadow:0 8px 20px -8px color-mix(in srgb, var(--heading-accent) 60%, transparent);}
.aw-root .brand-name{font-weight:600; font-size:16px; letter-spacing:-.01em; color:var(--heading-accent);}

.aw-root .pitch{margin-top:8px;}
.aw-root .pitch h1{margin:0; font-size:38px; line-height:1.08; font-weight:600; letter-spacing:-.03em; color:var(--text);}
.aw-root .pitch p{margin:16px 0 0; font-size:15px; line-height:1.55; color:var(--text-muted); max-width:46ch;}

/* console preview */
.aw-root .preview{background:var(--card-bg); border:1px solid var(--stroke);
  border-radius:16px; padding:14px; box-shadow:0 10px 30px -12px var(--card-shadow);
  backdrop-filter:blur(22px) saturate(160%); -webkit-backdrop-filter:blur(22px) saturate(160%);}
.aw-root .preview-bar{display:flex; align-items:center; justify-content:space-between; padding:2px 4px 12px; border-bottom:1px solid var(--border);}
.aw-root .live{display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--text); font-weight:500;}
.aw-root .live-dot{width:8px; height:8px; border-radius:50%; background:${S.ok}; box-shadow:0 0 0 3px color-mix(in srgb, ${S.ok} 22%, transparent); animation:aw-blink 2s infinite;}
@keyframes aw-blink{50%{opacity:.4}}

.aw-root .preview-runs{display:flex; flex-direction:column; padding:6px 0;}
.aw-root .prun{position:relative; display:flex; align-items:center; gap:10px; padding:9px 4px;}
.aw-root .prun + .prun{border-top:1px solid var(--border);}
.aw-root .pdot{position:relative; width:8px; height:8px; border-radius:50%; flex:0 0 auto;}
.aw-root .pping{position:absolute; inset:0; border-radius:50%; animation:aw-ping 1.8s cubic-bezier(0,0,.2,1) infinite;}
@keyframes aw-ping{0%{transform:scale(1);opacity:.6}80%,100%{transform:scale(3);opacity:0}}
.aw-root .pwf{font-size:12.5px; font-weight:500; color:var(--text);}
.aw-root .penv{font-size:10px; padding:1px 6px; border-radius:5px; text-transform:uppercase; letter-spacing:.03em; font-weight:600;}
.aw-root .penv.acpt{background:color-mix(in srgb, ${S.warn} 20%, transparent); color:${S.warn};}
.aw-root .penv.prod{background:color-mix(in srgb, ${S.ok} 18%, transparent); color:${S.ok};}
.aw-root .psha{font-size:11.5px; color:var(--text-muted); margin-left:2px;}
.aw-root .ptime{display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--text-muted); margin-left:auto;}
.aw-root .ptime svg{color:var(--text-muted);}
.aw-root .pprog{position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--card-bg-strong); border-radius:2px; overflow:hidden;}
.aw-root .pprog i{position:absolute; left:0; top:0; bottom:0; width:62%; background:linear-gradient(90deg, ${S.running}, var(--accent-secondary));}
.aw-root .pprog i::after{content:""; position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent); animation:aw-shine 1.5s infinite;}
@keyframes aw-shine{100%{transform:translateX(140%)}}

.aw-root .preview-chips{display:flex; flex-wrap:wrap; gap:6px; padding:12px 4px 4px; border-top:1px solid var(--border); margin-top:4px;}
.aw-root .chip{display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-muted);
  background:var(--card-bg-strong); border:1px solid var(--stroke); border-radius:7px; padding:5px 9px;}
.aw-root .chip.more{color:var(--text-muted);}
.aw-root .cdot{width:6px; height:6px; border-radius:50%;}

.aw-root .trust{list-style:none; margin:auto 0 0; padding:0; display:flex; flex-direction:column; gap:11px;}
.aw-root .trust li{display:flex; align-items:center; gap:10px; font-size:12.5px; color:var(--text-muted);}
.aw-root .trust svg{color:var(--heading-accent); flex:0 0 auto;}

/* ---------- auth column ---------- */
.aw-root .authcol{display:flex; flex-direction:column; justify-content:center; align-items:center; padding:44px 40px; gap:16px;}
.aw-root .card{width:100%; max-width:400px; background:var(--card-bg); border:1px solid var(--stroke); border-radius:18px; overflow:hidden;
  box-shadow:0 10px 30px -12px var(--card-shadow); backdrop-filter:blur(22px) saturate(160%); -webkit-backdrop-filter:blur(22px) saturate(160%);}

.aw-root .tabs{position:relative; display:grid; grid-template-columns:1fr 1fr; background:var(--card-bg-strong); border-bottom:1px solid var(--border);}
.aw-root .tab{border:0; background:transparent; color:var(--text-muted); font-size:13px; font-weight:600; padding:15px 0; transition:color .15s; z-index:1;}
.aw-root .tab.on{color:var(--text);}
.aw-root .tab:hover:not(.on){color:var(--text);}
.aw-root .tab-ink{position:absolute; bottom:-1px; left:0; width:50%; height:2px; background:var(--heading-accent); transition:transform .28s cubic-bezier(.4,0,.2,1);}

.aw-root .card-body{padding:26px 26px 24px;}
.aw-root .card-body-center{display:flex; flex-direction:column; align-items:center; text-align:center; padding:38px 30px;}
.aw-root .check-glyph{width:44px; height:44px; border-radius:50%; display:grid; place-items:center; margin-bottom:16px;
  background:color-mix(in srgb, var(--heading-accent) 18%, transparent); color:var(--heading-accent);
  border:1px solid color-mix(in srgb, var(--heading-accent) 40%, transparent);}
.aw-root .card-body h2{margin:0; font-size:21px; font-weight:600; letter-spacing:-.02em; color:var(--heading-accent);}
.aw-root .lede{margin:7px 0 20px; font-size:13px; line-height:1.5; color:var(--text-muted);}

.aw-root .oauth{display:flex; flex-direction:column; gap:9px;}
.aw-root .oauth-btn{display:flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:11px;
  background:var(--card-bg-strong); border:1px solid var(--stroke); color:var(--text); font-size:13.5px; font-weight:500;
  border-radius:10px; transition:.15s;}
.aw-root .oauth-btn:hover{border-color:var(--heading-accent); background:var(--table-row-hover);}
.aw-root .oauth-g{display:grid; place-items:center; width:18px; height:18px; border-radius:50%; font-weight:700; font-size:12px;
  color:var(--card-bg); background:var(--text);}

.aw-root .divider{display:flex; align-items:center; gap:12px; margin:18px 0; color:var(--text-muted); font-size:11.5px;}
.aw-root .divider::before,.aw-root .divider::after{content:""; height:1px; flex:1; background:var(--border);}

.aw-root .form{display:flex; flex-direction:column; gap:14px;}
.aw-root .field{display:flex; flex-direction:column; gap:7px;}
.aw-root .field > span{font-size:12px; color:var(--text-muted); font-weight:500;}
.aw-root .field-top{display:flex; align-items:center; justify-content:space-between;}
.aw-root .forgot{background:none; border:0; padding:0; margin:0; font:inherit; font-size:11.5px; color:var(--heading-accent); cursor:pointer;}
.aw-root .forgot:hover{text-decoration:underline;}
.aw-root .input{display:flex; align-items:center; gap:9px; background:var(--card-bg-strong); border:1px solid var(--stroke); border-radius:10px; padding:0 12px; transition:.15s;}
.aw-root .input:focus-within{border-color:var(--heading-accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--heading-accent) 22%, transparent);}
.aw-root .input svg{color:var(--text-muted); flex:0 0 auto;}
.aw-root .input .at{color:var(--text-muted); font-size:15px; width:15px; text-align:center;}
.aw-root .input input{flex:1; min-width:0; background:transparent; border:0; outline:0; color:var(--text); font-size:14px; padding:11px 0; font-family:inherit;}
.aw-root .input input::placeholder{color:var(--text-muted);}
/* Chrome/Edge force their own light autofill background (and black text)
   on a filled username/password field, ignoring the input's own
   background/color entirely - this is the standard override: fake the
   background via an absurdly long inset box-shadow transition instead of
   fighting the autofill background directly, and pin the text color via
   -webkit-text-fill-color (color alone doesn't survive on an autofilled
   field either). Without this, this dark input rendered as a jarring
   white/light box the instant a saved credential filled it in. */
.aw-root .input input:-webkit-autofill,
.aw-root .input input:-webkit-autofill:hover,
.aw-root .input input:-webkit-autofill:focus{
  -webkit-text-fill-color:var(--text);
  -webkit-box-shadow:0 0 0 1000px var(--card-bg-strong) inset;
  box-shadow:0 0 0 1000px var(--card-bg-strong) inset;
  transition:background-color 5000s ease-in-out 0s;
}
.aw-root .peek{background:transparent; border:0; padding:4px; color:var(--text-muted); display:grid; place-items:center;}
.aw-root .peek:hover{color:var(--text);}

.aw-root .form-error{margin:0; font-size:12.5px; color:var(--viz-critical); line-height:1.4;}

.aw-root .primary{margin-top:4px; width:100%; padding:12px; background:var(--heading-accent); color:#fff; border:0; border-radius:10px;
  font-size:14px; font-weight:600; transition:.15s;}
.aw-root .primary:hover:not(:disabled){filter:brightness(1.08);}
.aw-root .primary:active:not(:disabled){transform:translateY(1px);}
.aw-root .primary:disabled{opacity:.6; cursor:default;}

.aw-root .mfa-note{display:flex; align-items:flex-start; gap:9px; background:color-mix(in srgb, var(--heading-accent) 12%, transparent);
  border:1px solid color-mix(in srgb, var(--heading-accent) 30%, transparent);
  border-radius:10px; padding:10px 12px; font-size:11.5px; line-height:1.45; color:var(--text-muted);}
.aw-root .mfa-note svg{color:var(--heading-accent); flex:0 0 auto; margin-top:1px;}

.aw-root .allowlist{margin:18px 0 0; font-size:11.5px; line-height:1.5; color:var(--text-muted); text-align:center;}
.aw-root .linklike{background:none; border:0; padding:0; color:var(--heading-accent); font-size:inherit; font-family:inherit; cursor:pointer;}
.aw-root .linklike:hover{text-decoration:underline;}
.aw-root .foot{font-size:11.5px; color:var(--text-muted);}

@media (max-width:900px){
  .aw-root .aw-split{grid-template-columns:1fr;}
  .aw-root .showcase{border-right:0; border-bottom:1px solid var(--border); padding:34px 28px; gap:24px;}
  .aw-root .pitch h1{font-size:30px;}
  .aw-root .trust{margin-top:6px;}
  .aw-root .authcol{padding:32px 22px;}
}
@media (max-width:560px){
  .aw-root .preview{display:none;}
}
@media (prefers-reduced-motion:reduce){
  .aw-root .live-dot,.aw-root .pping,.aw-root .pprog i::after,.aw-root .tab-ink{animation:none !important; transition:none !important;}
}
`;

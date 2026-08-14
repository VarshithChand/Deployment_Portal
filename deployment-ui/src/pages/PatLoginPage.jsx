import { useEffect, useState } from "react";

import { patLogin } from "../services/authLoginService";
import Logo from "../components/common/Logo";
import useTheme from "../hooks/useTheme";
import useToast from "../hooks/useToast";
import { SunIcon, MoonIcon } from "../components/layout/SidebarIcons";

// A key glyph, not a padlock - this field holds a token, not a password;
// same stroke weight/line-cap style as Logo's own mark and Sidebar's
// SunIcon/MoonIcon, so it reads as part of the same icon set rather than
// a mismatched import.
function KeyIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <circle cx="6" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
            <line x1="9" y1="9" x2="15.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12.5" y1="9" x2="12.5" y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="15" y1="9" x2="15" y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

// Page 1 of the two-page login flow — the ONLY thing a not-yet-connected
// visitor sees (see App.jsx's top-level gate; TopBar/Sidebar never mount
// alongside this). Deliberately just one field: no username/email/
// password, since the backend resolves the GitHub identity from the
// token itself (see AuthController.PatLogin). The token never touches
// localStorage/sessionStorage/the URL — it lives only in this component's
// state for the moment it takes to submit.
export default function PatLoginPage({ wasSignedOut, onMfaRequired }) {

    const { theme, toggleTheme } = useTheme();
    const toast = useToast();

    const [token, setToken] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    // A real, one-time toast (auto-dismisses, doesn't sit fixed over the
    // card) rather than a permanent banner - the previous version was a
    // position:fixed div bottom-center on the page, which on a short
    // viewport landed right on top of the Continue button below, blocking
    // it visually and for clicks. Same "why am I back here" explanation,
    // just via this app's normal toast system instead of inventing a
    // second one.
    useEffect(() => {

        if (wasSignedOut) {
            toast.show("Your session was signed out by the portal admin. Reconnect a token below to continue.");
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wasSignedOut]);

    async function handleSubmit(e) {

        e.preventDefault();

        if (!token.trim()) {
            setError("A Personal Access Token is required to continue.");
            return;
        }

        setSubmitting(true);
        setError("");

        try {

            const result = await patLogin(token.trim());

            if (!result.success) {
                setError(result.message || "Unable to authenticate with this GitHub token.");
                setSubmitting(false);
                return;
            }

            if (result.mfaRequired) {
                onMfaRequired();
                return;
            }

            // Real credential now saved server-side — reload so bootstrap
            // picks it up and the normal app shell takes over.
            window.location.reload();

        }
        catch {

            setError("Unable to authenticate with this GitHub token.");
            setSubmitting(false);

        }

    }

    return (

        <div className="auth-page">

            <div className="auth-page-card" role="main" aria-labelledby="pat-login-title">

                <button
                    type="button"
                    className="auth-theme-toggle"
                    onClick={toggleTheme}
                    title={theme === "dark" ? "Light mode" : "Dark mode"}
                    aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                    {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                </button>

                <div className="auth-page-logo">
                    <Logo showEyebrow={false} compact size={34} />
                </div>

                <h1 id="pat-login-title" className="setup-gate-title">
                    Welcome back
                </h1>

                <p className="field-hint" style={{ textAlign: "center" }}>
                    Sign in with your GitHub Personal Access Token to continue.
                </p>

                <form onSubmit={handleSubmit} className="setup-gate-form">

                    <div className="form-group">
                        <label htmlFor="pat-login-token">Personal Access Token</label>
                        <div className="auth-page-field">
                            <KeyIcon />
                            <input
                                id="pat-login-token"
                                type="password"
                                placeholder="ghp_..."
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                autoComplete="new-password"
                                autoFocus
                            />
                        </div>
                        <a
                            href="https://github.com/settings/tokens"
                            target="_blank"
                            rel="noreferrer"
                            className="token-help-link"
                        >
                            Generate a token on GitHub &rarr;
                        </a>
                    </div>

                    {error && (
                        <p className="field-hint field-hint-bad" role="alert">{error}</p>
                    )}

                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                        {submitting ? "Signing in..." : "Continue"}
                    </button>

                </form>

            </div>

        </div>

    );

}

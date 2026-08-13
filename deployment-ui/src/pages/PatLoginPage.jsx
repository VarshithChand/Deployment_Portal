import { useState } from "react";

import { patLogin } from "../services/authLoginService";
import Logo from "../components/common/Logo";

// Page 1 of the two-page login flow — the ONLY thing a not-yet-connected
// visitor sees (see App.jsx's top-level gate; TopBar/Sidebar never mount
// alongside this). Deliberately just one field: no username/email/
// password, since the backend resolves the GitHub identity from the
// token itself (see AuthController.PatLogin). The token never touches
// localStorage/sessionStorage/the URL — it lives only in this component's
// state for the moment it takes to submit.
export default function PatLoginPage({ wasSignedOut, onMfaRequired }) {

    const [token, setToken] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

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

                <Logo showEyebrow={false} size={40} />

                <h1 id="pat-login-title" className="setup-gate-title">
                    Welcome back
                </h1>

                <p className="field-hint" style={{ textAlign: "center" }}>
                    Sign in with your GitHub Personal Access Token to continue.
                </p>

                {wasSignedOut && (
                    <div className="signed-out-banner">
                        Your session was signed out by the portal admin. Reconnect a token below to
                        continue.
                    </div>
                )}

                <form onSubmit={handleSubmit} className="setup-gate-form">

                    <div className="form-group">
                        <label htmlFor="pat-login-token">Personal Access Token</label>
                        <input
                            id="pat-login-token"
                            type="password"
                            className="form-control"
                            placeholder="ghp_..."
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            autoComplete="new-password"
                            autoFocus
                        />
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

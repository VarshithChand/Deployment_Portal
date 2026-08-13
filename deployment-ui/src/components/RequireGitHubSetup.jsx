import { useState } from "react";

import {
    saveMyGitHubSettings,
    getMyGitHubUsername,
    previewGitHubToken
} from "../services/settingsService";
import useAuth from "../hooks/useAuth";
import useToast from "../hooks/useToast";
import Logo from "./common/Logo";

// Blocks every other page behind a one-time "connect your token" flow.
// Every portal visitor brings their own GitHub token now (see
// SettingsController's api/settings/me/github) instead of the whole portal
// sharing one — this is where anyone who hasn't set theirs up yet is asked
// for it, before they can reach anything else.
//
// One step (two if MFA is enabled for the token's owner): paste a token,
// it's validated (via /me/github/preview - nothing saved yet at that
// point) and saved with no repository chosen. Picking which repo to point
// at happens afterward, from the Dashboard's own searchable picker
// (AllRepositoriesCard) - this dialog used to also make you pick one here
// first, but that's a decision worth making from the Dashboard itself, not
// a blocking prerequisite to ever reaching it.
//
// Not gated on GitHub OAuth login: api/settings/me/github works for anyone,
// logged in or not — PortalIdentity resolves an isolated anonymous session
// for whoever hasn't logged in, so this pops up for literally every first
// visit, no OAuth App setup required to get past it.
//
// MFA: whether the code-entry step appears is decided by preview's own
// mfaRequired flag (a heads-up, not the real gate) - the actual
// enforcement happens backend-side, on the SAME saveMyGitHubSettings call
// this already makes (see MfaGate/SettingsController.SaveMyGitHub). A
// wrong/expired code never saves anything - this session is left exactly
// where it started, same as if nothing had been submitted at all.
const MAX_MFA_ATTEMPTS = 5;

export default function RequireGitHubSetup({ children }) {

    const toast = useToast();

    // Both come straight off the same bootstrap fetch AuthContext already
    // makes on mount - this component used to run its own separate
    // GET /api/settings/me/github to answer the exact same question.
    // checking stays true until that fetch resolves either way; configured
    // fails OPEN on a genuine fetch failure (bootstrapError) rather than on
    // "still checking", so a transient network blip can't lock someone out
    // of the whole app - same behavior the old local try/catch implemented.
    // Gated on the TOKEN alone (not githubRepoConfigured, which also
    // requires a repo) - that's what this dialog exists to collect; which
    // repo to point at is the Dashboard picker's job now.
    const { oauthStatusChecked, bootstrapError, githubTokenConfigured, githubWasSignedOut } = useAuth();

    const checking = !oauthStatusChecked;
    const configured = bootstrapError || githubTokenConfigured;
    const wasSignedOut = githubWasSignedOut;

    // "token" -> "mfa" (only when preview reports it's required) -> "connected"
    const [step, setStep] = useState("token");

    const [token, setToken] = useState("");
    const [previewing, setPreviewing] = useState(false);
    const [previewError, setPreviewError] = useState("");

    const [connecting, setConnecting] = useState(false);
    const [connectedAs, setConnectedAs] = useState(null);

    const [pendingUsername, setPendingUsername] = useState(null);
    const [mfaCode, setMfaCode] = useState("");
    const [mfaError, setMfaError] = useState("");
    const [mfaAttempts, setMfaAttempts] = useState(0);
    const [useMfaRecovery, setUseMfaRecovery] = useState(false);

    // Always rethrows on failure - callers (handleConnect for the no-MFA
    // case, handleMfaSubmit for the MFA case) each need to react
    // differently to an error here (a toast vs. inline MFA-specific
    // messaging), so this doesn't guess which on their behalf.
    async function connectWithToken(usernameHint, mfaFields = {}) {

        setConnecting(true);

        try {

            await saveMyGitHubSettings({
                owner: "",
                repository: "",
                personalAccessToken: token.trim(),
                ...mfaFields
            });

            // Separate request from the save above on purpose — see
            // getMyGitHubUsername's own note on why this can't just reuse
            // the username the preview step already resolved (belt-and-
            // suspenders here since we already know it, but confirms what
            // actually saved).
            const resolvedUsername = await getMyGitHubUsername();

            toast.show("GitHub token connected.", "success");
            setConnectedAs({ username: resolvedUsername || usernameHint });
            setStep("connected");

            setTimeout(() => window.location.reload(), 1600);

        }
        finally {

            setConnecting(false);

        }

    }

    async function handleConnect(e) {

        e.preventDefault();

        if (!token.trim()) {
            toast.show("A Personal Access Token is required to continue.", "error");
            return;
        }

        setPreviewing(true);
        setPreviewError("");

        try {

            // Still previewed first (nothing saved yet at this point) so a
            // bad/expired token gets a clear "GitHub rejected it" message
            // instead of failing on the save with a less specific one.
            const result = await previewGitHubToken(token.trim());

            if (!result.success) {
                setPreviewError(result.error || "That token was rejected by GitHub.");
                return;
            }

            if (result.mfaRequired) {
                setPendingUsername(result.username);
                setMfaCode("");
                setMfaError("");
                setMfaAttempts(0);
                setUseMfaRecovery(false);
                setStep("mfa");
                return;
            }

            await connectWithToken(result.username);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to check that token.", "error");

        }
        finally {

            setPreviewing(false);

        }

    }

    async function handleMfaSubmit(e) {

        e.preventDefault();

        try {

            await connectWithToken(
                pendingUsername,
                useMfaRecovery ? { recoveryCode: mfaCode } : { mfaCode }
            );

        }
        catch (err) {

            console.error(err);
            setMfaCode("");

            // MFA_LOCKED - the server's own rate limit, not this
            // component's local counter, is what actually stopped this;
            // deferring to it the same way PinLockScreen defers to the
            // screen-lock PIN's own server-side `locked` flag rather than
            // only trusting its own client-side count.
            if (err.response?.data?.code === "MFA_LOCKED") {
                setMfaError(err.response?.data?.message || "Too many wrong codes — try again in a few minutes.");
                return;
            }

            const nextAttempts = mfaAttempts + 1;
            setMfaAttempts(nextAttempts);

            if (nextAttempts >= MAX_MFA_ATTEMPTS) {
                setMfaError("Too many wrong codes — enter your token again to retry.");
                setTimeout(() => setStep("token"), 1800);
                return;
            }

            setMfaError(err.response?.data?.message || "Invalid verification code.");

        }

    }

    // children mount immediately, unconditionally - never gated behind
    // `checking`. Blocking the whole app shell on the bootstrap round trip
    // (as this used to do, swapping in a full-page spinner) was the single
    // biggest LCP cost in the app: the Dashboard heading/cards couldn't
    // paint at all until that request resolved, even though none of them
    // actually needed the answer to render their own shell - each already
    // gates its OWN data fetch on githubTokenConfigured/githubRepoConfigured/
    // oauthStatusChecked independently (see useGithubResources,
    // AllRepositoriesCard, AwsServicesCard), so nothing fires prematurely
    // either way. The setup dialog is the only thing that genuinely has to
    // wait for the real answer - it renders as an overlay on top of the
    // already-visible app shell once bootstrap resolves and confirms
    // nothing is configured.
    return (

        <>

            {children}

            {!checking && !configured && wasSignedOut && (

                <div className="signed-out-banner">
                    Your session was signed out by the portal admin. Reconnect a token above to
                    continue.
                </div>

            )}

            {!checking && !configured && (

                <div className="dialog-backdrop">

                    <div
                        className="dialog setup-gate-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="github-setup-title"
                    >

                        <div style={{ alignSelf: "center" }}>
                            <Logo showEyebrow={false} size={40} />
                        </div>

                        {step === "connected" && connectedAs && (

                            <>

                            <h1 id="github-setup-title" className="setup-gate-title">
                                Connected
                            </h1>

                            <p className="field-hint" style={{ textAlign: "center" }}>
                                {connectedAs.username ? (
                                    <>Signed in as <strong>@{connectedAs.username}</strong>.{" "}</>
                                ) : (
                                    <>Token connected.{" "}</>
                                )}
                                Pick a repository from the Dashboard whenever you're ready.
                                Loading the portal...
                            </p>

                            </>

                        )}

                        {step === "token" && (

                            <>

                            <h1 id="github-setup-title" className="setup-gate-title">
                                Connect your GitHub account
                            </h1>

                            <p className="field-hint" style={{ textAlign: "center" }}>
                                Every user of this portal points at their own repo with their own token —
                                this is saved to your account only. Paste a token below; you'll pick a
                                repository from the Dashboard afterward.
                            </p>

                            <form onSubmit={handleConnect} className="setup-gate-form">

                                <div className="form-group">
                                    <label>Personal Access Token</label>
                                    <input
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

                                {previewError && (
                                    <p className="field-hint field-hint-bad">{previewError}</p>
                                )}

                                <button type="submit" className="btn btn-primary" disabled={previewing || connecting}>
                                    {previewing || connecting ? "Connecting..." : "Connect"}
                                </button>

                            </form>

                            </>

                        )}

                        {step === "mfa" && (

                            <>

                            <h1 id="github-setup-title" className="setup-gate-title">
                                Multi-Factor Authentication
                            </h1>

                            <p className="field-hint" style={{ textAlign: "center" }}>
                                {pendingUsername ? <>@{pendingUsername} has</> : "This account has"} MFA enabled.
                                Enter the {useMfaRecovery ? "recovery code" : "6-digit code from your authenticator app"} to continue.
                            </p>

                            <form onSubmit={handleMfaSubmit} className="setup-gate-form">

                                <div className="form-group">
                                    <label>{useMfaRecovery ? "Recovery code" : "6-digit code"}</label>
                                    <input
                                        type="text"
                                        inputMode={useMfaRecovery ? "text" : "numeric"}
                                        maxLength={useMfaRecovery ? 9 : 6}
                                        className="form-control"
                                        placeholder={useMfaRecovery ? "8H7K-XP2Q" : "123456"}
                                        value={mfaCode}
                                        onChange={(e) => setMfaCode(useMfaRecovery ? e.target.value : e.target.value.replace(/\D/g, ""))}
                                        autoComplete="off"
                                        autoFocus
                                    />
                                </div>

                                {mfaError && (
                                    <p className="field-hint field-hint-bad">{mfaError}</p>
                                )}

                                <button type="submit" className="btn btn-primary" disabled={connecting || !mfaCode}>
                                    {connecting ? "Verifying..." : "Verify & Continue"}
                                </button>

                            </form>

                            <div>
                                <button
                                    type="button"
                                    className="token-help-link"
                                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                                    onClick={() => { setUseMfaRecovery((v) => !v); setMfaCode(""); setMfaError(""); }}
                                >
                                    {useMfaRecovery ? "Use an authenticator code instead" : "Use a recovery code instead"}
                                </button>
                            </div>

                            <div>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => { setStep("token"); setMfaCode(""); setMfaError(""); }}
                                    disabled={connecting}
                                >
                                    ← Back
                                </button>
                            </div>

                            </>

                        )}

                    </div>

                </div>

            )}

        </>

    );

}

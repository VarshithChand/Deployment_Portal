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
// One step: paste a token, it's validated (via /me/github/preview - nothing
// saved yet at that point) and saved with no repository chosen. Picking
// which repo to point at happens afterward, from the Dashboard's own
// searchable picker (AllRepositoriesCard) - this dialog used to also make
// you pick one here first, but that's a decision worth making from the
// Dashboard itself, not a blocking prerequisite to ever reaching it.
//
// Not gated on GitHub OAuth login: api/settings/me/github works for anyone,
// logged in or not — PortalIdentity resolves an isolated anonymous session
// for whoever hasn't logged in, so this pops up for literally every first
// visit, no OAuth App setup required to get past it.
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

    // "token" -> "connected"
    const [step, setStep] = useState("token");

    const [token, setToken] = useState("");
    const [previewing, setPreviewing] = useState(false);
    const [previewError, setPreviewError] = useState("");

    const [connecting, setConnecting] = useState(false);
    const [connectedAs, setConnectedAs] = useState(null);

    async function connectWithToken(username) {

        setConnecting(true);

        try {

            await saveMyGitHubSettings({
                owner: "",
                repository: "",
                personalAccessToken: token.trim()
            });

            // Separate request from the save above on purpose — see
            // getMyGitHubUsername's own note on why this can't just reuse
            // the username the preview step already resolved (belt-and-
            // suspenders here since we already know it, but confirms what
            // actually saved).
            const resolvedUsername = await getMyGitHubUsername();

            toast.show("GitHub token connected.", "success");
            setConnectedAs({ username: resolvedUsername || username });
            setStep("connected");

            setTimeout(() => window.location.reload(), 1600);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save GitHub settings.", "error");
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

                    </div>

                </div>

            )}

        </>

    );

}

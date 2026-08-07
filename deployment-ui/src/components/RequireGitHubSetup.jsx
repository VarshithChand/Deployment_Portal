import { useEffect, useState } from "react";

import { getMyGitHubSettings, saveMyGitHubSettings, getMyGitHubUsername } from "../services/settingsService";
import parseRepoUrl from "../utils/parseRepoUrl";
import useToast from "../hooks/useToast";
import ClearableInput from "./common/ClearableInput";
import Logo from "./common/Logo";
import LoadingSpinner from "./LoadingSpinner";

// Blocks every other page behind a one-time "point this at your repo" form.
// Every portal visitor brings their own GitHub repo + token now (see
// SettingsController's api/settings/me/github) instead of the whole portal
// sharing one — this is where anyone who hasn't set theirs up yet is asked
// for it, before they can reach anything else.
//
// Not gated on GitHub OAuth login: api/settings/me/github works for anyone,
// logged in or not — PortalIdentity resolves an isolated anonymous session
// for whoever hasn't logged in, so this pops up for literally every first
// visit, no OAuth App setup required to get past it.
export default function RequireGitHubSetup({ children }) {

    const toast = useToast();

    const [checking, setChecking] = useState(true);
    const [configured, setConfigured] = useState(true);

    const [repoUrl, setRepoUrl] = useState("");
    const [token, setToken] = useState("");
    const [saving, setSaving] = useState(false);

    // Set once the token's saved and its owner looked up — shown in place
    // of the form for a beat before the reload, so "Continue" doesn't just
    // silently vanish into a page refresh with no confirmation of whose
    // account actually got connected.
    const [connectedAs, setConnectedAs] = useState(null);

    useEffect(() => {

        let cancelled = false;

        getMyGitHubSettings()
            .then((settings) => {
                if (!cancelled) setConfigured(!!settings.isConfigured);
            })
            .catch((err) => {
                console.error(err);
                if (!cancelled) setConfigured(true); // fail open — don't lock someone out over a network blip
            })
            .finally(() => {
                if (!cancelled) setChecking(false);
            });

        return () => {
            cancelled = true;
        };

    }, []);

    async function handleSave(e) {

        e.preventDefault();

        const parsed = parseRepoUrl(repoUrl);

        if (!parsed) {
            toast.show("Enter a valid GitHub repository URL, e.g. https://github.com/owner/repo", "error");
            return;
        }

        if (!token.trim()) {
            toast.show("A Personal Access Token is required to continue.", "error");
            return;
        }

        try {

            setSaving(true);

            await saveMyGitHubSettings({
                owner: parsed.owner,
                repository: parsed.repository,
                personalAccessToken: token
            });

            // A separate request from the save above — GitHubAuthService
            // loads credentials once per request, so this has to ask again
            // to see what was just saved rather than reusing the save's
            // own response.
            const username = await getMyGitHubUsername();

            toast.show(`Connected to ${parsed.owner}/${parsed.repository}.`, "success");
            setConnectedAs({ username, owner: parsed.owner, repository: parsed.repository });

            // Full reload, not just dismissing the popup — Dashboard and
            // every other page already mounted and fetched (and failed,
            // with no repo configured yet) the moment this popup appeared
            // behind it, and none of them know to refetch on their own just
            // because this component's local state changes. Same reasoning
            // as Settings.jsx's own save button. Held a beat longer than
            // before so there's time to actually read who/what connected.
            setTimeout(() => window.location.reload(), 1600);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save GitHub settings.", "error");
            setSaving(false);

        }

    }

    // Renders behind the popup rather than being replaced by it — the app
    // shell mounts normally (so there's no jarring swap once the form is
    // done), the modal on top is what actually blocks interacting with it.
    return (

        <>

            {checking ? <LoadingSpinner /> : children}

            {!checking && !configured && (

                <div className="dialog-backdrop">

                    <div
                        className="dialog setup-gate-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="github-setup-title"
                    >

                        <Logo showEyebrow={false} size={40} />

                        {connectedAs ? (

                            <>

                            <h1 id="github-setup-title" className="setup-gate-title">
                                Connected
                            </h1>

                            <p className="field-hint" style={{ textAlign: "center" }}>
                                {connectedAs.username ? (
                                    <>Signed in as <strong>@{connectedAs.username}</strong>, connected to{" "}</>
                                ) : (
                                    <>Connected to{" "}</>
                                )}
                                <strong>{connectedAs.owner}/{connectedAs.repository}</strong>.
                                Loading the portal...
                            </p>

                            </>

                        ) : (

                        <>

                        <h1 id="github-setup-title" className="setup-gate-title">
                            Connect your GitHub repository
                        </h1>

                        <p className="field-hint" style={{ textAlign: "center" }}>
                            Every user of this portal points at their own repo with their own token —
                            this is saved to your account only, and is required before you can use
                            anything else here.
                        </p>

                        <form onSubmit={handleSave} className="setup-gate-form">

                            <div className="form-group">
                                <label>Repository URL</label>
                                <ClearableInput
                                    placeholder="https://github.com/owner/repo"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    onClear={() => setRepoUrl("")}
                                    autoComplete="off"
                                    name="repository-url"
                                    autoFocus
                                />
                                {repoUrl.trim() && !parseRepoUrl(repoUrl) && (
                                    <p className="field-hint field-hint-bad">
                                        Doesn't look like a GitHub repository URL yet — expecting something like
                                        https://github.com/owner/repo
                                    </p>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Personal Access Token</label>
                                <input
                                    type="password"
                                    className="form-control"
                                    placeholder="ghp_..."
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    autoComplete="new-password"
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

                            <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? "Connecting..." : "Continue"}
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

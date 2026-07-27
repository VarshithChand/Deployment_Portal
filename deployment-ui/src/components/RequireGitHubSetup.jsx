import { useEffect, useState } from "react";

import { getMyGitHubSettings, saveMyGitHubSettings } from "../services/settingsService";
import parseRepoUrl from "../utils/parseRepoUrl";
import useAuth from "../hooks/useAuth";
import useToast from "../hooks/useToast";
import ClearableInput from "./common/ClearableInput";
import Logo from "./common/Logo";
import LoadingSpinner from "./LoadingSpinner";

// Blocks every other page behind a one-time "point this at your repo" form.
// Every portal user brings their own GitHub repo + token now (see
// SettingsController's api/settings/me/github) instead of the whole portal
// sharing one — this is where a user who hasn't set theirs up yet is asked
// for it, before they can reach anything else.
//
// Only applies once someone is actually logged in: an anonymous "Public
// view" visitor has no account to attach credentials to, so they pass
// straight through to whatever anonymous browsing the rest of the app
// still allows (e.g. the Public Repository Lookup card).
export default function RequireGitHubSetup({ children }) {

    const { user, loading: authLoading } = useAuth();
    const toast = useToast();

    const [checking, setChecking] = useState(true);
    const [configured, setConfigured] = useState(true);

    const [repoUrl, setRepoUrl] = useState("");
    const [token, setToken] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {

        if (authLoading) return;

        if (!user) {
            setChecking(false);
            return;
        }

        let cancelled = false;
        setChecking(true);

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

    }, [user, authLoading]);

    if (authLoading || checking) {
        return <LoadingSpinner />;
    }

    if (!user || configured) {
        return children;
    }

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

            toast.show(`Connected to ${parsed.owner}/${parsed.repository}.`, "success");
            setConfigured(true);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save GitHub settings.", "error");

        }
        finally {

            setSaving(false);

        }

    }

    return (

        <div className="setup-gate">

            <div className="setup-gate-card">

                <Logo showEyebrow={false} size={40} />

                <h1 className="setup-gate-title">Connect your GitHub repository</h1>

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

            </div>

        </div>

    );

}

import { useEffect, useState } from "react";

import {
    getMyGitHubSettings,
    saveMyGitHubSettings,
    getMyGitHubUsername,
    previewGitHubToken
} from "../services/settingsService";
import parseRepoUrl from "../utils/parseRepoUrl";
import useToast from "../hooks/useToast";
import usePagination from "../hooks/usePagination";
import ClearableInput from "./common/ClearableInput";
import SearchBox from "./common/SearchBox";
import Logo from "./common/Logo";
import LoadingSpinner from "./LoadingSpinner";

const PAGE_SIZE = 9;

// A plain rounded rectangle with a spine down the left edge — same "repo"
// glyph SwitchRepositoryModal uses, duplicated rather than shared since
// both are a few lines and this is the only other place that needs it.
function RepoIcon() {

    return (

        <svg className="repo-picker-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>

    );

}

// Blocks every other page behind a one-time "point this at your repo" flow.
// Every portal visitor brings their own GitHub repo + token now (see
// SettingsController's api/settings/me/github) instead of the whole portal
// sharing one — this is where anyone who hasn't set theirs up yet is asked
// for it, before they can reach anything else.
//
// Two steps: paste a token, then pick a repo from whatever that token can
// actually see (via /me/github/preview — nothing's saved yet at that
// point) instead of needing to already know and correctly type an exact
// repository URL. A manual URL entry is still there as a fallback for a
// repo the preview's affiliation filter doesn't surface.
//
// Not gated on GitHub OAuth login: api/settings/me/github works for anyone,
// logged in or not — PortalIdentity resolves an isolated anonymous session
// for whoever hasn't logged in, so this pops up for literally every first
// visit, no OAuth App setup required to get past it.
export default function RequireGitHubSetup({ children }) {

    const toast = useToast();

    const [checking, setChecking] = useState(true);
    const [configured, setConfigured] = useState(true);

    // True when this popup is showing because an admin used the Services
    // page's Sign Out button (see SettingsService.SoftSignOutPatUserAsync),
    // not because nothing was ever configured - lets the "token" step show
    // a specific explanation instead of the generic first-visit copy.
    const [wasSignedOut, setWasSignedOut] = useState(false);

    // "token" -> "pick-repo" -> "connected"
    const [step, setStep] = useState("token");

    const [token, setToken] = useState("");
    const [previewing, setPreviewing] = useState(false);
    const [previewError, setPreviewError] = useState("");

    const [tokenOwner, setTokenOwner] = useState(null);
    const [repos, setRepos] = useState([]);
    const [search, setSearch] = useState("");

    const [manualUrl, setManualUrl] = useState("");
    const [showManualUrl, setShowManualUrl] = useState(false);

    const [connecting, setConnecting] = useState(false);
    const [connectedAs, setConnectedAs] = useState(null);

    useEffect(() => {

        let cancelled = false;

        getMyGitHubSettings()
            .then((settings) => {

                if (cancelled) return;

                setConfigured(!!settings.isConfigured);
                setWasSignedOut(!!settings.wasSignedOut);

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

    async function handlePreviewToken(e) {

        e.preventDefault();

        if (!token.trim()) {
            toast.show("A Personal Access Token is required to continue.", "error");
            return;
        }

        setPreviewing(true);
        setPreviewError("");

        try {

            const result = await previewGitHubToken(token.trim());

            if (!result.success) {
                setPreviewError(result.error || "That token was rejected by GitHub.");
                return;
            }

            setTokenOwner({ username: result.username, avatarUrl: result.avatarUrl });
            setRepos(result.repositories || []);
            setStep("pick-repo");

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to check that token.", "error");

        }
        finally {

            setPreviewing(false);

        }

    }

    async function connectTo(owner, repository) {

        setConnecting(true);

        try {

            await saveMyGitHubSettings({
                owner,
                repository,
                personalAccessToken: token.trim()
            });

            // Separate request from the save above on purpose — see
            // getMyGitHubUsername's own note on why this can't just reuse
            // tokenOwner from the preview step (belt-and-suspenders here
            // since we already know it, but confirms what actually saved).
            const username = await getMyGitHubUsername();

            toast.show(`Connected to ${owner}/${repository}.`, "success");
            setConnectedAs({ username: username || tokenOwner?.username, owner, repository });
            setStep("connected");

            setTimeout(() => window.location.reload(), 1600);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save GitHub settings.", "error");
            setConnecting(false);

        }

    }

    function handleManualConnect(e) {

        e.preventDefault();

        const parsed = parseRepoUrl(manualUrl);

        if (!parsed) {
            toast.show("Enter a valid GitHub repository URL, e.g. https://github.com/owner/repo", "error");
            return;
        }

        connectTo(parsed.owner, parsed.repository);

    }

    const filteredRepos = repos.filter((repo) =>
        repo.fullName.toLowerCase().includes(search.toLowerCase())
    );

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(filteredRepos, PAGE_SIZE);

    // Renders behind the popup rather than being replaced by it — the app
    // shell mounts normally (so there's no jarring swap once the flow is
    // done), the modal on top is what actually blocks interacting with it.
    return (

        <>

            {checking ? <LoadingSpinner /> : children}

            {!checking && !configured && wasSignedOut && (

                <div className="signed-out-banner">
                    Your session was signed out by the portal admin. Reconnect a token above to
                    continue.
                </div>

            )}

            {!checking && !configured && (

                <div className="dialog-backdrop">

                    <div
                        className={`dialog setup-gate-dialog ${step === "pick-repo" ? "dialog-wide" : ""}`}
                        style={step === "pick-repo" ? { alignItems: "stretch" } : undefined}
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
                                    <>Signed in as <strong>@{connectedAs.username}</strong>, connected to{" "}</>
                                ) : (
                                    <>Connected to{" "}</>
                                )}
                                <strong>{connectedAs.owner}/{connectedAs.repository}</strong>.
                                Loading the portal...
                            </p>

                            </>

                        )}

                        {step === "token" && (

                            <>

                            <h1 id="github-setup-title" className="setup-gate-title">
                                Connect your GitHub repository
                            </h1>

                            <p className="field-hint" style={{ textAlign: "center" }}>
                                Every user of this portal points at their own repo with their own token —
                                this is saved to your account only. Paste a token below and pick from
                                whatever repos it can see.
                            </p>

                            <form onSubmit={handlePreviewToken} className="setup-gate-form">

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

                                <button type="submit" className="btn btn-primary" disabled={previewing}>
                                    {previewing ? "Checking..." : "Continue"}
                                </button>

                            </form>

                            </>

                        )}

                        {step === "pick-repo" && (

                            <>

                            <div className="repo-picker-header">

                                <div>
                                    <h1 id="github-setup-title" className="setup-gate-title" style={{ textAlign: "left" }}>
                                        {tokenOwner?.username ? `Hi, @${tokenOwner.username} — pick a repository` : "Pick a repository"}
                                    </h1>
                                    <p className="field-hint">
                                        Every repo this token can see. Not seeing the one you want?{" "}
                                        <button
                                            type="button"
                                            className="token-help-link"
                                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                                            onClick={() => setShowManualUrl((v) => !v)}
                                        >
                                            Enter a URL directly
                                        </button>
                                    </p>
                                </div>

                                {repos.length > 0 && (
                                    <span className="repo-picker-count">
                                        {totalCount} {totalCount === 1 ? "repository" : "repositories"}
                                    </span>
                                )}

                            </div>

                            {showManualUrl && (

                                <form onSubmit={handleManualConnect} className="setup-gate-form" style={{ marginBottom: "16px" }}>

                                    <div className="form-group">
                                        <ClearableInput
                                            placeholder="https://github.com/owner/repo"
                                            value={manualUrl}
                                            onChange={(e) => setManualUrl(e.target.value)}
                                            onClear={() => setManualUrl("")}
                                            autoComplete="off"
                                            autoFocus
                                        />
                                    </div>

                                    <button type="submit" className="btn btn-primary" disabled={connecting}>
                                        {connecting ? "Connecting..." : "Use this URL"}
                                    </button>

                                </form>

                            )}

                            <SearchBox
                                placeholder="Search repositories..."
                                value={search}
                                onChange={setSearch}
                            />

                            <div className="repo-picker-grid">

                                {repos.length === 0 && (
                                    <p className="empty-state">
                                        That token can't see any repositories — check its scopes on GitHub,
                                        or enter a repository URL directly above.
                                    </p>
                                )}

                                {repos.length > 0 && filteredRepos.length === 0 && (
                                    <p className="empty-state">No repositories match "{search}".</p>
                                )}

                                {pageItems.map((repo) => (

                                    <button
                                        type="button"
                                        key={repo.fullName}
                                        className="repo-picker-card"
                                        disabled={connecting}
                                        onClick={() => connectTo(repo.owner, repo.name)}
                                    >

                                        <div className="repo-picker-title">
                                            <RepoIcon />
                                            <span className="repo-picker-name">
                                                <span className="repo-picker-owner">{repo.owner}/</span>
                                                {repo.name}
                                            </span>
                                        </div>

                                        <div className="repo-picker-meta">
                                            <span className={`badge ${repo.private ? "badge-secondary" : "badge-info"}`}>
                                                {repo.private ? "Private" : "Public"}
                                            </span>
                                        </div>

                                    </button>

                                ))}

                            </div>

                            {filteredRepos.length > PAGE_SIZE && (

                                <div className="button-row" style={{ justifyContent: "center", margin: "8px 0" }}>

                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        disabled={page <= 1}
                                        onClick={() => setPage(page - 1)}
                                    >
                                        ← Prev
                                    </button>

                                    <span className="field-hint">
                                        {startIndex}–{endIndex} of {totalCount}
                                    </span>

                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        disabled={page >= pageCount}
                                        onClick={() => setPage(page + 1)}
                                    >
                                        Next →
                                    </button>

                                </div>

                            )}

                            <div>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => { setStep("token"); setPreviewError(""); }}
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

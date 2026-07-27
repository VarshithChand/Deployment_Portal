import { useCallback, useEffect, useState } from "react";

import {
    getSettings,
    getMyGitHubSettings,
    saveMyGitHubSettings,
    clearMyGitHubToken,
    saveDockerSettings,
    saveGitHubOAuthSettings,
    saveAdminUsernames,
    clearSettings,
    previewGitHubRepository
} from "../services/settingsService";
import { getAccountRepositories } from "../services/githubService";
import { getLogs } from "../services/logsService";

import LoadingSpinner from "../components/LoadingSpinner";
import PageLayout from "../components/layout/PageLayout";
import AccessLevels from "../components/settings/AccessLevels";
import BranchManager from "../components/settings/BranchManager";
import ComboBox from "../components/common/ComboBox";
import ClearableInput from "../components/common/ClearableInput";
import Pagination from "../components/common/Pagination";
import useToast from "../hooks/useToast";
import useConfirm from "../hooks/useConfirm";
import useAuth from "../hooks/useAuth";
import useNavigation from "../hooks/useNavigation";
import usePagination from "../hooks/usePagination";
import parseRepoUrl from "../utils/parseRepoUrl";

const VIEWS = ["hub", "credentials", "activity-log", "access-levels", "branches"];

// Mirrors the same "?tab=" pattern NavigationContext uses for the top-level
// tab, one level down — so reloading (or bookmarking) a Settings sub-page
// like Activity Log lands back on that sub-page instead of bouncing to hub.
function readViewFromUrl() {

    const requested = new URLSearchParams(window.location.search).get("view");

    return VIEWS.includes(requested) ? requested : "hub";

}

export default function Settings() {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();
    const { refreshOauthStatus } = useAuth();
    const { pendingRepoUrl, setPendingRepoUrl } = useNavigation();

    // "hub" is the Settings landing page — a couple of option tiles rather
    // than one long scroll of every card at once. Picking one switches to
    // that section in place, and is kept in sync with "?view=" in the URL
    // (see readViewFromUrl/setView below) so it survives a reload.
    const [view, setViewState] = useState(readViewFromUrl);

    const setView = useCallback((nextView) => {

        setViewState(nextView);

        const url = new URL(window.location.href);

        if (nextView === "hub") {
            url.searchParams.delete("view");
        } else {
            url.searchParams.set("view", nextView);
        }

        window.history.replaceState(null, "", url);

    }, []);

    const [loading, setLoading] = useState(true);

    const [savingGitHub, setSavingGitHub] = useState(false);
    const [savingDocker, setSavingDocker] = useState(false);
    const [savingOAuth, setSavingOAuth] = useState(false);
    const [savingAdmins, setSavingAdmins] = useState(false);
    const [clearingAll, setClearingAll] = useState(false);

    const [githubRepoUrl, setGithubRepoUrl] = useState("");
    const [githubToken, setGithubToken] = useState("");
    const [githubTokenConfigured, setGithubTokenConfigured] = useState(false);

    const [repoPreview, setRepoPreview] = useState(null);
    const [repoPreviewLoading, setRepoPreviewLoading] = useState(false);

    // Repos the configured token's account can see — lets someone pick a
    // repo instead of typing a URL by hand. Only meaningful once a token
    // is saved, since listing "your repos" needs to know whose account.
    const [accountRepos, setAccountRepos] = useState([]);
    const [loadingAccountRepos, setLoadingAccountRepos] = useState(false);

    // Drives the highlighted "Generate a token" link below — GitHub's 60/hour
    // anonymous limit is the single most common reason someone lands here.
    const isRateLimited = !!(
        repoPreview && !repoPreview.found && /rate limit/i.test(repoPreview.error || "")
    );

    const [dockerRegistry, setDockerRegistry] = useState("");
    const [dockerUsername, setDockerUsername] = useState("");
    const [dockerPassword, setDockerPassword] = useState("");
    const [dockerPasswordConfigured, setDockerPasswordConfigured] = useState(false);

    const [oauthClientId, setOauthClientId] = useState("");
    const [oauthClientSecret, setOauthClientSecret] = useState("");
    const [oauthClientSecretConfigured, setOauthClientSecretConfigured] = useState(false);

    const [adminUsernamesText, setAdminUsernamesText] = useState("");

    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(true);

    async function load() {

        try {

            const [data, myGitHub] = await Promise.all([
                getSettings(),
                getMyGitHubSettings()
            ]);

            setGithubRepoUrl(
                myGitHub.gitHubOwner && myGitHub.gitHubRepository
                    ? `https://github.com/${myGitHub.gitHubOwner}/${myGitHub.gitHubRepository}`
                    : ""
            );
            setGithubTokenConfigured(!!myGitHub.gitHubTokenConfigured);

            setDockerRegistry(data.dockerRegistry || "");
            setDockerUsername(data.dockerUsername || "");
            setDockerPasswordConfigured(!!data.dockerPasswordConfigured);

            setOauthClientId(data.gitHubOAuthClientId || "");
            setOauthClientSecretConfigured(!!data.gitHubOAuthClientSecretConfigured);

            setAdminUsernamesText((data.adminGitHubUsernames || []).join(", "));

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to load settings.", "error");

        }
        finally {

            setLoading(false);

        }

    }

    useEffect(() => {

        async function init() {

            await load();

            // Applied after load() so a repo carried over from the Public
            // Repository Lookup card wins over whatever was already saved.
            if (pendingRepoUrl) {
                setGithubRepoUrl(pendingRepoUrl);
                setPendingRepoUrl(null);
            }

        }

        init();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {

        let cancelled = false;

        getLogs()
            .then((response) => {
                if (!cancelled) {
                    setLogs(Array.isArray(response.data) ? response.data : []);
                }
            })
            .catch((err) => console.error(err))
            .finally(() => {
                if (!cancelled) {
                    setLogsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };

    }, []);

    useEffect(() => {

        if (!githubTokenConfigured) {
            setAccountRepos([]);
            return;
        }

        let cancelled = false;
        setLoadingAccountRepos(true);

        getAccountRepositories()
            .then((response) => {
                if (!cancelled) setAccountRepos(Array.isArray(response.data) ? response.data : []);
            })
            .catch((err) => console.error(err))
            .finally(() => {
                if (!cancelled) setLoadingAccountRepos(false);
            });

        return () => {
            cancelled = true;
        };

    }, [githubTokenConfigured]);

    useEffect(() => {

        const parsed = parseRepoUrl(githubRepoUrl);

        if (!parsed) {
            setRepoPreview(null);
            setRepoPreviewLoading(false);
            return;
        }

        let cancelled = false;

        setRepoPreviewLoading(true);

        const timer = setTimeout(async () => {

            try {

                const preview = await previewGitHubRepository(parsed.owner, parsed.repository);

                if (!cancelled) {
                    setRepoPreview(preview);
                }

            }
            catch (err) {

                console.error(err);

                if (!cancelled) {
                    setRepoPreview({ found: false, error: "Unable to reach GitHub." });
                }

            }
            finally {

                if (!cancelled) {
                    setRepoPreviewLoading(false);
                }

            }

        }, 600);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };

    }, [githubRepoUrl]);

    async function handleSaveGitHub() {

        const parsed = parseRepoUrl(githubRepoUrl);

        if (!parsed) {

            toast.show(
                "Enter a valid GitHub repository URL, e.g. https://github.com/owner/repo",
                "error"
            );

            return;

        }

        try {

            setSavingGitHub(true);

            await saveMyGitHubSettings({
                owner: parsed.owner,
                repository: parsed.repository,
                personalAccessToken: githubToken || null
            });

            setGithubToken("");
            toast.show(`GitHub settings saved: ${parsed.owner}/${parsed.repository}`, "success");

            // Full reload, not just re-fetching this page's own state —
            // Dashboard, Deploy, History, etc. already loaded data for
            // whatever repo was configured before this save and won't know
            // to refetch on their own, so a page reload is what actually
            // gets every page showing the newly configured repo's details.
            setTimeout(() => window.location.reload(), 900);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save GitHub settings.", "error");

        }
        finally {

            setSavingGitHub(false);

        }

    }

    async function handleSaveDocker() {

        try {

            setSavingDocker(true);

            await saveDockerSettings({
                registry: dockerRegistry,
                username: dockerUsername,
                password: dockerPassword || null
            });

            setDockerPassword("");
            toast.show("Docker settings saved.", "success");
            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save Docker settings.", "error");

        }
        finally {

            setSavingDocker(false);

        }

    }

    async function handleSaveOAuth() {

        try {

            setSavingOAuth(true);

            await saveGitHubOAuthSettings({
                clientId: oauthClientId,
                clientSecret: oauthClientSecret || null
            });

            setOauthClientSecret("");
            toast.show("GitHub OAuth settings saved.", "success");
            load();
            refreshOauthStatus();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save GitHub OAuth settings.", "error");

        }
        finally {

            setSavingOAuth(false);

        }

    }

    async function handleSaveAdmins() {

        try {

            setSavingAdmins(true);

            const usernames = adminUsernamesText
                .split(",")
                .map((u) => u.trim())
                .filter(Boolean);

            await saveAdminUsernames({ adminGitHubUsernames: usernames });

            toast.show("Admin allowlist saved.", "success");
            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save admin allowlist.", "error");

        }
        finally {

            setSavingAdmins(false);

        }

    }

    async function handleClear(section, label) {

        if (!(await confirm({
            title: "Clear saved data?",
            message: `Clear all saved ${label}? This cannot be undone.`,
            confirmLabel: "Clear",
            danger: true
        }))) {
            return;
        }

        try {

            if (section === "github") {
                await clearMyGitHubToken();
                setGithubToken("");
                refreshOauthStatus();
                toast.show(`${label} cleared.`, "success");
                load();
                return;
            }

            await clearSettings(section);

            if (section === "docker") {
                setDockerPassword("");
            }

            if (section === "github-oauth") {
                setOauthClientSecret("");
                refreshOauthStatus();
            }

            toast.show(`${label} cleared.`, "success");
            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Failed to clear ${label}.`, "error");

        }

    }

    // Unlike handleClear, this wipes the repository URL/owner too (not
    // just the token) plus Docker, OAuth, and the admin allowlist — a
    // full reset back to first-run, not just rotating a credential. Every
    // other page already loaded data for whatever repo was configured
    // before this, so a reload is what actually clears that everywhere.
    async function handleClearAll() {

        if (!(await confirm({
            title: "Clear all shared settings?",
            message:
                "Clear ALL shared portal settings? This removes the Docker credentials, OAuth " +
                "settings, and the admin allowlist. It does not touch anyone's own GitHub repo/token " +
                "— clear those individually from the GitHub section above. This cannot be undone.",
            confirmLabel: "Clear All Data",
            danger: true
        }))) {
            return;
        }

        try {

            setClearingAll(true);

            await clearSettings("all");

            toast.show("All settings cleared.", "success");

            setTimeout(() => window.location.reload(), 900);

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to clear all data.", "error");
            setClearingAll(false);

        }

    }

    const {
        page: logsPage,
        setPage: setLogsPage,
        pageCount: logsPageCount,
        pageItems: logsPageItems,
        totalCount: logsTotalCount,
        startIndex: logsStartIndex,
        endIndex: logsEndIndex
    } = usePagination(logs, 10);

    if (loading) {
        return <LoadingSpinner />;
    }

    const pageTitle =
        view === "credentials" ? "Credentials"
        : view === "activity-log" ? "Activity Log"
        : view === "access-levels" ? "Access Levels"
        : view === "branches" ? "Branches"
        : "Settings";

    return (

        <PageLayout
            title={pageTitle}
            actions={view !== "hub" && (
                <button type="button" className="settings-back-link" onClick={() => setView("hub")}>
                    ← Back to Settings
                </button>
            )}
        >

            {dialog}

            {view === "hub" && (

                <>

                <div className="settings-hub">

                    <button type="button" className="settings-hub-tile" onClick={() => setView("credentials")}>
                        <h2>Credentials</h2>
                        <p>
                            GitHub, Docker, and OAuth credentials plus the admin allowlist —
                            everything the backend needs to talk to GitHub on the portal's behalf.
                        </p>
                    </button>

                    <button type="button" className="settings-hub-tile" onClick={() => setView("activity-log")}>
                        <h2>Activity Log</h2>
                        <p>
                            Recent settings changes and backend errors, kept in memory on
                            the server.
                        </p>
                    </button>

                    <button type="button" className="settings-hub-tile" onClick={() => setView("access-levels")}>
                        <h2>Access Levels</h2>
                        <p>
                            Everyone with access, invited or already in — invite, change, or
                            revoke what they can do.
                        </p>
                    </button>

                    <button type="button" className="settings-hub-tile" onClick={() => setView("branches")}>
                        <h2>Branches</h2>
                        <p>
                            Create branches, note what each one is for, and restrict who can
                            push to it.
                        </p>
                    </button>

                </div>

                <div className="card card-danger-zone">

                    <h2 className="card-title">
                        Danger Zone
                    </h2>

                    <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                        Wipes everything on the Credentials page at once — the repository URL, the
                        GitHub token, Docker credentials, OAuth settings, and the admin allowlist —
                        instead of clearing one section at a time. The portal goes back to its
                        unconfigured, first-run state.
                    </p>

                    <button
                        className="btn btn-danger"
                        onClick={handleClearAll}
                        disabled={clearingAll}
                    >
                        {clearingAll ? "Clearing..." : "Clear All Data"}
                    </button>

                </div>

                </>

            )}

            {view === "credentials" && (

            <>

            <div className="card">

                <h2 className="card-title">
                    Credentials
                </h2>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    Saved server-side in a gitignored local config file — never stored in the
                    browser. Your GitHub repo and token below are yours alone; every other
                    user of this portal configures their own. Docker, OAuth, and the admin
                    allowlist further down are shared by the whole portal instead.
                </p>

                <div className="settings-subsection">

                <h3 className="settings-subhead">Your GitHub Access</h3>

                {githubTokenConfigured && (

                    <div className="form-group">

                        <label>Switch repository</label>

                        {loadingAccountRepos ? (

                            <p className="field-hint">Loading repositories for this token's account...</p>

                        ) : accountRepos.length > 0 ? (

                            <ComboBox
                                options={accountRepos.map((repo) => ({
                                    value: repo.htmlUrl,
                                    label: repo.private ? `${repo.fullName} (private)` : repo.fullName
                                }))}
                                value={githubRepoUrl}
                                onChange={(url) => url && setGithubRepoUrl(url)}
                                placeholder="Search repositories this token can see..."
                            />

                        ) : (

                            <p className="field-hint">
                                No repositories found for this token's account.
                            </p>

                        )}

                    </div>

                )}

                <div className="form-group">
                    <label>Repository URL</label>
                    <ClearableInput
                        placeholder="https://github.com/owner/repo"
                        value={githubRepoUrl}
                        onChange={(e) => setGithubRepoUrl(e.target.value)}
                        onClear={() => setGithubRepoUrl("")}
                        autoComplete="off"
                        name="repository-url"
                    />
                    {githubRepoUrl.trim() && (

                        parseRepoUrl(githubRepoUrl) ? (

                            <p className="field-hint field-hint-good">
                                Owner: <strong>{parseRepoUrl(githubRepoUrl).owner}</strong>
                                {" "}&middot; Repository: <strong>{parseRepoUrl(githubRepoUrl).repository}</strong>
                            </p>

                        ) : (

                            <p className="field-hint field-hint-bad">
                                Doesn't look like a GitHub repository URL yet — expecting something like
                                https://github.com/owner/repo
                            </p>

                        )

                    )}

                    {repoPreviewLoading && (
                        <p className="field-hint">Fetching repository details...</p>
                    )}

                    {!repoPreviewLoading && repoPreview && (

                        repoPreview.found ? (

                            <div className="repo-preview">

                                {repoPreview.description && (
                                    <p className="repo-preview-description">
                                        {repoPreview.description}
                                    </p>
                                )}

                                <div className="repo-preview-stats">

                                    <span><strong>{repoPreview.branchCount}{repoPreview.branchCountApproximate ? "+" : ""}</strong> branches</span>

                                    <span><strong>{repoPreview.workflowCount}</strong> workflows</span>

                                    <span><strong>{repoPreview.stars}</strong> stars</span>

                                    <span>Default branch: <strong>{repoPreview.defaultBranch}</strong></span>

                                    <span>{repoPreview.private ? "Private" : "Public"}</span>

                                </div>

                            </div>

                        ) : (

                            <p className="field-hint field-hint-bad">
                                {repoPreview.error || "Repository not found."}
                            </p>

                        )

                    )}
                </div>

                <div className="form-group">
                    <label>
                        Personal Access Token
                        {" "}
                        {githubTokenConfigured && (
                            <span className="badge badge-success">Saved</span>
                        )}
                    </label>
                    <input
                        type="password"
                        className="form-control"
                        placeholder={githubTokenConfigured ? "Token saved — click \"Clear Token\" to change it" : "ghp_..."}
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        disabled={githubTokenConfigured}
                        autoComplete="new-password"
                    />
                    {!githubTokenConfigured && (
                        <a
                            href="https://github.com/settings/tokens"
                            target="_blank"
                            rel="noreferrer"
                            className={`token-help-link ${isRateLimited ? "token-help-link-alert" : ""}`}
                        >
                            {isRateLimited
                                ? "Rate limit exceeded — generate a token on GitHub →"
                                : "Generate a token on GitHub →"}
                        </a>
                    )}
                </div>

                <div className="button-row">

                    <button className="btn btn-primary" onClick={handleSaveGitHub} disabled={savingGitHub}>
                        {savingGitHub ? "Saving..." : "Save GitHub Settings"}
                    </button>

                    <button className="btn btn-danger" onClick={() => handleClear("github", "GitHub token")}>
                        Clear Token
                    </button>

                </div>

                </div>

                <div className="settings-subsection">

                <h3 className="settings-subhead">Docker Registry</h3>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    Stored for future use — no build/push step in this portal reads these yet.
                </p>

                <div className="form-group">
                    <label>Registry</label>
                    <ClearableInput
                        placeholder="docker.io / ghcr.io / your-registry.com"
                        value={dockerRegistry}
                        onChange={(e) => setDockerRegistry(e.target.value)}
                        onClear={() => setDockerRegistry("")}
                        autoComplete="off"
                        name="docker-registry"
                    />
                </div>

                <div className="form-group">
                    <label>Username</label>
                    <ClearableInput
                        value={dockerUsername}
                        onChange={(e) => setDockerUsername(e.target.value)}
                        onClear={() => setDockerUsername("")}
                        autoComplete="off"
                        name="docker-username"
                    />
                </div>

                <div className="form-group">
                    <label>
                        Password / Access Token
                        {" "}
                        {dockerPasswordConfigured && (
                            <span className="badge badge-success">Saved</span>
                        )}
                    </label>
                    <ClearableInput
                        type="password"
                        placeholder={dockerPasswordConfigured ? "Leave blank to keep current password" : ""}
                        value={dockerPassword}
                        onChange={(e) => setDockerPassword(e.target.value)}
                        onClear={() => setDockerPassword("")}
                        autoComplete="new-password"
                    />
                </div>

                <div className="button-row">

                    <button className="btn btn-primary" onClick={handleSaveDocker} disabled={savingDocker}>
                        {savingDocker ? "Saving..." : "Save Docker Settings"}
                    </button>

                    <button className="btn btn-danger" onClick={() => handleClear("docker", "Docker password")}>
                        Clear Password
                    </button>

                </div>

                </div>

                <div className="settings-subsection">

                <h3 className="settings-subhead">GitHub OAuth Login</h3>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    From your GitHub OAuth App at github.com/settings/developers. Callback URL must be
                    set to <code>http://localhost:5279/api/auth/github/callback</code>.
                </p>

                <div className="form-group">
                    <label>Client ID</label>
                    <ClearableInput
                        value={oauthClientId}
                        onChange={(e) => setOauthClientId(e.target.value)}
                        onClear={() => setOauthClientId("")}
                        autoComplete="off"
                        name="oauth-client-id"
                    />
                </div>

                <div className="form-group">
                    <label>
                        Client Secret
                        {" "}
                        {oauthClientSecretConfigured && (
                            <span className="badge badge-success">Saved</span>
                        )}
                    </label>
                    <ClearableInput
                        type="password"
                        placeholder={oauthClientSecretConfigured ? "Leave blank to keep current secret" : ""}
                        value={oauthClientSecret}
                        onChange={(e) => setOauthClientSecret(e.target.value)}
                        onClear={() => setOauthClientSecret("")}
                        autoComplete="new-password"
                    />
                </div>

                <div className="button-row">

                    <button className="btn btn-primary" onClick={handleSaveOAuth} disabled={savingOAuth}>
                        {savingOAuth ? "Saving..." : "Save OAuth Settings"}
                    </button>

                    <button className="btn btn-danger" onClick={() => handleClear("github-oauth", "GitHub OAuth client secret")}>
                        Clear Secret
                    </button>

                </div>

                </div>

                <div className="settings-subsection">

                <h3 className="settings-subhead">Admin Allowlist</h3>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    GitHub usernames that get the Admin role on login. Everyone else who logs in gets Viewer.
                </p>

                <div className="form-group">
                    <label>GitHub Usernames (comma-separated)</label>
                    <ClearableInput
                        placeholder="octocat, hubot"
                        value={adminUsernamesText}
                        onChange={(e) => setAdminUsernamesText(e.target.value)}
                        onClear={() => setAdminUsernamesText("")}
                        autoComplete="off"
                        name="admin-usernames"
                    />
                </div>

                <div className="button-row">

                    <button className="btn btn-primary" onClick={handleSaveAdmins} disabled={savingAdmins}>
                        {savingAdmins ? "Saving..." : "Save Admin Allowlist"}
                    </button>

                    <button className="btn btn-danger" onClick={() => handleClear("admins", "admin allowlist")}>
                        Clear
                    </button>

                </div>

                </div>

            </div>

            </>

            )}

            {view === "activity-log" && (

            <>

            <div className="card">

                <h2 className="card-title">
                    Activity Log
                </h2>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    Recent settings changes and backend errors — kept in memory on the
                    server, cleared on restart.
                </p>

                {logsLoading ? (

                    <p className="field-hint">Loading activity log...</p>

                ) : logs.length === 0 ? (

                    <p className="empty-state">No activity recorded yet.</p>

                ) : (

                    <div className="table-scroll">

                    <table className="table">

                        <thead>
                            <tr>
                                <th>When</th>
                                <th>Level</th>
                                <th>Category</th>
                                <th>Message</th>
                            </tr>
                        </thead>

                        <tbody>

                            {logsPageItems.map((entry, i) => (

                                <tr key={`${entry.timestamp}-${i}`}>
                                    <td>{new Date(entry.timestamp).toLocaleString()}</td>
                                    <td>
                                        <span className={`badge ${entry.level === "Error" ? "badge-danger" : "badge-info"}`}>
                                            {entry.level}
                                        </span>
                                    </td>
                                    <td>{entry.category}</td>
                                    <td>{entry.message}</td>
                                </tr>

                            ))}

                        </tbody>

                    </table>

                    </div>

                )}

                {!logsLoading && (

                    <Pagination
                        page={logsPage}
                        pageCount={logsPageCount}
                        totalCount={logsTotalCount}
                        startIndex={logsStartIndex}
                        endIndex={logsEndIndex}
                        onPageChange={setLogsPage}
                    />

                )}

            </div>

            </>

            )}

            {view === "access-levels" && (

            <>

            <AccessLevels />

            </>

            )}

            {view === "branches" && (

            <>

            <BranchManager />

            </>

            )}

        </PageLayout>

    );

}

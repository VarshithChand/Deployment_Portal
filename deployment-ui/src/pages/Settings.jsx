import { useCallback, useEffect, useState } from "react";

import {
    getSettings,
    getMyGitHubSettings,
    saveMyGitHubSettings,
    clearMyGitHubToken,
    saveDockerSettings,
    saveGitHubOAuthSettings,
    saveAdminUsernames,
    saveSonarSettings,
    getPatUsers,
    getUserSidebarAccess,
    saveUserSidebarAccess,
    clearUserSidebarAccess,
    clearSettings,
    clearMySettings,
    previewGitHubRepository
} from "../services/settingsService";
import { getAccountRepositories } from "../services/githubService";
import { getLogs } from "../services/logsService";

import LoadingSpinner from "../components/LoadingSpinner";
import PageLayout from "../components/layout/PageLayout";
import AccessLevels from "../components/settings/AccessLevels";
import BranchManager from "../components/settings/BranchManager";
import SettingsHubView from "../components/settings/SettingsHubView";
import CredentialsView from "../components/settings/CredentialsView";
import SidebarAccessView from "../components/settings/SidebarAccessView";
import ActivityLogView from "../components/settings/ActivityLogView";
import SmokeTestsView from "../components/settings/SmokeTestsView";
import ExternalApisView from "../components/settings/ExternalApisView";
import EnvironmentsAdminView from "../components/settings/EnvironmentsAdminView";
import useToast from "../hooks/useToast";
import useConfirm from "../hooks/useConfirm";
import useAuth from "../hooks/useAuth";
import useNavigation from "../hooks/useNavigation";
import usePagination from "../hooks/usePagination";
import parseRepoUrl from "../utils/parseRepoUrl";

const VIEWS = ["hub", "credentials", "activity-log", "access-levels", "branches", "sidebar-access", "smoke-tests", "external-apis", "environments"];

// Every one of these requires Admin server-side (LogsController,
// SmokeTestController, ExternalHealthController, and the /sidebar/*
// endpoints all run through AdminGate) - showing any of them to a
// non-admin would just be an empty/failed page. "environments" is
// deliberately NOT here: GET /api/environments has always been open to
// any visitor (it's the same data the Dashboard card and Environments
// page already show everyone) - only saving changes is admin-gated
// server-side, which EnvironmentsAdminView enforces itself by disabling
// its edit controls for non-admins rather than hiding the whole page.
const ADMIN_ONLY_VIEWS = new Set(["sidebar-access", "activity-log", "smoke-tests", "external-apis"]);

// Every restrictable sidebar tab except "settings" and "dashboard" — the
// backend refuses those two entries regardless of what's sent (locking
// Settings would strand every admin with no way back in, and Dashboard is
// where the frontend's route guard sends anyone who lands on a restricted
// tab — see SettingsService.SaveSidebarAccessAsync). Labels mirror
// Sidebar.jsx's own TABS.
const SIDEBAR_TABS = [
    { key: "deploy", label: "Deploy" },
    { key: "approvals", label: "Approvals" },
    { key: "pullRequests", label: "Pull Requests" },
    { key: "storage", label: "Artifacts & Images" },
    { key: "analytics", label: "Analytics" },
    { key: "timeline", label: "Timeline" },
    { key: "history", label: "History" },
    { key: "environments", label: "Environments" },
    { key: "templates", label: "Template Tester" },
    { key: "services", label: "Services" },
    { key: "docker", label: "Docker" }
];

const SIDEBAR_STATES = [
    { value: "visible", label: "Visible" },
    { value: "locked", label: "Locked" },
    { value: "hidden", label: "Hidden" }
];

const VIEW_TITLES = {
    credentials: "Credentials",
    "activity-log": "Activity Log",
    "access-levels": "Access Levels",
    branches: "Branches",
    "sidebar-access": "Sidebar Access",
    "smoke-tests": "Smoke Tests",
    "external-apis": "External APIs",
    environments: "Environments"
};

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
    const { user, isAdminSession, oauthStatusChecked, refreshOauthStatus } = useAuth();
    const { pendingRepoUrl, setPendingRepoUrl, refreshSidebarAccess } = useNavigation();

    // Sidebar Access controls what every other visitor can even reach, so
    // unlike the rest of this page (visible to everyone, gated only on
    // save), it's hidden from view entirely unless this browser actually has
    // admin authority — via a real GitHub OAuth login (user.role) OR a
    // configured Personal Access Token that belongs to an allowlisted
    // username (isAdminSession, from AdminGate.IsAdminViaPersonalAccessTokenAsync)
    // — not just "not shown as an option," since reaching it via a raw
    // "?view=sidebar-access" URL is guarded below too.
    const isAdmin = user?.role === "Admin" || isAdminSession;

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
    const [savingSonar, setSavingSonar] = useState(false);
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

    const [sonarHostUrl, setSonarHostUrl] = useState("https://sonarcloud.io");
    const [sonarOrganization, setSonarOrganization] = useState("");
    const [sonarProjectKey, setSonarProjectKey] = useState("");
    const [sonarToken, setSonarToken] = useState("");
    const [sonarTokenConfigured, setSonarTokenConfigured] = useState(false);

    const [adminUsernamesText, setAdminUsernamesText] = useState("");

    // Sidebar Access is two levels: a list of PAT users to pick from, then
    // that one user's own per-tab restrictions once picked.
    const [patUsers, setPatUsers] = useState([]);
    const [patUsersLoading, setPatUsersLoading] = useState(true);
    const [selectedPatUserKey, setSelectedPatUserKey] = useState(null);

    const [sidebarAccessMap, setSidebarAccessMap] = useState({});
    const [sidebarAccessLoading, setSidebarAccessLoading] = useState(false);
    const [savingSidebarAccess, setSavingSidebarAccess] = useState(false);
    const [clearingSidebarAccess, setClearingSidebarAccess] = useState(false);

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

            setSonarHostUrl(data.sonarHostUrl || "https://sonarcloud.io");
            setSonarOrganization(data.sonarOrganization || "");
            setSonarProjectKey(data.sonarProjectKey || "");
            setSonarTokenConfigured(!!data.sonarTokenConfigured);

        }
        catch (err) {

            console.error(err);
            toast.show("Unable to load settings.", "error");

        }
        finally {

            setLoading(false);

        }

    }

    // Bounces away from an admin-only view if it's ever reached without
    // admin access — a raw "?view=..." URL, or an admin session that
    // expired while this page was already open.
    // isAdminSession (part of isAdmin) starts false and only becomes
    // reliable once oauthStatusChecked flips true — without that guard
    // this bounced a real admin back to "hub" on every hard reload of
    // an admin-only view, since the check hadn't resolved yet.
    useEffect(() => {

        if (ADMIN_ONLY_VIEWS.has(view) && oauthStatusChecked && !isAdmin) {
            setView("hub");
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, isAdmin, oauthStatusChecked]);

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

    // Only fetched once this browser actually has admin authority — the
    // endpoint itself is admin-gated, so trying earlier (e.g. before a PAT
    // owner check resolves) would just fail silently and add console noise
    // for every other visitor.
    useEffect(() => {

        if (!isAdmin) {
            setPatUsersLoading(false);
            return;
        }

        let cancelled = false;

        setPatUsersLoading(true);

        getPatUsers()
            .then((data) => {
                if (!cancelled) {
                    setPatUsers(Array.isArray(data) ? data : []);
                }
            })
            .catch((err) => console.error(err))
            .finally(() => {
                if (!cancelled) {
                    setPatUsersLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };

    }, [isAdmin]);

    // The per-tab editor loads fresh each time a different PAT user is
    // picked (or deselected, which clears it back out).
    useEffect(() => {

        if (!selectedPatUserKey) {
            setSidebarAccessMap({});
            return;
        }

        let cancelled = false;

        setSidebarAccessLoading(true);

        getUserSidebarAccess(selectedPatUserKey)
            .then((data) => {
                if (!cancelled) {
                    setSidebarAccessMap(data || {});
                }
            })
            .catch((err) => console.error(err))
            .finally(() => {
                if (!cancelled) {
                    setSidebarAccessLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };

    }, [selectedPatUserKey]);

    // Admin-only server-side (see LogsController) — matches Sidebar Access's
    // own pattern of not even attempting the fetch for a non-admin session.
    useEffect(() => {

        if (!isAdmin) {
            setLogsLoading(false);
            return;
        }

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

    }, [isAdmin]);

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

    async function handleSaveSonar() {

        try {

            setSavingSonar(true);

            await saveSonarSettings({
                hostUrl: sonarHostUrl,
                organization: sonarOrganization,
                projectKey: sonarProjectKey,
                token: sonarToken || null
            });

            setSonarToken("");
            toast.show("Sonar settings saved.", "success");
            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save Sonar settings.", "error");

        }
        finally {

            setSavingSonar(false);

        }

    }

    async function handleSaveAdmins() {

        const usernames = adminUsernamesText
            .split(",")
            .map((u) => u.trim())
            .filter(Boolean);

        // An empty allowlist isn't just "no admins" - it's bootstrap mode
        // (see AdminGate), which grants Admin to every single visitor to
        // this portal, including total strangers, until it's configured
        // again. That's the right behavior for a brand new, never-
        // configured install; saving it empty on a portal that's already
        // live is almost always a mistake (a blank field submitted by
        // accident), so this asks first instead of silently reopening the
        // whole site to anyone.
        if (usernames.length === 0 && !(await confirm({
            title: "Clear the admin allowlist?",
            message:
                "This allowlist is currently empty in the field below, so saving it will leave " +
                "NO admins configured — every visitor to this portal (including strangers) will " +
                "be treated as Admin until someone configures this again.",
            confirmLabel: "Save Empty Allowlist",
            danger: true
        }))) {
            return;
        }

        try {

            setSavingAdmins(true);

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

    function setSidebarTabState(key, state) {

        setSidebarAccessMap((prev) => ({ ...prev, [key]: state }));

    }

    // Re-pulls the PAT user list so each row's restricted-tab-count badge
    // reflects whatever was just saved/reset, without a full page reload.
    async function refreshPatUsers() {

        try {
            setPatUsers(await getPatUsers());
        }
        catch (err) {
            console.error(err);
        }

    }

    async function handleSaveSidebarAccess() {

        if (!selectedPatUserKey) return;

        try {

            setSavingSidebarAccess(true);

            const saved = await saveUserSidebarAccess(selectedPatUserKey, sidebarAccessMap);

            setSidebarAccessMap(saved || {});
            toast.show("Sidebar access saved.", "success");
            refreshPatUsers();
            refreshSidebarAccess();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save sidebar access.", "error");

        }
        finally {

            setSavingSidebarAccess(false);

        }

    }

    async function handleClearSidebarAccess() {

        if (!selectedPatUserKey) return;

        if (!(await confirm({
            title: "Reset sidebar access?",
            message: "Every tab goes back to fully visible for this PAT user. This cannot be undone.",
            confirmLabel: "Reset",
            danger: true
        }))) {
            return;
        }

        try {

            setClearingSidebarAccess(true);

            await clearUserSidebarAccess(selectedPatUserKey);

            setSidebarAccessMap({});
            toast.show("Sidebar access reset — everything is visible again for this PAT user.", "success");
            refreshPatUsers();
            refreshSidebarAccess();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to reset sidebar access.", "error");

        }
        finally {

            setClearingSidebarAccess(false);

        }

    }

    async function handleClear(section, label) {

        // Same bootstrap-mode consequence as the empty-allowlist save
        // guard above (see handleSaveAdmins) - this button skips that
        // check entirely since it doesn't go through the text field at
        // all, so it needs its own specific warning.
        const message = section === "admins"
            ? "This removes every username from the admin allowlist — every visitor to this " +
              "portal (including strangers) will be treated as Admin until someone configures " +
              "this again. This cannot be undone."
            : `Clear all saved ${label}? This cannot be undone.`;

        if (!(await confirm({
            title: "Clear saved data?",
            message,
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
    // just the token) plus Docker, OAuth, and Sonar — a full reset of
    // everything EXCEPT the admin allowlist, which is deliberately kept so
    // this can never drop the portal into bootstrap mode (see
    // ClearAllAsync). Every other page already loaded data for whatever
    // repo was configured before this, so a reload is what actually clears
    // that everywhere — and with this session's own GitHub token gone,
    // that reload lands back on RequireGitHubSetup's "connect your repo"
    // gate automatically.
    //
    // Non-admins get a narrower version: only their own GitHub/AWS/Azure/
    // GCP credentials, via /me/all (no AdminGate - resetting your own data
    // never needed admin rights for any of these individually either).
    // The shared, portal-wide sections (Docker/OAuth/Sonar) only an admin
    // can touch, via clearSettings("all") - previously this whole button
    // was wired to that admin-only endpoint regardless of who clicked it,
    // so a normal user resetting just their own token hit "Admin login
    // required" for no reason.
    async function handleClearAll() {

        const message = isAdmin
            ? "Clear ALL saved data? This removes your GitHub repository URL and token, your " +
              "AWS/Azure/GCP credentials, the Docker credentials, OAuth settings, and Sonar " +
              "settings. The admin allowlist is kept as-is — this won't affect who has admin " +
              "access. Other users' own GitHub repo/token are untouched — this only clears " +
              "yours. This cannot be undone."
            : "Clear all your saved data? This removes your GitHub repository URL and token, " +
              "plus your AWS/Azure/GCP credentials. This cannot be undone.";

        if (!(await confirm({
            title: "Clear all data?",
            message,
            confirmLabel: "Clear All Data",
            danger: true
        }))) {
            return;
        }

        try {

            setClearingAll(true);

            await (isAdmin ? clearSettings("all") : clearMySettings());

            toast.show("All data cleared — reconnect your GitHub repository to continue.", "success");

            // A full navigation (not just reload()) so this lands on the
            // Dashboard instead of reloading back into Settings - RequireGitHubSetup's
            // "connect your repo" gate still shows on top of it either way,
            // since that's driven by whether GitHub credentials are
            // configured, not which tab is active.
            setTimeout(() => {

                const url = new URL(window.location.href);
                url.searchParams.set("tab", "dashboard");
                url.searchParams.delete("view");
                window.location.href = url.toString();

            }, 900);

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

    const pageTitle = VIEW_TITLES[view] || "Settings";

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

                <SettingsHubView
                    isAdmin={isAdmin}
                    setView={setView}
                    handleClearAll={handleClearAll}
                    clearingAll={clearingAll}
                />

            )}

            {view === "credentials" && (

                <CredentialsView
                    githubTokenConfigured={githubTokenConfigured}
                    loadingAccountRepos={loadingAccountRepos}
                    accountRepos={accountRepos}
                    githubRepoUrl={githubRepoUrl}
                    setGithubRepoUrl={setGithubRepoUrl}
                    repoPreviewLoading={repoPreviewLoading}
                    repoPreview={repoPreview}
                    isRateLimited={isRateLimited}
                    githubToken={githubToken}
                    setGithubToken={setGithubToken}
                    handleSaveGitHub={handleSaveGitHub}
                    savingGitHub={savingGitHub}
                    handleClear={handleClear}
                    dockerRegistry={dockerRegistry}
                    setDockerRegistry={setDockerRegistry}
                    dockerUsername={dockerUsername}
                    setDockerUsername={setDockerUsername}
                    dockerPasswordConfigured={dockerPasswordConfigured}
                    dockerPassword={dockerPassword}
                    setDockerPassword={setDockerPassword}
                    handleSaveDocker={handleSaveDocker}
                    savingDocker={savingDocker}
                    oauthClientId={oauthClientId}
                    setOauthClientId={setOauthClientId}
                    oauthClientSecretConfigured={oauthClientSecretConfigured}
                    oauthClientSecret={oauthClientSecret}
                    setOauthClientSecret={setOauthClientSecret}
                    handleSaveOAuth={handleSaveOAuth}
                    savingOAuth={savingOAuth}
                    sonarHostUrl={sonarHostUrl}
                    setSonarHostUrl={setSonarHostUrl}
                    sonarOrganization={sonarOrganization}
                    setSonarOrganization={setSonarOrganization}
                    sonarProjectKey={sonarProjectKey}
                    setSonarProjectKey={setSonarProjectKey}
                    sonarTokenConfigured={sonarTokenConfigured}
                    sonarToken={sonarToken}
                    setSonarToken={setSonarToken}
                    handleSaveSonar={handleSaveSonar}
                    savingSonar={savingSonar}
                    adminUsernamesText={adminUsernamesText}
                    setAdminUsernamesText={setAdminUsernamesText}
                    handleSaveAdmins={handleSaveAdmins}
                    savingAdmins={savingAdmins}
                />

            )}

            {view === "sidebar-access" && isAdmin && (

                <SidebarAccessView
                    patUsersLoading={patUsersLoading}
                    patUsers={patUsers}
                    selectedPatUserKey={selectedPatUserKey}
                    setSelectedPatUserKey={setSelectedPatUserKey}
                    sidebarAccessLoading={sidebarAccessLoading}
                    sidebarAccessMap={sidebarAccessMap}
                    setSidebarTabState={setSidebarTabState}
                    sidebarTabs={SIDEBAR_TABS}
                    sidebarStates={SIDEBAR_STATES}
                    handleSaveSidebarAccess={handleSaveSidebarAccess}
                    savingSidebarAccess={savingSidebarAccess}
                    handleClearSidebarAccess={handleClearSidebarAccess}
                    clearingSidebarAccess={clearingSidebarAccess}
                />

            )}

            {view === "activity-log" && isAdmin && (

                <ActivityLogView
                    logsLoading={logsLoading}
                    logs={logs}
                    logsPageItems={logsPageItems}
                    logsPage={logsPage}
                    logsPageCount={logsPageCount}
                    logsTotalCount={logsTotalCount}
                    logsStartIndex={logsStartIndex}
                    logsEndIndex={logsEndIndex}
                    setLogsPage={setLogsPage}
                />

            )}

            {view === "smoke-tests" && isAdmin && (

                <SmokeTestsView />

            )}

            {view === "external-apis" && isAdmin && (

                <ExternalApisView />

            )}

            {view === "environments" && (

                <EnvironmentsAdminView isAdmin={isAdmin} />

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

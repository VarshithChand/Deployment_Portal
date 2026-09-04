import { useCallback, useEffect, useState } from "react";

import {
    getSettings,
    getMyGitHubSettings,
    saveMyGitHubSettings,
    clearMyGitHubToken,
    saveDockerSettings,
    saveGitHubOAuthSettings,
    saveAdminUsernames,
    saveAdminEmails,
    suspendAdmin,
    unsuspendAdmin,
    saveAiSettings,
    testAiConnection,
    saveNotificationSettings,
    testNotificationEmail,
    getPatUsers,
    getUserSidebarAccess,
    saveUserSidebarAccess,
    clearUserSidebarAccess,
    clearSettings,
    previewGitHubRepository,
    previewGitHubUserRepositories
} from "../services/settingsService";
import { getAccountRepositories } from "../services/githubService";
import { getLogs } from "../services/logsService";
import performSignOut from "../utils/performSignOut";
import { SIDEBAR_TABS } from "../constants/sidebarAccess";
import { VIEWS, VIEW_TITLES, ADMIN_ONLY_VIEWS, SUPER_ADMIN_ONLY_VIEWS } from "../constants/settingsViews";
import isValidGitHubUsername from "../utils/githubUsername";

import LoadingSpinner from "../components/LoadingSpinner";
import PageLayout from "../components/layout/PageLayout";
import AccessLevels from "../components/settings/AccessLevels";
import BranchManager from "../components/settings/BranchManager";
import SettingsHubView from "../components/settings/SettingsHubView";
import AccountView from "../components/settings/AccountView";
import CredentialsView from "../components/settings/CredentialsView";
import AdminAccessView from "../components/settings/AdminAccessView";
import SidebarAccessView from "../components/settings/SidebarAccessView";
import ActivityLogView from "../components/settings/ActivityLogView";
import SmokeTestsView from "../components/settings/SmokeTestsView";
import ExternalApisView from "../components/settings/ExternalApisView";
import AppearanceView from "../components/settings/AppearanceView";
import EnvironmentsAdminView from "../components/settings/EnvironmentsAdminView";
import DatabaseView from "../components/settings/DatabaseView";
import SecurityTestingView from "../components/settings/SecurityTestingView";
import HostingObservabilityConfigView from "../components/settings/HostingObservabilityConfigView";
import useToast from "../hooks/useToast";
import useConfirm from "../hooks/useConfirm";
import useAuth from "../hooks/useAuth";
import useNavigation from "../hooks/useNavigation";
import usePagination from "../hooks/usePagination";
import parseRepoUrl from "../utils/parseRepoUrl";

// VIEWS/VIEW_TITLES/ADMIN_ONLY_VIEWS live in constants/settingsViews.js -
// shared with HeaderSearch, which lists every sub-page below as its own
// searchable result using the exact same labels/admin-gating this page
// itself uses.

// SIDEBAR_TABS/SIDEBAR_STATES live in constants/sidebarAccess.js - shared
// with the Services page's per-PAT-user access popup, which manages the
// exact same restriction data from a different entry point.

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
    const { user, isAdminSession, isSuperAdminSession, oauthStatusChecked, refreshOauthStatus } = useAuth();
    const {
        pendingRepoUrl, setPendingRepoUrl,
        pendingSettingsView, setPendingSettingsView,
        pendingCredentialMode, setPendingCredentialMode,
        refreshSidebarAccess
    } = useNavigation();

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
    const [signingOut, setSigningOut] = useState(false);

    const [githubRepoUrl, setGithubRepoUrl] = useState("");
    const [githubToken, setGithubToken] = useState("");
    const [githubTokenConfigured, setGithubTokenConfigured] = useState(false);
    const [githubPatExpiresAt, setGithubPatExpiresAt] = useState("");
    // What the server actually had before this page load - lets the save
    // handler below tell "field was always blank" apart from "user just
    // cleared a previously-saved date", since the backend needs an
    // explicit clear signal rather than treating blank as "remove it" (a
    // caller that doesn't know this field exists at all also sends it
    // blank, and that must NOT wipe an existing value - see
    // GitHubSettingsUpdateDto.ClearPatExpiry).
    const [githubPatExpiresAtOriginal, setGithubPatExpiresAtOriginal] = useState("");

    const [repoPreview, setRepoPreview] = useState(null);
    const [repoPreviewLoading, setRepoPreviewLoading] = useState(false);

    // Repos the configured token's account can see — lets someone pick a
    // repo instead of typing a URL by hand. Only meaningful once a token
    // is saved, since listing "your repos" needs to know whose account.
    const [accountRepos, setAccountRepos] = useState([]);
    const [loadingAccountRepos, setLoadingAccountRepos] = useState(false);

    // Set instead of repoPreview when the Repository URL field holds a bare
    // GitHub username rather than a specific repo/URL - lets someone browse
    // every public repo an arbitrary GitHub user owns and pick one, the same
    // capability the old Dashboard "Public Repository Lookup" card had,
    // folded into this field instead of living as its own page.
    const [userRepoResults, setUserRepoResults] = useState(null);

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
    const [suspendedAdminUsernames, setSuspendedAdminUsernames] = useState([]);
    const [adminEmailsText, setAdminEmailsText] = useState("");
    const [savingAdminEmails, setSavingAdminEmails] = useState(false);

    const [aiModel, setAiModel] = useState("");
    const [aiApiKey, setAiApiKey] = useState("");
    const [aiApiKeyConfigured, setAiApiKeyConfigured] = useState(false);
    const [savingAi, setSavingAi] = useState(false);
    const [testingAi, setTestingAi] = useState(false);
    const [aiTestResult, setAiTestResult] = useState(null);

    const [notificationsFromEmail, setNotificationsFromEmail] = useState("");
    const [notificationsFromName, setNotificationsFromName] = useState("");
    const [notificationsApiKey, setNotificationsApiKey] = useState("");
    const [notificationsApiKeyConfigured, setNotificationsApiKeyConfigured] = useState(false);
    const [savingNotifications, setSavingNotifications] = useState(false);
    const [testEmailAddress, setTestEmailAddress] = useState("");
    const [testingNotifications, setTestingNotifications] = useState(false);
    const [notificationsTestResult, setNotificationsTestResult] = useState(null);

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
            // date input wants "YYYY-MM-DD" - the API sends a full ISO
            // timestamp, so only the date portion is kept.
            const loadedExpiry = myGitHub.patExpiresAt ? myGitHub.patExpiresAt.slice(0, 10) : "";
            setGithubPatExpiresAt(loadedExpiry);
            setGithubPatExpiresAtOriginal(loadedExpiry);

            setDockerRegistry(data.dockerRegistry || "");
            setDockerUsername(data.dockerUsername || "");
            setDockerPasswordConfigured(!!data.dockerPasswordConfigured);

            setOauthClientId(data.gitHubOAuthClientId || "");
            setOauthClientSecretConfigured(!!data.gitHubOAuthClientSecretConfigured);

            setAdminUsernamesText((data.adminGitHubUsernames || []).join(", "));
            setSuspendedAdminUsernames(data.suspendedAdminGitHubUsernames || []);
            setAdminEmailsText((data.adminEmails || []).join(", "));

            setAiModel(data.aiModel || "");
            setAiApiKeyConfigured(!!data.aiApiKeyConfigured);

            setNotificationsFromEmail(data.notificationsFromEmail || "");
            setNotificationsFromName(data.notificationsFromName || "");
            setNotificationsApiKeyConfigured(!!data.notificationsApiKeyConfigured);

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
            return;
        }

        // Database is restricted to one specific GitHub identity, not the
        // general admin allowlist - see SUPER_ADMIN_ONLY_VIEWS/AdminGate.
        // DenyUnlessSuperAdminAsync. Checked separately from the isAdmin
        // bounce above since a general admin who isn't that identity would
        // otherwise pass the isAdmin check and land on a page that just
        // 403s on every call.
        if (SUPER_ADMIN_ONLY_VIEWS.has(view) && oauthStatusChecked && !isSuperAdminSession) {
            setView("hub");
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, isAdmin, isSuperAdminSession, oauthStatusChecked]);

    useEffect(() => {

        async function init() {

            await load();

            // Applied after load() so a repo/username carried over from
            // HeaderSearch's GitHub result wins over whatever was already
            // saved.
            if (pendingRepoUrl) {
                setGithubRepoUrl(pendingRepoUrl);
                setPendingRepoUrl(null);
            }

        }

        init();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Same "pendingX" hand-off shape as pendingRepoUrl/pendingEnvironmentName
    // (see NavigationContext) - HeaderSearch's Settings sub-page results set
    // this then switch to the Settings tab. A dedicated effect (not folded
    // into the mount-only init() above) so it also works when Settings is
    // already mounted and the user picks a different sub-page result.
    useEffect(() => {

        if (pendingSettingsView) {
            setView(pendingSettingsView);
            setPendingSettingsView(null);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingSettingsView]);

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

        const trimmed = githubRepoUrl.trim();
        const parsed = parseRepoUrl(trimmed);

        // Not a full repo URL/owner-repo - if it at least looks like a bare
        // GitHub username, fall through to the browse-their-repos lookup
        // below instead of just giving up.
        const asUsername = !parsed && isValidGitHubUsername(trimmed) ? trimmed : null;

        setRepoPreview(null);
        setUserRepoResults(null);

        if (!parsed && !asUsername) {
            setRepoPreviewLoading(false);
            return;
        }

        let cancelled = false;

        setRepoPreviewLoading(true);

        const timer = setTimeout(async () => {

            try {

                if (parsed) {

                    const preview = await previewGitHubRepository(parsed.owner, parsed.repository);

                    if (!cancelled) {
                        setRepoPreview(preview);
                    }

                }
                else {

                    const result = await previewGitHubUserRepositories(asUsername);

                    if (!cancelled) {
                        setUserRepoResults(result);
                    }

                }

            }
            catch (err) {

                console.error(err);

                if (!cancelled) {

                    const failure = { found: false, error: "Unable to reach GitHub." };

                    if (parsed) setRepoPreview(failure);
                    else setUserRepoResults(failure);

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

        // Repo selection is optional here - the backend already accepts a
        // blank owner/repository (see SettingsController.SaveMyGitHub), so
        // saving just a token and picking a repo later (via the "Switch
        // repository" picker right above this field, once the token's
        // saved) is a real, supported flow, not a partial/invalid state.
        // Only a NON-blank value that fails to parse is rejected - that's
        // still a typo worth catching.
        const trimmedUrl = githubRepoUrl.trim();
        const parsed = trimmedUrl ? parseRepoUrl(trimmedUrl) : null;

        if (trimmedUrl && !parsed) {

            toast.show(
                "Enter a valid GitHub repository URL, e.g. https://github.com/owner/repo",
                "error"
            );

            return;

        }

        if (!parsed && !githubToken && !githubTokenConfigured) {

            toast.show("Enter a Personal Access Token to connect GitHub.", "error");
            return;

        }

        try {

            setSavingGitHub(true);

            await saveMyGitHubSettings({
                owner: parsed?.owner || null,
                repository: parsed?.repository || null,
                personalAccessToken: githubToken || null,
                patExpiresAt: githubPatExpiresAt || null,
                // Only true when a date WAS previously loaded and the field
                // is now empty - a form that never had one and is still
                // blank must never send this, or a caller unaware of this
                // field (e.g. a fresh first-time connect) would trip it.
                clearPatExpiry: !!githubPatExpiresAtOriginal && !githubPatExpiresAt
            });

            setGithubToken("");
            toast.show(
                parsed
                    ? `GitHub settings saved: ${parsed.owner}/${parsed.repository}`
                    : "GitHub token saved. Pick a repository whenever you're ready.",
                "success"
            );

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

    async function handleSaveAi() {

        try {

            setSavingAi(true);

            await saveAiSettings({
                apiKey: aiApiKey || null,
                model: aiModel
            });

            setAiApiKey("");
            setAiTestResult(null);
            toast.show("AI Assistant settings saved.", "success");
            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save AI Assistant settings.", "error");

        }
        finally {

            setSavingAi(false);

        }

    }

    async function handleTestAi() {

        try {

            setTestingAi(true);
            setAiTestResult(null);

            const result = await testAiConnection();
            setAiTestResult(result);

        }
        catch (err) {

            console.error(err);

            setAiTestResult({
                success: false,
                message: err.response?.data?.message || "Unable to test the connection right now."
            });

        }
        finally {

            setTestingAi(false);

        }

    }

    async function handleSaveNotifications() {

        try {

            setSavingNotifications(true);

            await saveNotificationSettings({
                apiKey: notificationsApiKey || null,
                fromEmail: notificationsFromEmail,
                fromName: notificationsFromName
            });

            setNotificationsApiKey("");
            setNotificationsTestResult(null);
            toast.show("Notification settings saved.", "success");
            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save notification settings.", "error");

        }
        finally {

            setSavingNotifications(false);

        }

    }

    async function handleTestNotifications() {

        if (!testEmailAddress.trim()) {
            toast.show("Enter an email address to send the test to.", "error");
            return;
        }

        try {

            setTestingNotifications(true);
            setNotificationsTestResult(null);

            const result = await testNotificationEmail(testEmailAddress.trim());
            setNotificationsTestResult(result);

        }
        catch (err) {

            console.error(err);

            setNotificationsTestResult({
                success: false,
                message: err.response?.data?.message || "Unable to send the test email right now."
            });

        }
        finally {

            setTestingNotifications(false);

        }

    }

    // `usernamesOverride`, when given, is saved directly instead of
    // re-parsing adminUsernamesText - needed because a per-row Add/Remove
    // (see AdminAccessView's Admin Allowlist tab) computes its own next
    // list and calls this in the same tick as setAdminUsernamesText,
    // which wouldn't be reflected in this closure's adminUsernamesText
    // yet (React state updates aren't synchronous).
    async function handleSaveAdmins(usernamesOverride) {

        const usernames = usernamesOverride ?? adminUsernamesText
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

    // Email equivalent of handleSaveAdmins above - see AdminAccessView's
    // Admin Allowlist tab, which now saves to whichever of the two lists
    // matches the format typed (an "@" means email). Same `emailsOverride`
    // reasoning as handleSaveAdmins: a per-row Add/Remove computes its own
    // next list and needs to save it directly rather than re-parsing
    // adminEmailsText, which wouldn't reflect this tick's change yet.
    async function handleSaveAdminEmails(emailsOverride) {

        const emails = emailsOverride ?? adminEmailsText
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean);

        // Bootstrap mode (AdminGate.IsAdminOrBootstrap) only kicks in when
        // BOTH allowlists are empty at once - same "don't silently reopen
        // an already-live portal to strangers" reasoning as
        // handleSaveAdmins, just checked against the OTHER list too here.
        const usernameCount = adminUsernamesText.split(",").map((u) => u.trim()).filter(Boolean).length;

        if (emails.length === 0 && usernameCount === 0 && !(await confirm({
            title: "Clear the admin allowlist?",
            message:
                "Both the username and email admin lists would be empty after this save, which " +
                "leaves NO admins configured — every visitor to this portal (including strangers) " +
                "will be treated as Admin until someone configures this again.",
            confirmLabel: "Save Empty Allowlist",
            danger: true
        }))) {
            return;
        }

        try {

            setSavingAdminEmails(true);

            await saveAdminEmails(emails);

            toast.show("Admin allowlist saved.", "success");

            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to save admin allowlist.", "error");

        }
        finally {

            setSavingAdminEmails(false);

        }

    }

    // Toggles one admin's suspended flag - unlike Remove above, the
    // username stays on the allowlist, just treated as a Viewer until
    // unsuspended (see AdminGate.IsAdminOrBootstrap). Takes effect on
    // that person's very next request, no logout needed.
    async function handleToggleSuspendAdmin(username, suspending) {

        try {

            await (suspending ? suspendAdmin(username) : unsuspendAdmin(username));
            toast.show(suspending ? `'${username}' suspended.` : `'${username}' unsuspended.`, "success");
            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to update this admin's suspended status.", "error");

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

            if (section === "ai") {
                setAiApiKey("");
                setAiTestResult(null);
            }

            toast.show(`${label} cleared.`, "success");
            load();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Failed to clear ${label}.`, "error");

        }

    }

    // Danger Zone action for every role, admin included - a real sign-out
    // (see SoftSignOutPatUserAsync/performSignOut.js), not a wipe. Round
    // 19 originally kept a separate, still-destructive "Clear All Data"
    // bulk reset for admins here (wiping Docker/OAuth/Sonar too, via
    // clearSettings("all")/clearMySettings) - removed after the user
    // confirmed that wasn't wanted even for an admin session, so this is
    // now the only Danger Zone action for everyone. Nothing saved is
    // cleared - the same token, and every AWS/Azure/GCP credential tied to
    // this session, are still there the moment it's entered again.
    async function handleSignOut() {

        if (!(await confirm({
            title: "Sign out?",
            message: "You'll be signed out and returned to the login screen. Nothing you've " +
                "saved is cleared - your GitHub token and any AWS/Azure/GCP credentials are " +
                "still there the next time you sign back in.",
            confirmLabel: "Sign Out"
        }))) {
            return;
        }

        setSigningOut(true);
        await performSignOut();

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
                    isSuperAdmin={isSuperAdminSession}
                    setView={setView}
                    handleSignOut={handleSignOut}
                    signingOut={signingOut}
                />

            )}

            {view === "account" && (

                <AccountView />

            )}

            {view === "credentials" && (

                <CredentialsView
                    initialMode={pendingCredentialMode}
                    onConsumedInitialMode={() => setPendingCredentialMode(null)}
                    githubTokenConfigured={githubTokenConfigured}
                    loadingAccountRepos={loadingAccountRepos}
                    accountRepos={accountRepos}
                    githubRepoUrl={githubRepoUrl}
                    setGithubRepoUrl={setGithubRepoUrl}
                    repoPreviewLoading={repoPreviewLoading}
                    repoPreview={repoPreview}
                    userRepoResults={userRepoResults}
                    isRateLimited={isRateLimited}
                    githubToken={githubToken}
                    setGithubToken={setGithubToken}
                    githubPatExpiresAt={githubPatExpiresAt}
                    setGithubPatExpiresAt={setGithubPatExpiresAt}
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
                    aiModel={aiModel}
                    setAiModel={setAiModel}
                    aiApiKey={aiApiKey}
                    setAiApiKey={setAiApiKey}
                    aiApiKeyConfigured={aiApiKeyConfigured}
                    handleSaveAi={handleSaveAi}
                    savingAi={savingAi}
                    handleTestAi={handleTestAi}
                    testingAi={testingAi}
                    aiTestResult={aiTestResult}
                    notificationsFromEmail={notificationsFromEmail}
                    setNotificationsFromEmail={setNotificationsFromEmail}
                    notificationsFromName={notificationsFromName}
                    setNotificationsFromName={setNotificationsFromName}
                    notificationsApiKey={notificationsApiKey}
                    setNotificationsApiKey={setNotificationsApiKey}
                    notificationsApiKeyConfigured={notificationsApiKeyConfigured}
                    handleSaveNotifications={handleSaveNotifications}
                    savingNotifications={savingNotifications}
                    testEmailAddress={testEmailAddress}
                    setTestEmailAddress={setTestEmailAddress}
                    handleTestNotifications={handleTestNotifications}
                    testingNotifications={testingNotifications}
                    notificationsTestResult={notificationsTestResult}
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

            {view === "appearance" && (

                <AppearanceView />

            )}

            {view === "database" && isSuperAdminSession && (

                <DatabaseView />

            )}

            {view === "admin-access" && isSuperAdminSession && (

                <AdminAccessView
                    adminUsernamesText={adminUsernamesText}
                    setAdminUsernamesText={setAdminUsernamesText}
                    handleSaveAdmins={handleSaveAdmins}
                    savingAdmins={savingAdmins}
                    adminEmailsText={adminEmailsText}
                    setAdminEmailsText={setAdminEmailsText}
                    handleSaveAdminEmails={handleSaveAdminEmails}
                    savingAdminEmails={savingAdminEmails}
                    suspendedAdminUsernames={suspendedAdminUsernames}
                    handleToggleSuspendAdmin={handleToggleSuspendAdmin}
                    handleClear={handleClear}
                    patUsers={patUsers}
                    patUsersLoading={patUsersLoading}
                    refreshPatUsers={refreshPatUsers}
                    selectedPatUserKey={selectedPatUserKey}
                    setSelectedPatUserKey={setSelectedPatUserKey}
                    sidebarAccessLoading={sidebarAccessLoading}
                    sidebarAccessMap={sidebarAccessMap}
                    setSidebarTabState={setSidebarTabState}
                    sidebarTabs={SIDEBAR_TABS}
                    handleSaveSidebarAccess={handleSaveSidebarAccess}
                    savingSidebarAccess={savingSidebarAccess}
                    handleClearSidebarAccess={handleClearSidebarAccess}
                    clearingSidebarAccess={clearingSidebarAccess}
                />

            )}

            {view === "security-testing" && isSuperAdminSession && (

                <SecurityTestingView />

            )}

            {view === "observability-config" && isSuperAdminSession && (

                <HostingObservabilityConfigView />

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

import { useEffect, useState } from "react";

import ClearableInput from "../common/ClearableInput";
import GitHubAccessSection from "./GitHubAccessSection";
import AwsLoginSection from "./credentials/AwsLoginSection";
import AzureLoginSection from "./credentials/AzureLoginSection";
import GcpLoginSection from "./credentials/GcpLoginSection";
import PaasLoginSection from "./credentials/PaasLoginSection";
import MyConnectedAccounts from "./credentials/MyConnectedAccounts";
import DashboardRoleSection from "./credentials/DashboardRoleSection";
import DatabaseConnectionSection from "./credentials/DatabaseConnectionSection";
import ApiKeySection from "./credentials/ApiKeySection";
import SecurityPinSection from "./credentials/SecurityPinSection";
import CredentialPinGate from "./credentials/CredentialPinGate";
import PortalRegistryLoginSection from "./credentials/PortalRegistryLoginSection";
import GitLabRegistryLoginSection from "./credentials/GitLabRegistryLoginSection";
import JfrogLoginSection from "./credentials/JfrogLoginSection";
import HostCredentialLoginSection from "./credentials/HostCredentialLoginSection";
import SonarLoginSection from "./credentials/SonarLoginSection";
import CredentialsLockModal from "./credentials/CredentialsLockModal";
import { ChevronIcon } from "../layout/SidebarIcons";
import useAuth from "../../hooks/useAuth";
import { getMyAwsSettings, getMyAzureSettings, getMyGcpSettings } from "../../services/settingsService";
import { getMyApiKeys } from "../../services/securityService";
import { getPaasStatus } from "../../services/paasService";
import { getSonarStatus } from "../../services/sonarService";
import {
    getDockerHubStatus, saveDockerHubCredentials, clearDockerHubCredentials,
    getGhcrStatus, saveGhcrCredentials, clearGhcrCredentials,
    getGitLabRegistryStatus, getJfrogStatus, getHostRegistryStatus
} from "../../services/containerRegistryService";
import {
    getAzureDevOpsStatus, saveAzureDevOpsCredentials, clearAzureDevOpsCredentials
} from "../../services/azureDevOpsService";

const MODES = [
    { key: "github", label: "GitHub" },
    { key: "azureDevOps", label: "Azure DevOps" },
    { key: "aws", label: "AWS" },
    { key: "azure", label: "Azure" },
    { key: "gcp", label: "GCP" },
    { key: "apikey", label: "API Key" },
    { key: "screenlock", label: "Screen Lock" },
    { key: "sonarqube", label: "SonarQube" },
    { key: "sonarcloud", label: "SonarCloud" },
    { key: "docker", label: "Docker" },
    { key: "dockerhub", label: "Docker Hub" },
    { key: "ghcr", label: "GHCR" },
    { key: "gitlab-registry", label: "GitLab Registry" },
    { key: "jfrog", label: "JFrog" },
    { key: "harbor", label: "Harbor" },
    { key: "nexus", label: "Nexus" },
    { key: "oauth", label: "GitHub OAuth" },
    { key: "ai", label: "AI Assistant" },
    { key: "render", label: "Render" },
    { key: "cloudflare", label: "Cloudflare" },
    { key: "netlify", label: "Netlify" },
    { key: "vercel", label: "Vercel" },
    { key: "database", label: "Database" }
];

// Every provider key CredentialPinGate can gate - matches the backend's
// CredentialGate.AllProviders exactly (github/aws/azure/gcp/apikey/
// docker/github-oauth/sonarqube/sonarcloud/ai/render/cloudflare/netlify/
// vercel/...). One successful unlock now grants all of them there, so the
// frontend mirrors that here instead of only marking whichever single tab
// prompted for the PIN.
const ALL_CREDENTIAL_PROVIDERS = [
    "github", "aws", "azure", "gcp", "apikey", "docker", "github-oauth", "sonarqube", "sonarcloud", "ai",
    "render", "cloudflare", "netlify", "vercel", "dockerhub", "ghcr", "gitlab-registry", "jfrog",
    "harbor", "nexus", "azureDevOps"
];

// Purely a display grouping for the tab bar below - mirrors the Sidebar's
// own Source Control/Code Quality/Container Registry nested groups (see
// Sidebar.jsx) so a visitor who already knows that structure recognizes it
// here too, but this doesn't touch MODES/configuredByMode/mode-switching at
// all - a mode not listed in any group's `modes` here just renders in the
// flat row below the groups, same as every mode did before grouping existed.
// "Hosting Providers" isn't itself a nested Sidebar group (Render/
// Cloudflare/Netlify/Vercel all live inside one PaasHosting.jsx page via
// its own internal tabs, not separate sidebar pages) but groups naturally
// here since they're 4 separate credential forms.
const CREDENTIAL_GROUPS = [
    { key: "sourceControl", label: "Source Control", modes: ["github", "azureDevOps"] },
    { key: "codeQuality", label: "Code Quality", modes: ["sonarqube", "sonarcloud"] },
    { key: "containerRegistry", label: "Container Registry", modes: ["dockerhub", "ghcr", "gitlab-registry", "jfrog", "harbor", "nexus"] },
    { key: "hostingProviders", label: "Hosting Providers", modes: ["render", "cloudflare", "netlify", "vercel"] }
];

// A convenience picker, not a restriction — GEMINI_MODEL is still whatever
// string ends up saved (see SettingsService.SaveAiAssistantAsync), so
// picking "Custom / other model" below still works for anything Google
// adds or retires later.
//
// "gemini-flash-latest" is listed first and recommended: it's a real,
// documented Google alias that always resolves to the current
// recommended Flash model (hot-swapped on new releases, with a 2-week
// notice before any breaking change) - ai.google.dev/gemini-api/docs/models.
// This sidesteps the whole class of problem where a specific dated model
// ID (gemini-2.0-flash, then gemini-2.5-flash) got rejected with
// "no longer available to new users" - some newly-created API keys are
// restricted to alias/current-generation models rather than every
// individually-dated one, even while that same dated ID is still listed
// as "stable" for older keys.
const GEMINI_MODEL_OPTIONS = [
    { value: "gemini-flash-latest", label: "Gemini Flash (latest) — recommended, auto-updates" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash — free tier" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite — fastest, free tier" }
];

const CUSTOM_MODEL_VALUE = "__custom__";

// Pulled out of Settings.jsx's "credentials" view - its own nested
// loading/repo-preview conditionals were the single largest contributor
// to that page's cognitive complexity. Split into one "login mode" per
// provider (rather than one long scroll of every section stacked) so
// picking, say, AWS doesn't require scrolling past GitHub/Docker/OAuth/
// Sonar/Admin first.
export default function CredentialsView({
    initialMode,
    onConsumedInitialMode,
    githubTokenConfigured,
    loadingAccountRepos,
    accountRepos,
    githubRepoUrl,
    setGithubRepoUrl,
    repoPreviewLoading,
    repoPreview,
    userRepoResults,
    isRateLimited,
    githubToken,
    setGithubToken,
    handleSaveGitHub,
    savingGitHub,
    handleClear,
    dockerRegistry,
    setDockerRegistry,
    dockerUsername,
    setDockerUsername,
    dockerPasswordConfigured,
    dockerPassword,
    setDockerPassword,
    handleSaveDocker,
    savingDocker,
    oauthClientId,
    setOauthClientId,
    oauthClientSecretConfigured,
    oauthClientSecret,
    setOauthClientSecret,
    handleSaveOAuth,
    savingOAuth,
    aiModel,
    setAiModel,
    aiApiKey,
    setAiApiKey,
    aiApiKeyConfigured,
    handleSaveAi,
    savingAi,
    handleTestAi,
    testingAi,
    aiTestResult
}) {

    const [mode, setMode] = useState("github");
    const { pinConfigured, isSuperAdminSession } = useAuth();

    // Jumped here from the Dashboard's Quick Access card (see
    // NavigationContext's pendingCredentialMode/goToCredential) - lands
    // straight on that one provider's own tab instead of always opening on
    // "github". Consumed once then cleared server-side (well, context-side)
    // via onConsumedInitialMode so switching tabs manually afterward isn't
    // fought by this effect firing again.
    useEffect(() => {

        if (initialMode) {
            setMode(initialMode);
            onConsumedInitialMode?.();
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialMode]);

    // Which credential groups (Source Control/Code Quality/Container
    // Registry/Hosting Providers) are expanded - all expanded by default,
    // same "nothing hidden behind an extra click on first visit" default
    // the Sidebar's own groups use.
    const [expandedGroups, setExpandedGroups] = useState(
        () => new Set(CREDENTIAL_GROUPS.map((g) => g.key))
    );

    function toggleGroup(key) {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }

    // "At a glance" status per tab, shown as a small checkmark on the
    // button-row below so you can see what's already connected without
    // clicking into each tab. Undefined = not fetched yet (shows nothing
    // rather than a wrong guess); github/docker/oauth/ai reuse the props
    // Settings.jsx already fetched, everything else here gets its own
    // lightweight fetch on mount.
    const [remoteStatus, setRemoteStatus] = useState({});

    useEffect(() => {

        Promise.all([
            getMyAwsSettings().catch(() => null),
            getMyAzureSettings().catch(() => null),
            getMyGcpSettings().catch(() => null),
            getMyApiKeys().catch(() => null),
            getPaasStatus("render").catch(() => null),
            getPaasStatus("cloudflare").catch(() => null),
            getPaasStatus("netlify").catch(() => null),
            getPaasStatus("vercel").catch(() => null),
            getDockerHubStatus().catch(() => null),
            getGhcrStatus().catch(() => null),
            getGitLabRegistryStatus().catch(() => null),
            getJfrogStatus().catch(() => null),
            getHostRegistryStatus("harbor").catch(() => null),
            getHostRegistryStatus("nexus").catch(() => null),
            getSonarStatus("sonarqube").catch(() => null),
            getSonarStatus("sonarcloud").catch(() => null),
            getAzureDevOpsStatus().catch(() => null)
        ]).then(([aws, azure, gcp, apiKeysRes, render, cloudflare, netlify, vercel, dockerhub, ghcr, gitlabRegistry, jfrog, harbor, nexus, sonarqube, sonarcloud, azureDevOps]) => {

            const activeKeyCount = Array.isArray(apiKeysRes?.data)
                ? apiKeysRes.data.filter((k) => !k.revoked).length
                : 0;

            setRemoteStatus({
                aws: aws?.configured,
                azure: azure?.configured,
                gcp: gcp?.configured,
                apikey: activeKeyCount > 0,
                render: render?.configured,
                cloudflare: cloudflare?.configured,
                netlify: netlify?.configured,
                vercel: vercel?.configured,
                dockerhub: dockerhub?.configured,
                ghcr: ghcr?.configured,
                "gitlab-registry": gitlabRegistry?.configured,
                jfrog: jfrog?.configured,
                harbor: harbor?.configured,
                nexus: nexus?.configured,
                sonarqube: sonarqube?.configured,
                sonarcloud: sonarcloud?.configured,
                azureDevOps: azureDevOps?.configured
            });

        });

    }, []);

    // Merges the remote fetch above with what Settings.jsx already passed
    // down as props, so every MODES entry has one consistent true/false/
    // undefined regardless of which of the two sources it comes from.
    const configuredByMode = {
        github: githubTokenConfigured,
        docker: dockerPasswordConfigured,
        oauth: oauthClientSecretConfigured,
        ai: aiApiKeyConfigured,
        screenlock: pinConfigured,
        ...remoteStatus
    };

    // Which providers this browser session has already unlocked via
    // CredentialPinGate this visit - lifted up here (rather than local to
    // each gate) so switching tabs and back doesn't re-prompt for one
    // already unlocked. Resets on reload, same as the backend's own grant
    // (see SessionActivityService.GrantCredentialUnlock) - never persisted.
    const [unlockedProviders, setUnlockedProviders] = useState(() => new Set());

    // One successful PIN entry unlocks every gated provider at once (see
    // CredentialGate.AllProviders on the backend, which now grants all of
    // them together) - so every gate's onUnlocked marks the whole set,
    // not just the tab that happened to prompt.
    function markAllUnlocked() {
        setUnlockedProviders(new Set(ALL_CREDENTIAL_PROVIDERS));
    }

    // Whole-page lock popup, shown on open (and again after any Clear
    // brings unlockedProviders back to empty) whenever a PIN is set and
    // nothing has been unlocked yet this visit - a convenience gate, not
    // the actual security boundary (every tab below still has its own
    // CredentialPinGate wrapper regardless of whether this modal was ever
    // shown, so dismissing it via "Forgot your PIN?" can never expose a
    // credential form without a real PIN check). Suppressed specifically
    // on the Screen Lock tab itself - that's the one place a locked-out
    // visitor needs to reach to reset their PIN via MFA in the first place
    // (see SecurityPinSection - it needs no PIN, only an MFA code, to set
    // a brand new one).
    const showLockModal = pinConfigured && unlockedProviders.size === 0 && mode !== "screenlock";

    // Clearing a credential revokes THAT ONE provider's unlock grant
    // server-side (see RevokeCredentialUnlock calls in SettingsController),
    // even though unlocking grants every provider together. Without this,
    // unlockedProviders would keep saying "github still unlocked" after a
    // Clear Token that just re-locked it server-side - the exact mismatch
    // that shows the raw save/clear form with no PIN prompt, only to have
    // the request itself 403 with CREDENTIAL_LOCKED.
    function removeUnlocked(provider) {
        setUnlockedProviders((prev) => {
            const next = new Set(prev);
            next.delete(provider);
            return next;
        });
    }

    // handleClear (passed down from Settings.jsx, covers github/docker/
    // github-oauth/sonar/ai) already swallows its own errors/cancellation
    // internally, so this always resolves - the provider is removed
    // whether the clear actually went through or was cancelled/failed,
    // which only costs an extra PIN prompt in the rare cancel/fail case,
    // never a stale "still unlocked" belief.
    async function handleClearAndRelock(section, label) {
        await handleClear(section, label);
        removeUnlocked(section);
    }

    // Shared by both the grouped clusters and the flat ungrouped row below
    // so the two never visually drift apart.
    function renderModeButton(m) {

        return (

            <button
                key={m.key}
                type="button"
                className={`btn btn-sm ${mode === m.key ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setMode(m.key)}
            >
                {m.label}
                {configuredByMode[m.key] && (
                    <span className="badge badge-success" style={{ marginLeft: "6px", padding: "0 5px" }}>✓</span>
                )}
            </button>

        );

    }

    const groupedModeKeys = new Set(CREDENTIAL_GROUPS.flatMap((g) => g.modes));
    const ungroupedModes = MODES.filter((m) => !groupedModeKeys.has(m.key));

    return (

        <>

        {showLockModal && (
            <CredentialsLockModal
                onUnlock={markAllUnlocked}
                onForgotPin={() => setMode("screenlock")}
            />
        )}

        <div className="card">

            <h2 className="card-title">
                Credentials
            </h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Everything below is yours alone — kept for your own browser session,
                isolated from every other visitor of this portal: GitHub, AWS, Azure, GCP,
                your API Key, Render, Cloudflare, Netlify, Vercel, Azure DevOps, Docker Hub,
                GHCR, GitLab Registry, JFrog, Harbor, Nexus, SonarQube, and SonarCloud all
                work this way — see what's under your own connected account right below
                once saved. (The Hosting Providers page itself shows this portal's own
                production deployment instead — a separate, portal-wide view restricted to
                a single administrator account.) The plain Docker registry credential and
                the GitHub OAuth app below are the two remaining portal-wide settings — one
                shared push credential and one shared login app for the whole deployment
                pipeline. A checkmark below means it's already configured — no need to
                click in just to check.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>

                {CREDENTIAL_GROUPS.map((group) => {

                    const expanded = expandedGroups.has(group.key);

                    return (

                        <div key={group.key} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 10px" }}>

                            <button
                                type="button"
                                onClick={() => toggleGroup(group.key)}
                                className="btn btn-link"
                                style={{ display: "flex", alignItems: "center", gap: "6px", padding: 0, fontWeight: 600 }}
                                aria-expanded={expanded}
                            >
                                <span style={{ display: "inline-flex", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                                    <ChevronIcon direction="right" />
                                </span>
                                {group.label}
                            </button>

                            {expanded && (
                                <div className="button-row" style={{ marginTop: "8px" }}>
                                    {group.modes.map((key) => renderModeButton(MODES.find((m) => m.key === key)))}
                                </div>
                            )}

                        </div>

                    );

                })}

                <div className="button-row">
                    {ungroupedModes.map(renderModeButton)}
                </div>

            </div>

            {mode === "github" && (

                // Only gated once a token is already saved - RequireGitHubSetup's
                // own onboarding/reconnect flow calls this same save action with
                // no PIN-entry UI in front of it, so gating an as-yet-unconfigured
                // GitHub connection here would make first-time setup impossible.
                // Matches the backend's own conditional check in SaveMyGitHub.
                githubTokenConfigured ? (

                    <CredentialPinGate
                        provider="github"
                        unlocked={unlockedProviders.has("github")}
                        onUnlocked={markAllUnlocked}
                    >
                        <GitHubAccessSection
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
                            handleSaveGitHub={handleSaveGitHub}
                            savingGitHub={savingGitHub}
                            handleClear={handleClearAndRelock}
                        />
                    </CredentialPinGate>

                ) : (

                    <GitHubAccessSection
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
                        handleSaveGitHub={handleSaveGitHub}
                        savingGitHub={savingGitHub}
                        handleClear={handleClearAndRelock}
                    />

                )

            )}

            {mode === "azureDevOps" && (

            <CredentialPinGate provider="azureDevOps" unlocked={unlockedProviders.has("azureDevOps")} onUnlocked={markAllUnlocked}>
                <PortalRegistryLoginSection
                    label="Azure DevOps"
                    usernameLabel="Organization"
                    identityLabel="Organization"
                    tokenLabel="Personal Access Token"
                    helpText="Powers the Source Control hub's Azure DevOps sub-pages (Branches, Pipelines, Build Artifacts, Pull Requests, Package Feeds) — your Azure DevOps organization name and a Personal Access Token with Code (Read & Write), Build (Read & Execute), Pull Request (Read & Write), and Packaging (Read) scopes. Read-only scopes are enough if you don't need to create/delete branches, run pipelines, or approve/complete pull requests."
                    statusFn={async () => {
                        const result = await getAzureDevOpsStatus();
                        return { configured: result.configured, username: result.organization };
                    }}
                    saveFn={(payload) => saveAzureDevOpsCredentials({ organization: payload.accountId, token: payload.token })}
                    clearFn={clearAzureDevOpsCredentials}
                    onCleared={() => removeUnlocked("azureDevOps")}
                />
            </CredentialPinGate>

            )}

            {mode === "aws" && (
                <CredentialPinGate provider="aws" unlocked={unlockedProviders.has("aws")} onUnlocked={markAllUnlocked}>
                    <AwsLoginSection onCleared={() => removeUnlocked("aws")} />
                </CredentialPinGate>
            )}

            {mode === "azure" && (
                <CredentialPinGate provider="azure" unlocked={unlockedProviders.has("azure")} onUnlocked={markAllUnlocked}>
                    <AzureLoginSection onCleared={() => removeUnlocked("azure")} />
                </CredentialPinGate>
            )}

            {mode === "gcp" && (
                <CredentialPinGate provider="gcp" unlocked={unlockedProviders.has("gcp")} onUnlocked={markAllUnlocked}>
                    <GcpLoginSection onCleared={() => removeUnlocked("gcp")} />
                </CredentialPinGate>
            )}

            {mode === "render" && (
                <CredentialPinGate provider="render" unlocked={unlockedProviders.has("render")} onUnlocked={markAllUnlocked}>
                    <PaasLoginSection provider="render" label="Render" onCleared={() => removeUnlocked("render")} />
                    <MyConnectedAccounts provider="render" label="Render" configured={configuredByMode.render} />
                    {isSuperAdminSession && <DashboardRoleSection provider="render" label="Render" hasAccountId={false} />}
                </CredentialPinGate>
            )}

            {mode === "cloudflare" && (
                <CredentialPinGate provider="cloudflare" unlocked={unlockedProviders.has("cloudflare")} onUnlocked={markAllUnlocked}>
                    <PaasLoginSection provider="cloudflare" label="Cloudflare" hasAccountId onCleared={() => removeUnlocked("cloudflare")} />
                    <MyConnectedAccounts provider="cloudflare" label="Cloudflare Pages" configured={configuredByMode.cloudflare} />
                    {isSuperAdminSession && <DashboardRoleSection provider="cloudflare" label="Cloudflare Pages" hasAccountId={true} />}
                </CredentialPinGate>
            )}

            {mode === "netlify" && (
                <CredentialPinGate provider="netlify" unlocked={unlockedProviders.has("netlify")} onUnlocked={markAllUnlocked}>
                    <PaasLoginSection provider="netlify" label="Netlify" onCleared={() => removeUnlocked("netlify")} />
                    <MyConnectedAccounts provider="netlify" label="Netlify" configured={configuredByMode.netlify} />
                    {isSuperAdminSession && <DashboardRoleSection provider="netlify" label="Netlify" hasAccountId={false} />}
                </CredentialPinGate>
            )}

            {mode === "vercel" && (
                <CredentialPinGate provider="vercel" unlocked={unlockedProviders.has("vercel")} onUnlocked={markAllUnlocked}>
                    <PaasLoginSection provider="vercel" label="Vercel" onCleared={() => removeUnlocked("vercel")} />
                    <MyConnectedAccounts provider="vercel" label="Vercel" configured={configuredByMode.vercel} />
                    {isSuperAdminSession && <DashboardRoleSection provider="vercel" label="Vercel" hasAccountId={false} />}
                </CredentialPinGate>
            )}

            {mode === "database" && (

                isSuperAdminSession ? (
                    <DatabaseConnectionSection />
                ) : (
                    <div className="settings-subsection">
                        <p className="empty-state" style={{ textAlign: "left" }}>
                            Restricted to a single administrator account.
                        </p>
                    </div>
                )

            )}

            {mode === "apikey" && (
                <CredentialPinGate provider="apikey" unlocked={unlockedProviders.has("apikey")} onUnlocked={markAllUnlocked}>
                    <ApiKeySection />
                </CredentialPinGate>
            )}

            {mode === "screenlock" && <SecurityPinSection />}

            {mode === "docker" && (

            <CredentialPinGate provider="docker" unlocked={unlockedProviders.has("docker")} onUnlocked={markAllUnlocked}>

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

                <button type="button" className="btn btn-primary" onClick={handleSaveDocker} disabled={savingDocker}>
                    {savingDocker ? "Saving..." : "Save Docker Settings"}
                </button>

                <button type="button" className="btn btn-danger" onClick={() => handleClearAndRelock("docker", "Docker password")}>
                    Clear Password
                </button>

            </div>

            </div>

            </CredentialPinGate>

            )}

            {mode === "dockerhub" && (

            <CredentialPinGate provider="dockerhub" unlocked={unlockedProviders.has("dockerhub")} onUnlocked={markAllUnlocked}>
                <PortalRegistryLoginSection
                    label="Docker Hub"
                    usernameLabel="Docker Hub Username"
                    tokenLabel="Personal Access Token"
                    helpText="Powers the Container Registry hub's Docker Hub tab — a Docker Hub username and a Personal Access Token (Account Settings → Security on hub.docker.com) with at least read access."
                    statusFn={getDockerHubStatus}
                    saveFn={saveDockerHubCredentials}
                    clearFn={clearDockerHubCredentials}
                    onCleared={() => removeUnlocked("dockerhub")}
                />
            </CredentialPinGate>

            )}

            {mode === "ghcr" && (

            <CredentialPinGate provider="ghcr" unlocked={unlockedProviders.has("ghcr")} onUnlocked={markAllUnlocked}>
                <PortalRegistryLoginSection
                    label="GHCR"
                    usernameLabel="GitHub Username"
                    tokenLabel="Personal Access Token"
                    helpText="Powers the Container Registry hub's GHCR tab — your GitHub username and a Personal Access Token with the read:packages scope. Lists packages owned by the token's own account; organization-owned packages aren't covered yet."
                    statusFn={getGhcrStatus}
                    saveFn={saveGhcrCredentials}
                    clearFn={clearGhcrCredentials}
                    onCleared={() => removeUnlocked("ghcr")}
                />
            </CredentialPinGate>

            )}

            {mode === "gitlab-registry" && (

            <CredentialPinGate provider="gitlab-registry" unlocked={unlockedProviders.has("gitlab-registry")} onUnlocked={markAllUnlocked}>
                <GitLabRegistryLoginSection onCleared={() => removeUnlocked("gitlab-registry")} />
            </CredentialPinGate>

            )}

            {mode === "jfrog" && (

            <CredentialPinGate provider="jfrog" unlocked={unlockedProviders.has("jfrog")} onUnlocked={markAllUnlocked}>
                <JfrogLoginSection onCleared={() => removeUnlocked("jfrog")} />
            </CredentialPinGate>

            )}

            {mode === "harbor" && (

            <CredentialPinGate provider="harbor" unlocked={unlockedProviders.has("harbor")} onUnlocked={markAllUnlocked}>
                <HostCredentialLoginSection
                    provider="harbor"
                    label="Harbor"
                    hostPlaceholder="https://harbor.mycompany.com"
                    passwordLabel="Password (or robot account secret)"
                    helpText="Powers the Container Registry hub's Harbor tab — your Harbor instance's URL and a user (or robot account) with read access to its projects."
                    onCleared={() => removeUnlocked("harbor")}
                />
            </CredentialPinGate>

            )}

            {mode === "nexus" && (

            <CredentialPinGate provider="nexus" unlocked={unlockedProviders.has("nexus")} onUnlocked={markAllUnlocked}>
                <HostCredentialLoginSection
                    provider="nexus"
                    label="Nexus"
                    hostPlaceholder="https://nexus.mycompany.com"
                    passwordLabel="Password"
                    helpText="Powers the Container Registry hub's Nexus tab — your Nexus Repository instance's URL and a user with read access to its docker-format repositories."
                    onCleared={() => removeUnlocked("nexus")}
                />
            </CredentialPinGate>

            )}

            {mode === "oauth" && (

            <CredentialPinGate provider="github-oauth" unlocked={unlockedProviders.has("github-oauth")} onUnlocked={markAllUnlocked}>

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

                <button type="button" className="btn btn-primary" onClick={handleSaveOAuth} disabled={savingOAuth}>
                    {savingOAuth ? "Saving..." : "Save OAuth Settings"}
                </button>

                <button type="button" className="btn btn-danger" onClick={() => handleClearAndRelock("github-oauth", "GitHub OAuth client secret")}>
                    Clear Secret
                </button>

            </div>

            </div>

            </CredentialPinGate>

            )}

            {mode === "sonarqube" && (

            <CredentialPinGate provider="sonarqube" unlocked={unlockedProviders.has("sonarqube")} onUnlocked={markAllUnlocked}>
                <SonarLoginSection
                    provider="sonarqube"
                    label="SonarQube"
                    hasHostUrl
                    onCleared={() => removeUnlocked("sonarqube")}
                />
            </CredentialPinGate>

            )}

            {mode === "sonarcloud" && (

            <CredentialPinGate provider="sonarcloud" unlocked={unlockedProviders.has("sonarcloud")} onUnlocked={markAllUnlocked}>
                <SonarLoginSection
                    provider="sonarcloud"
                    label="SonarCloud"
                    onCleared={() => removeUnlocked("sonarcloud")}
                />
            </CredentialPinGate>

            )}

            {mode === "ai" && (

            <CredentialPinGate provider="ai" unlocked={unlockedProviders.has("ai")} onUnlocked={markAllUnlocked}>

            <div className="settings-subsection">

            <h3 className="settings-subhead">AI Assistant</h3>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Powers <strong>Deployment Copilot</strong>, the assistant available throughout the
                portal. The API key is only ever used server-side, never sent to the browser.
            </p>

            <div className="form-group">
                <label>Provider</label>
                <input type="text" className="form-control" value="Google Gemini" disabled />
            </div>

            <div className="form-group">
                <label>
                    Gemini API Key
                    {" "}
                    {aiApiKeyConfigured && (
                        <span className="badge badge-success">Saved</span>
                    )}
                </label>
                <ClearableInput
                    type="password"
                    placeholder={aiApiKeyConfigured ? "Leave blank to keep current key" : ""}
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    onClear={() => setAiApiKey("")}
                    autoComplete="new-password"
                />
            </div>

            <div className="form-group">

                <label>Gemini Model</label>

                <select
                    className="form-control"
                    value={GEMINI_MODEL_OPTIONS.some((o) => o.value === aiModel) ? aiModel : CUSTOM_MODEL_VALUE}
                    onChange={(e) => setAiModel(e.target.value === CUSTOM_MODEL_VALUE ? "" : e.target.value)}
                >
                    {GEMINI_MODEL_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                    <option value={CUSTOM_MODEL_VALUE}>Custom / other model...</option>
                </select>

                {!GEMINI_MODEL_OPTIONS.some((o) => o.value === aiModel) && (

                    <ClearableInput
                        placeholder="e.g. gemini-2.5-pro"
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        onClear={() => setAiModel("")}
                        autoComplete="off"
                        name="ai-model-custom"
                        style={{ marginTop: "8px" }}
                    />

                )}

                <p className="field-hint" style={{ marginTop: "6px" }}>
                    Free-tier models on Google AI Studio — pick "Custom" to enter any other model
                    name. The portal never assumes a specific model; whatever's saved here is what
                    Deployment Copilot uses.
                </p>

            </div>

            <div className="form-group">
                <label>Status</label>
                <p style={{ margin: 0 }}>
                    {aiApiKeyConfigured
                        ? <span className="badge badge-success">🟢 Configured</span>
                        : <span className="badge badge-danger">🔴 Not Configured</span>}
                </p>
                {!aiApiKeyConfigured && (
                    <p className="field-hint" style={{ marginTop: "6px" }}>
                        Add a Gemini API key and model to enable Deployment Copilot.
                    </p>
                )}
            </div>

            {aiTestResult && (
                <p className={aiTestResult.success ? "field-hint" : "field-hint field-hint-bad"}>
                    {aiTestResult.success ? "🟢 " : "🔴 "}{aiTestResult.message}
                </p>
            )}

            <div className="button-row">

                <button type="button" className="btn btn-primary" onClick={handleSaveAi} disabled={savingAi}>
                    {savingAi ? "Saving..." : "Save Configuration"}
                </button>

                <button type="button" className="btn btn-secondary" onClick={handleTestAi} disabled={testingAi || !aiApiKeyConfigured}>
                    {testingAi ? "Testing..." : "Test Connection"}
                </button>

                <button type="button" className="btn btn-danger" onClick={() => handleClearAndRelock("ai", "Gemini API key")}>
                    Clear Key
                </button>

            </div>

            </div>

            </CredentialPinGate>

            )}

        </div>

        </>

    );

}

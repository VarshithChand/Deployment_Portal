import { createContext, useCallback, useEffect, useState } from "react";

import { getBootstrap } from "../services/bootstrapService";
import { logout as logoutRequest } from "../services/authService";
import { API_BASE } from "../api/apiBase";
import useToast from "../hooks/useToast";

export const AuthContext = createContext();

function describeAuthError(authError) {

    switch (authError) {
        case "invalid_state":
            return "Login session expired, please try again.";
        case "not_allowed":
            return "Your GitHub account isn't authorized to access this portal.";
        default:
            return "GitHub login failed.";
    }

}

// Left behind by performLogout()/performSelfClear() (see
// GlobalLogoutMonitor and PeriodicSignOutMonitor) after the hard reload
// either one triggers, so whoever lands back here understands why
// instead of it looking like an unexplained reset.
function describeLoggedOutReason(loggedOut) {

    switch (loggedOut) {
        case "deploy":
            return "You were signed out — a deployment was just triggered.";
        case "admin":
            return "You were signed out by the portal admin.";
        case "cleared":
            return "You were signed out and your saved credentials were cleared.";
        case "idle":
            return "You were signed out after 30 minutes of inactivity. Your saved credentials are still there — just sign back in.";
        default:
            return "You were signed out.";
    }

}

function clearQueryParam(params, key) {

    params.delete(key);
    const query = params.toString();

    window.history.replaceState(
        {},
        "",
        window.location.pathname + (query ? `?${query}` : "")
    );

}

export default function AuthProvider({ children }) {

    const toast = useToast();

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [oauthConfigured, setOauthConfigured] = useState(false);
    const [githubTokenConfigured, setGithubTokenConfigured] = useState(false);

    // Full IsConfigured (owner + repository + token, not just a token) —
    // what RequireGitHubSetup itself gates the setup popup on. Data-
    // fetching hooks (useGithubResources, RecentDeployments,
    // EnvironmentsCard, ActivityBell) read this too, so they don't fire
    // real GitHub API calls for a session that's still sitting at that
    // popup — those calls used to fire immediately on mount regardless,
    // burning through the 60/hour anonymous rate limit before someone
    // had even pasted a token in.
    const [githubRepoConfigured, setGithubRepoConfigured] = useState(false);

    // owner/repository (for TopBar's repo-name badge) and wasSignedOut
    // (for RequireGitHubSetup's specific-explanation banner) - both used
    // to be fetched independently by those two components via their own
    // separate GET /api/settings/me/github calls; now read straight off
    // this same bootstrap response.
    const [githubOwner, setGithubOwner] = useState("");
    const [githubRepository, setGithubRepository] = useState("");
    const [githubWasSignedOut, setGithubWasSignedOut] = useState(false);

    // The repo/owner this session pointed at right before the current one -
    // null until at least one switch has happened. Backs the Dashboard's
    // "Previously used - switch back" shortcut (see AllRepositoriesCard).
    const [githubPreviousOwner, setGithubPreviousOwner] = useState(null);
    const [githubPreviousRepository, setGithubPreviousRepository] = useState(null);

    const [tokenOwner, setTokenOwner] = useState(null);

    // Whether this session has a screen-lock PIN set — read by
    // PeriodicSignOutMonitor to decide whether its 10-minute idle prompt
    // locks (PIN set) or falls back to wiping every saved credential (no
    // PIN, the original behavior, unchanged).
    const [pinConfigured, setPinConfigured] = useState(false);

    // Drives MfaEnforcementGate - whether to show a dismissible "set up
    // MFA" nudge, whether it's mandatory (this session has an AWS/Azure/
    // GCP credential saved), and whether the 2-skip budget is already
    // spent (full-screen block). All computed server-side every bootstrap
    // call (see BootstrapController's MfaNudge block) - never decided here.
    const [mfaNudgeShow, setMfaNudgeShow] = useState(false);
    const [mfaNudgeMandatory, setMfaNudgeMandatory] = useState(false);
    const [mfaNudgeBlocked, setMfaNudgeBlocked] = useState(false);
    const [mfaNudgeSkipsUsed, setMfaNudgeSkipsUsed] = useState(0);

    // Which AWS identity (IAM username, or account/role for an SSO
    // session) this browser's saved credentials resolve to — shown as a
    // TopBar badge, the AWS equivalent of the GitHub repo-name badge.
    // Null whenever AWS isn't configured for this session at all.
    const [awsIdentityLabel, setAwsIdentityLabel] = useState(null);

    // True when THIS session has admin authority — either a real GitHub
    // OAuth login as an allowlisted username, or (see AdminGate.
    // IsAdminViaPersonalAccessTokenAsync) a configured Personal Access
    // Token that belongs to one. Lets an admin act through the PAT they
    // already use for every other GitHub call in this portal, without also
    // needing to complete OAuth login just to reach admin-only UI like
    // Sidebar Access.
    const [isAdminSession, setIsAdminSession] = useState(false);

    // True only for the single GitHub identity Database Management is
    // restricted to (see AdminGate.DenyUnlessSuperAdminAsync) — a strictly
    // narrower check than isAdminSession above. Only ever used to decide
    // whether to show the Database tile/nav entry; the real restriction is
    // enforced server-side on every api/database/* endpoint regardless of
    // what this says.
    const [isSuperAdminSession, setIsSuperAdminSession] = useState(false);

    // False until the first bootstrap call resolves. isAdminSession starts
    // false too, but that's indistinguishable from "checked, and this
    // session isn't admin" — a route guard reacting to isAdminSession
    // alone bounces a real admin away on every hard reload, since it fires
    // before this first check has had a chance to complete. Guards must
    // wait for this to be true before treating isAdminSession as final.
    const [oauthStatusChecked, setOauthStatusChecked] = useState(false);

    // True only when the bootstrap request itself failed (network error,
    // 5xx, etc.) - distinct from "checked, and nothing is configured".
    // RequireGitHubSetup fails OPEN on this (shows the app rather than the
    // setup gate) so a transient network blip can't lock someone out of
    // the whole portal - same fail-open behavior its own try/catch used to
    // implement locally before it started reading this from context.
    const [bootstrapError, setBootstrapError] = useState(false);

    // One consolidated GET /api/bootstrap call backs everything below —
    // see BootstrapController for the full list of what this used to be
    // (GET /api/auth/me, /api/settings, three redundant copies of
    // /api/settings/me/github, /api/settings/me/aws, /api/settings/me/pin,
    // and conditionally /api/github/token-owner). `refresh` and
    // `refreshOauthStatus` both existed as separately-triggered functions
    // before this - kept as two names (many Settings sub-components call
    // one, the other, or both after saving a credential) but both now just
    // re-run this same full fetch, since there's no longer a reason for a
    // "just the login" refresh distinct from a "just the settings" one.
    const loadBootstrap = useCallback(async () => {

        try {

            const response = await getBootstrap();
            const data = response.data;

            setBootstrapError(false);
            setUser(data.auth.authenticated ? { login: data.auth.login, role: data.auth.role } : null);

            setOauthConfigured(
                !!data.settings.gitHubOAuthClientId && !!data.settings.gitHubOAuthClientSecretConfigured
            );
            setIsAdminSession(!!data.settings.isAdminSession);
            setIsSuperAdminSession(!!data.settings.isSuperAdminSession);

            // "GitHub" camelCases to "gitHub" (capital H) - .NET's
            // JsonNamingPolicy.CamelCase only lowercases the leading
            // character, it doesn't know "GitHub" is meant to read as two
            // words. Confirmed against the real wire response, not assumed.
            setGithubTokenConfigured(!!data.gitHub.tokenConfigured);
            setGithubRepoConfigured(!!data.gitHub.isConfigured);
            setGithubOwner(data.gitHub.owner || "");
            setGithubRepository(data.gitHub.repository || "");
            setGithubWasSignedOut(!!data.gitHub.wasSignedOut);
            setGithubPreviousOwner(data.gitHub.previousOwner || null);
            setGithubPreviousRepository(data.gitHub.previousRepository || null);

            setAwsIdentityLabel(data.aws.identityLabel || null);
            setPinConfigured(!!data.pin.configured);
            setTokenOwner(data.tokenOwner || null);

            setMfaNudgeShow(!!data.mfaNudge?.show);
            setMfaNudgeMandatory(!!data.mfaNudge?.mandatory);
            setMfaNudgeBlocked(!!data.mfaNudge?.blocked);
            setMfaNudgeSkipsUsed(data.mfaNudge?.skipsUsed || 0);

        }
        catch (err) {

            console.error(err);
            setBootstrapError(true);

        }
        finally {

            setLoading(false);
            setOauthStatusChecked(true);

        }

    }, []);

    useEffect(() => {

        const params = new URLSearchParams(window.location.search);
        const authError = params.get("authError");

        if (authError) {
            toast.show(describeAuthError(authError), "error");
            clearQueryParam(params, "authError");
        }

        const loggedOut = params.get("loggedOut");

        if (loggedOut) {
            toast.show(describeLoggedOutReason(loggedOut));
            clearQueryParam(params, "loggedOut");
        }

        loadBootstrap();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function logout() {

        await logoutRequest();
        setUser(null);

    }

    function login() {

        window.location.href = `${API_BASE}/api/auth/github/login`;

    }

    return (

        <AuthContext.Provider value={{
            user, loading, login, logout,
            refresh: loadBootstrap, refreshOauthStatus: loadBootstrap,
            oauthConfigured, githubTokenConfigured, githubRepoConfigured,
            githubOwner, githubRepository, githubWasSignedOut,
            githubPreviousOwner, githubPreviousRepository,
            tokenOwner, canApproveReleases: !!tokenOwner?.canApprove,
            isAdminSession, isSuperAdminSession, oauthStatusChecked, bootstrapError,
            awsIdentityLabel, pinConfigured,
            mfaNudgeShow, mfaNudgeMandatory, mfaNudgeBlocked, mfaNudgeSkipsUsed
        }}>

            {children}

        </AuthContext.Provider>

    );

}

import { createContext, useCallback, useEffect, useState } from "react";

import { getMe, logout as logoutRequest } from "../services/authService";
import { getSettings, getMyGitHubSettings, getMyAwsSettings, getMyPinStatus } from "../services/settingsService";
import { getTokenOwner } from "../services/githubService";
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

    const [tokenOwner, setTokenOwner] = useState(null);

    // Whether this session has a screen-lock PIN set — read by
    // PeriodicSignOutMonitor to decide whether its 10-minute idle prompt
    // locks (PIN set) or falls back to wiping every saved credential (no
    // PIN, the original behavior, unchanged).
    const [pinConfigured, setPinConfigured] = useState(false);

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

    // False until refreshOauthStatus's first call resolves. isAdminSession
    // starts false too, but that's indistinguishable from "checked, and
    // this session isn't admin" — a route guard reacting to isAdminSession
    // alone bounces a real admin away on every hard reload, since it fires
    // before this first check has had a chance to complete. Guards must
    // wait for this to be true before treating isAdminSession as final.
    const [oauthStatusChecked, setOauthStatusChecked] = useState(false);

    const refresh = useCallback(async () => {

        setLoading(true);
        const me = await getMe();
        setUser(me);
        setLoading(false);

    }, []);

    // Covers both GitHub OAuth login and the Personal Access Token this
    // caller (a real login, or an anonymous per-browser session — see
    // PortalIdentity) has configured for their own repo — pages that gate
    // an action behind "is a PAT configured" (e.g. triggering a deployment)
    // read that here too.
    const refreshOauthStatus = useCallback(async () => {

        try {

            const [settings, myGitHub, myAws, myPin] = await Promise.all([
                getSettings(),
                getMyGitHubSettings(),
                getMyAwsSettings(),
                getMyPinStatus()
            ]);

            setAwsIdentityLabel(myAws.identityLabel || null);
            setPinConfigured(!!myPin.configured);

            setOauthConfigured(
                !!settings.gitHubOAuthClientId && !!settings.gitHubOAuthClientSecretConfigured
            );

            setIsAdminSession(!!settings.isAdminSession);

            const hasToken = !!myGitHub.gitHubTokenConfigured;
            setGithubTokenConfigured(hasToken);
            setGithubRepoConfigured(!!myGitHub.isConfigured);

            if (hasToken) {

                // Resolves who the token belongs to and whether that account
                // has admin access to the repo — the same permission GitHub
                // itself checks to let someone approve a protected-environment
                // deployment. Pages like Approvals use this to hide themselves
                // entirely rather than just showing a "no access" message.
                const owner = await getTokenOwner();
                setTokenOwner(owner.data);

            }
            else {

                setTokenOwner(null);

            }

        }
        catch (err) {

            console.error(err);

        }
        finally {

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

        refresh();
        refreshOauthStatus();

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

        <AuthContext.Provider value={{ user, loading, login, logout, refresh, oauthConfigured, githubTokenConfigured, githubRepoConfigured, tokenOwner, canApproveReleases: !!tokenOwner?.canApprove, isAdminSession, oauthStatusChecked, refreshOauthStatus, awsIdentityLabel, pinConfigured }}>

            {children}

        </AuthContext.Provider>

    );

}

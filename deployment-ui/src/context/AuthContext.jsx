import { createContext, useCallback, useEffect, useState } from "react";

import { getMe, logout as logoutRequest } from "../services/authService";
import { getSettings, getMyGitHubSettings } from "../services/settingsService";
import { getTokenOwner } from "../services/githubService";
import { API_BASE } from "../api/apiBase";
import useToast from "../hooks/useToast";

export const AuthContext = createContext();

export default function AuthProvider({ children }) {

    const toast = useToast();

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [oauthConfigured, setOauthConfigured] = useState(false);
    const [githubTokenConfigured, setGithubTokenConfigured] = useState(false);
    const [tokenOwner, setTokenOwner] = useState(null);

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

            const [settings, myGitHub] = await Promise.all([
                getSettings(),
                getMyGitHubSettings()
            ]);

            setOauthConfigured(
                !!settings.gitHubOAuthClientId && !!settings.gitHubOAuthClientSecretConfigured
            );

            setIsAdminSession(!!settings.isAdminSession);

            const hasToken = !!myGitHub.gitHubTokenConfigured;
            setGithubTokenConfigured(hasToken);

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

            toast.show(
                authError === "invalid_state"
                    ? "Login session expired, please try again."
                    : authError === "not_allowed"
                    ? "Your GitHub account isn't authorized to access this portal."
                    : "GitHub login failed.",
                "error"
            );

            params.delete("authError");
            const query = params.toString();

            window.history.replaceState(
                {},
                "",
                window.location.pathname + (query ? `?${query}` : "")
            );

        }

        // Left behind by performLogout() (see IdleLogoutMonitor and
        // GlobalLogoutMonitor) after the hard reload it triggers, so
        // whoever lands back here understands why they're signed out
        // instead of it looking like an unexplained reset.
        const loggedOut = params.get("loggedOut");

        if (loggedOut) {

            toast.show(
                loggedOut === "deploy"
                    ? "You were signed out — a deployment was just triggered."
                    : loggedOut === "admin"
                    ? "You were signed out by the portal admin."
                    : loggedOut === "background"
                    ? "You were signed out after switching away for a while."
                    : "You were signed out after a period of inactivity."
            );

            params.delete("loggedOut");
            const query = params.toString();

            window.history.replaceState(
                {},
                "",
                window.location.pathname + (query ? `?${query}` : "")
            );

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

        <AuthContext.Provider value={{ user, loading, login, logout, refresh, oauthConfigured, githubTokenConfigured, tokenOwner, canApproveReleases: !!tokenOwner?.canApprove, isAdminSession, oauthStatusChecked, refreshOauthStatus }}>

            {children}

        </AuthContext.Provider>

    );

}

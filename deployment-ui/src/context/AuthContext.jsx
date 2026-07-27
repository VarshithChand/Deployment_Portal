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

        <AuthContext.Provider value={{ user, loading, login, logout, refresh, oauthConfigured, githubTokenConfigured, tokenOwner, canApproveReleases: !!tokenOwner?.canApprove, refreshOauthStatus }}>

            {children}

        </AuthContext.Provider>

    );

}

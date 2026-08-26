import authApi from "../api/authApi";
import { clearAuthToken } from "../api/apiBase";

export const getMe = async () => {

    try {

        const response = await authApi.get("/me");
        return response.data;

    }
    catch {

        return null;

    }

};

export const logout = async () => {

    try {
        await authApi.post("/logout");
    }
    finally {
        clearAuthToken();
    }

};

// Anonymous, cheap, no external calls - safe to poll frequently.
// forceLogoutEpoch is portal-wide (see SettingsService.BumpForceLogoutEpochAsync);
// mySessionForceLogoutEpoch is scoped to just this caller's own session
// (see SessionActivityService.ForceLogout, triggered from the Services
// page's Users tab). Returns the whole object so GlobalLogoutMonitor can
// track a baseline for each independently.
export const getSessionEpoch = async () => {

    const response = await authApi.get("/session-epoch");
    return response.data;

};

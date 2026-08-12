import api from "../api/appVersionApi";

// Anonymous - every visitor, including one still stuck at the pre-login
// "connect your repo" gate, needs to be able to check this.
export const getAppVersion = async () => {
    const response = await api.get("/");
    return response.data;
};

// Admin-only server-side (see AppVersionController) - bumps the portal-
// wide counter, which prompts every visitor's browser to refresh the next
// time it polls (see utils/appCacheManager.js).
export const forceAppRefreshForAllUsers = async () => {
    const response = await api.post("/clear-cache");
    return response.data;
};

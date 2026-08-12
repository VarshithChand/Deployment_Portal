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

// Anonymous - reports this browser's own build-time commit/version/
// environment (see utils/buildInfo.js), fired once per app load (see
// App.jsx). Backs Services -> Application Support's "User Versions" view
// (admin-only to READ, not to report) - lets an admin see who's stuck on
// a stale cached build. No credentials or personal data involved, just the
// same public build stamp already visible in this browser's own JS bundle.
export const reportFrontendHeartbeat = async (commit, version, environment) => {
    const response = await api.post("/frontend-heartbeat", { commit, version, environment });
    return response.data;
};

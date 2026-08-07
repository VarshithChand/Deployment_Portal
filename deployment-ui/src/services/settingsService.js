import settingsApi from "../api/settingsApi";

export const getSettings = async () => {
    const response = await settingsApi.get("/");
    return response.data;
};

// Every logged-in user has their own GitHub repo + token — not shared
// portal-wide settings like the rest of this file.
export const getMyGitHubSettings = async () => {
    const response = await settingsApi.get("/me/github");
    return response.data;
};

export const saveMyGitHubSettings = async (payload) => {
    const response = await settingsApi.post("/me/github", payload);
    return response.data;
};

export const clearMyGitHubToken = async () => {
    const response = await settingsApi.delete("/me/github");
    return response.data;
};

// Session-scoped AWS/Azure credentials for the Environments detail view's
// live cloud lookups — same per-visitor isolation as GitHub above.
export const getMyAwsSettings = async () => {
    const response = await settingsApi.get("/me/aws");
    return response.data;
};

export const saveMyAwsSettings = async (payload) => {
    const response = await settingsApi.post("/me/aws", payload);
    return response.data;
};

export const clearMyAwsCredentials = async () => {
    const response = await settingsApi.delete("/me/aws");
    return response.data;
};

export const getMyAzureSettings = async () => {
    const response = await settingsApi.get("/me/azure");
    return response.data;
};

export const saveMyAzureSettings = async (payload) => {
    const response = await settingsApi.post("/me/azure", payload);
    return response.data;
};

export const clearMyAzureCredentials = async () => {
    const response = await settingsApi.delete("/me/azure");
    return response.data;
};

export const saveDockerSettings = async (payload) => {
    const response = await settingsApi.post("/docker", payload);
    return response.data;
};

export const saveGitHubOAuthSettings = async (payload) => {
    const response = await settingsApi.post("/github-oauth", payload);
    return response.data;
};

export const saveAdminUsernames = async (payload) => {
    const response = await settingsApi.post("/admins", payload);
    return response.data;
};

export const saveSonarSettings = async (payload) => {
    const response = await settingsApi.post("/sonar", payload);
    return response.data;
};

export const clearSettings = async (section) => {
    const response = await settingsApi.delete(`/${section}`);
    return response.data;
};

// The caller's own restrictions — used by Sidebar/App's route guard, safe
// for anyone to read since it can only ever resolve to their own session.
export const getSidebarAccess = async () => {
    const response = await settingsApi.get("/sidebar");
    return response.data;
};

// Admin-only: every PAT user the admin can pick from in Settings > Sidebar
// Access, then that one user's own restrictions to load into the editor.
export const getPatUsers = async () => {
    const response = await settingsApi.get("/sidebar/users");
    return response.data;
};

export const getUserSidebarAccess = async (key) => {
    const response = await settingsApi.get("/sidebar/user", { params: { key } });
    return response.data;
};

export const saveUserSidebarAccess = async (key, states) => {
    const response = await settingsApi.post("/sidebar/user", { states }, { params: { key } });
    return response.data;
};

export const clearUserSidebarAccess = async (key) => {
    const response = await settingsApi.delete("/sidebar/user", { params: { key } });
    return response.data;
};

export const previewGitHubRepository = async (owner, repository) => {
    const response = await settingsApi.get("/github/preview", {
        params: { owner, repository }
    });
    return response.data;
};

export const previewGitHubUserRepositories = async (username) => {
    const response = await settingsApi.get("/github/preview-user", {
        params: { username }
    });
    return response.data;
};

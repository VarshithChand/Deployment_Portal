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

export const clearSettings = async (section) => {
    const response = await settingsApi.delete(`/${section}`);
    return response.data;
};

export const getSidebarAccess = async () => {
    const response = await settingsApi.get("/sidebar");
    return response.data;
};

export const saveSidebarAccess = async (states) => {
    const response = await settingsApi.post("/sidebar", { states });
    return response.data;
};

export const previewGitHubRepository = async (owner, repository) => {
    const response = await settingsApi.get("/github/preview", {
        params: { owner, repository }
    });
    return response.data;
};

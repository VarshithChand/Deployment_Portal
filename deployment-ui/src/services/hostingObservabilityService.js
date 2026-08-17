import api from "../api/observabilityApi";

// Backs the Hosting Providers page's Frontend/Backend/Database dashboard
// (portal-wide, super-admin only) and its admin config sub-page in
// Settings. Distinct from paasService.js, which is the session-scoped
// self-service "what's under MY connected account" flow - these two never
// share a credential or a code path.

export const getObservabilityConfig = async () => {
    const response = await api.get("/config");
    return response.data;
};

export const saveObservabilityConfig = async (targets) => {
    const response = await api.post("/config", targets);
    return response.data;
};

export const getObservabilityCredentialStatus = async (provider) => {
    const response = await api.get(`/credentials/${provider}/status`);
    return response.data;
};

export const saveObservabilityCredentials = async (provider, { token, accountId }) => {
    const response = await api.post(`/credentials/${provider}`, { token, accountId });
    return response.data;
};

export const clearObservabilityCredentials = async (provider) => {
    const response = await api.delete(`/credentials/${provider}`);
    return response.data;
};

export const getFrontendOverview = async (range) => {
    const response = await api.get("/frontend", { params: { range } });
    return response.data;
};

export const getBackendOverview = async (range) => {
    const response = await api.get("/backend", { params: { range } });
    return response.data;
};

export const getDatabaseOverview = async (range) => {
    const response = await api.get("/database", { params: { range } });
    return response.data;
};

export const getEndpointInventory = async () => {
    const response = await api.get("/endpoints");
    return response.data;
};

export const getDatabaseConnectionStatus = async () => {
    const response = await api.get("/database/connection");
    return response.data;
};

export const saveDatabaseConnection = async ({ providerLabel, connectionString }) => {
    const response = await api.post("/database/connection", { providerLabel, connectionString });
    return response.data;
};

export const clearDatabaseConnection = async () => {
    const response = await api.delete("/database/connection");
    return response.data;
};

export const saveDatabaseConnectionFields = async (fields) => {
    const response = await api.post("/database/connection/fields", fields);
    return response.data;
};

export const getRenderDatabases = async () => {
    const response = await api.get("/database/render-databases");
    return response.data;
};

export const connectRenderDatabase = async (databaseId) => {
    const response = await api.post(`/database/render-databases/${encodeURIComponent(databaseId)}/connect`);
    return response.data;
};

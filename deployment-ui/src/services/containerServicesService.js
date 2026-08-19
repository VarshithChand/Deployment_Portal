import api from "../api/containerServicesApi";

// Phase 3 of the multi-cloud infrastructure console - Azure Container
// Apps and GCP Cloud Run.

// ================= Azure Container Apps =================

export const getAzureContainerApps = async () => {
    const response = await api.get("/azurecontainerapps");
    return response.data;
};

export const getAzureContainerAppDetail = async (resourceGroup, name) => {
    const response = await api.get(`/azurecontainerapps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}`);
    return response.data;
};

export const scaleAzureContainerApp = async (resourceGroup, name, minReplicas, maxReplicas) => {
    const response = await api.post(`/azurecontainerapps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}/scale`, { minReplicas, maxReplicas });
    return response.data;
};

export const startAzureContainerApp = async (resourceGroup, name) => {
    const response = await api.post(`/azurecontainerapps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}/start`);
    return response.data;
};

export const stopAzureContainerApp = async (resourceGroup, name) => {
    const response = await api.post(`/azurecontainerapps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}/stop`);
    return response.data;
};

export const restartAzureContainerAppRevision = async (resourceGroup, name, revisionName) => {
    const response = await api.post(`/azurecontainerapps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}/revisions/${encodeURIComponent(revisionName)}/restart`);
    return response.data;
};

export const deleteAzureContainerApp = async (resourceGroup, name) => {
    const response = await api.delete(`/azurecontainerapps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}`);
    return response.data;
};

export const getAzureContainerAppMetrics = async (resourceGroup, name, rangeMinutes) => {
    const response = await api.get(`/azurecontainerapps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}/metrics`, { params: { rangeMinutes } });
    return response.data;
};

// ================= GCP Cloud Run =================

export const getCloudRunServices = async () => {
    const response = await api.get("/cloudrun");
    return response.data;
};

export const scaleCloudRunService = async (name, minInstances, maxInstances) => {
    const response = await api.post(`/cloudrun/${encodeURIComponent(name)}/scale`, { minInstances, maxInstances });
    return response.data;
};

export const redeployCloudRunService = async (name) => {
    const response = await api.post(`/cloudrun/${encodeURIComponent(name)}/redeploy`);
    return response.data;
};

export const deleteCloudRunService = async (name) => {
    const response = await api.delete(`/cloudrun/${encodeURIComponent(name)}`);
    return response.data;
};

export const getCloudRunMetrics = async (name, rangeMinutes) => {
    const response = await api.get(`/cloudrun/${encodeURIComponent(name)}/metrics`, { params: { rangeMinutes } });
    return response.data;
};

// ================= Cloud Run revisions / traffic / rollback (Phase C) =================

export const getCloudRunRevisions = async (name) => {
    const response = await api.get(`/cloudrun/${encodeURIComponent(name)}/revisions`);
    return response.data;
};

export const updateCloudRunTraffic = async (name, traffic) => {
    const response = await api.post(`/cloudrun/${encodeURIComponent(name)}/traffic`, { traffic });
    return response.data;
};

export const rollbackCloudRun = async (name, revisionName) => {
    const response = await api.post(`/cloudrun/${encodeURIComponent(name)}/rollback`, { revisionName });
    return response.data;
};

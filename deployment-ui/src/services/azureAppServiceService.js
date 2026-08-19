import api from "../api/azureAppServiceApi";

// Phase B of the PaaS/Microservices console - Azure App Service +
// Deployment Slots + Swap. `slot` is omitted (undefined) for production
// actions - the backend treats a missing/production slot identically.

export const getAppServices = async () => {
    const response = await api.get("/apps");
    return response.data;
};

export const getAppServiceDetail = async (resourceGroup, name) => {
    const response = await api.get(`/apps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}`);
    return response.data;
};

function slotSuffix(slot) {
    return slot && slot !== "production" ? `/slots/${encodeURIComponent(slot)}` : "";
}

export const startAppService = async (resourceGroup, name, slot) => {
    const response = await api.post(`/apps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}${slotSuffix(slot)}/start`);
    return response.data;
};

export const stopAppService = async (resourceGroup, name, slot) => {
    const response = await api.post(`/apps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}${slotSuffix(slot)}/stop`);
    return response.data;
};

export const restartAppService = async (resourceGroup, name, slot) => {
    const response = await api.post(`/apps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}${slotSuffix(slot)}/restart`);
    return response.data;
};

export const swapSlot = async (resourceGroup, name, sourceSlot, targetSlot) => {
    const response = await api.post(`/apps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}/slots/${encodeURIComponent(sourceSlot)}/swap`, { targetSlot });
    return response.data;
};

export const bulkSwapSlots = async (items) => {
    const response = await api.post("/bulk/swap", { items });
    return response.data;
};

export const getAppServiceVariables = async (resourceGroup, name, slot) => {
    const response = await api.get(`/apps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}/variables`, { params: { slot } });
    return response.data;
};

export const updateAppServiceVariable = async (resourceGroup, name, slot, varName, value) => {
    const response = await api.put(`/apps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}/variables`, { name: varName, value }, { params: { slot } });
    return response.data;
};

export const scaleAppServicePlan = async (resourceGroup, name, capacity) => {
    const response = await api.post(`/apps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}/scale`, { capacity });
    return response.data;
};

export const deleteAppService = async (resourceGroup, name) => {
    const response = await api.delete(`/apps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}`);
    return response.data;
};

export const deleteAppServiceSlot = async (resourceGroup, name, slot) => {
    const response = await api.delete(`/apps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}/slots/${encodeURIComponent(slot)}`);
    return response.data;
};

export const getAppServiceMetrics = async (resourceGroup, name, slot, rangeMinutes) => {
    const response = await api.get(`/apps/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(name)}/metrics`, { params: { slot, rangeMinutes } });
    return response.data;
};

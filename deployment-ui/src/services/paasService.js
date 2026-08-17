import api from "../api/paasApi";

export const getPaasStatus = async (provider) => {
    const response = await api.get(`/${provider}/status`);
    return response.data;
};

export const savePaasCredentials = async (provider, { token, accountId }) => {
    const response = await api.post(`/${provider}/credentials`, { token, accountId });
    return response.data;
};

export const clearPaasCredentials = async (provider) => {
    const response = await api.delete(`/${provider}/credentials`);
    return response.data;
};

// On-demand usage metrics for one of this session's own connected
// services (currently only Render returns real series - see
// PaasProviderService.GetServiceMetricsAsync).
export const getPaasServiceMetrics = async (provider, serviceId) => {
    const response = await api.get(`/${provider}/services/${encodeURIComponent(serviceId)}/metrics`);
    return response.data;
};

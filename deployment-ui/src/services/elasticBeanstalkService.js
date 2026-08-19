import api from "../api/elasticBeanstalkApi";

// Phase A of the PaaS/Microservices console - AWS Elastic Beanstalk.

export const getEbApplications = async () => {
    const response = await api.get("/applications");
    return response.data;
};

export const getEbEnvironments = async () => {
    const response = await api.get("/environments");
    return response.data;
};

export const getEbEnvironmentDetail = async (environmentName) => {
    const response = await api.get(`/environments/${encodeURIComponent(environmentName)}`);
    return response.data;
};

export const getEbApplicationVersions = async (applicationName) => {
    const response = await api.get(`/applications/${encodeURIComponent(applicationName)}/versions`);
    return response.data;
};

export const deployEbVersion = async (environmentName, versionLabel) => {
    const response = await api.post(`/environments/${encodeURIComponent(environmentName)}/deploy`, { versionLabel });
    return response.data;
};

export const restartEbAppServer = async (environmentName) => {
    const response = await api.post(`/environments/${encodeURIComponent(environmentName)}/restart`);
    return response.data;
};

export const rebuildEbEnvironment = async (environmentName) => {
    const response = await api.post(`/environments/${encodeURIComponent(environmentName)}/rebuild`);
    return response.data;
};

export const scaleEbEnvironment = async (environmentName, minSize, maxSize) => {
    const response = await api.post(`/environments/${encodeURIComponent(environmentName)}/scale`, { minSize, maxSize });
    return response.data;
};

export const updateEbEnvironmentVariable = async (environmentName, name, value) => {
    const response = await api.put(`/environments/${encodeURIComponent(environmentName)}/variables`, { name, value });
    return response.data;
};

export const getEbEnvironmentEvents = async (environmentName) => {
    const response = await api.get(`/environments/${encodeURIComponent(environmentName)}/events`);
    return response.data;
};

export const getEbEnvironmentMetrics = async (environmentName, autoScalingGroupName, rangeMinutes) => {
    const response = await api.get(`/environments/${encodeURIComponent(environmentName)}/metrics`, { params: { autoScalingGroupName, rangeMinutes } });
    return response.data;
};

export const terminateEbEnvironment = async (environmentName) => {
    const response = await api.delete(`/environments/${encodeURIComponent(environmentName)}`);
    return response.data;
};

import sonarApi from "../api/sonarApi";

// SonarQube ("sonarqube") and SonarCloud ("sonarcloud") are two fully
// independent, portal-wide credentials now (previously one shared
// connection covered both) - every call here takes a provider.

export const getSonarOverview = async (provider) => {
    const response = await sonarApi.get(`/${provider}/overview`);
    return response.data;
};

export const getSonarStatus = async (provider) => {
    const response = await sonarApi.get(`/${provider}/status`);
    return response.data;
};

export const saveSonarCredentials = async (provider, payload) => {
    const response = await sonarApi.post(`/${provider}`, payload);
    return response.data;
};

export const clearSonarCredentials = async (provider) => {
    const response = await sonarApi.delete(`/${provider}`);
    return response.data;
};

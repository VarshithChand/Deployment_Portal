import api from "../api/cloudServicesApi";

// ACR and Artifact Registry calls live on the same api/cloudservices
// controller ECR already does (CloudServicesController) - reusing that
// same api client rather than standing up a second one for the same
// backend route prefix. ECR itself is called via cloudServicesService.js
// as before; this file only covers the two new providers.

export const getAcrRegistries = async () => {
    const response = await api.get("/acr");
    return response.data;
};

export const getAcrRepositories = async (loginServer) => {
    const response = await api.get(`/acr/${encodeURIComponent(loginServer)}/repositories`);
    return response.data;
};

export const getAcrTags = async (loginServer, repositoryName) => {
    const response = await api.get(`/acr/${encodeURIComponent(loginServer)}/repositories/${encodeURIComponent(repositoryName)}/tags`);
    return response.data;
};

export const getArtifactRegistryRepositories = async () => {
    const response = await api.get("/artifactregistry");
    return response.data;
};

export const getArtifactRegistryImages = async (repositoryName) => {
    const response = await api.get(`/artifactregistry/${encodeURIComponent(repositoryName)}/images`);
    return response.data;
};

import api from "../api/cloudServicesApi";
import registryApi from "../api/containerRegistryApi";

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

// Docker Hub and GHCR - portal-wide, shared credential (one admin connects
// each once, see ContainerRegistryController) - a separate backend
// controller/route prefix from ECR/ACR/Artifact Registry above, so these use
// their own api client (containerRegistryApi.js) rather than cloudServicesApi.

export const getDockerHubStatus = async () => {
    const response = await registryApi.get("/dockerhub/status");
    return response.data;
};

export const saveDockerHubCredentials = async (payload) => {
    const response = await registryApi.post("/dockerhub", payload);
    return response.data;
};

export const clearDockerHubCredentials = async () => {
    const response = await registryApi.delete("/dockerhub");
    return response.data;
};

export const getDockerHubRepositories = async () => {
    const response = await registryApi.get("/dockerhub/repositories");
    return response.data;
};

export const getDockerHubTags = async (repositoryName) => {
    const response = await registryApi.get(`/dockerhub/repositories/${encodeURIComponent(repositoryName)}/tags`);
    return response.data;
};

export const getGhcrStatus = async () => {
    const response = await registryApi.get("/ghcr/status");
    return response.data;
};

export const saveGhcrCredentials = async (payload) => {
    const response = await registryApi.post("/ghcr", payload);
    return response.data;
};

export const clearGhcrCredentials = async () => {
    const response = await registryApi.delete("/ghcr");
    return response.data;
};

export const getGhcrPackages = async () => {
    const response = await registryApi.get("/ghcr/packages");
    return response.data;
};

export const getGhcrVersions = async (packageName) => {
    const response = await registryApi.get(`/ghcr/packages/${encodeURIComponent(packageName)}/versions`);
    return response.data;
};

// GitLab Container Registry - portal-wide, shared credential, but its own
// dedicated shape (HostUrl, ProjectId, Token) rather than the generic
// {accountId, token} pair Docker Hub/GHCR use above - see
// ContainerRegistryDtos.cs's own comment on why.

export const getGitLabRegistryStatus = async () => {
    const response = await registryApi.get("/gitlab-registry/status");
    return response.data;
};

export const saveGitLabRegistryCredentials = async (payload) => {
    const response = await registryApi.post("/gitlab-registry", payload);
    return response.data;
};

export const clearGitLabRegistryCredentials = async () => {
    const response = await registryApi.delete("/gitlab-registry");
    return response.data;
};

export const getGitLabRepositories = async () => {
    const response = await registryApi.get("/gitlab-registry/repositories");
    return response.data;
};

export const getGitLabTags = async (repositoryId) => {
    const response = await registryApi.get(`/gitlab-registry/repositories/${encodeURIComponent(repositoryId)}/tags`);
    return response.data;
};

// JFrog Artifactory - portal-wide, shared credential, its own dedicated
// shape (HostUrl, Token) - every Artifactory instance is its own domain.

export const getJfrogStatus = async () => {
    const response = await registryApi.get("/jfrog/status");
    return response.data;
};

export const saveJfrogCredentials = async (payload) => {
    const response = await registryApi.post("/jfrog", payload);
    return response.data;
};

export const clearJfrogCredentials = async () => {
    const response = await registryApi.delete("/jfrog");
    return response.data;
};

export const getJfrogRepositories = async () => {
    const response = await registryApi.get("/jfrog/repositories");
    return response.data;
};

export const getJfrogImages = async (repositoryKey) => {
    const response = await registryApi.get(`/jfrog/repositories/${encodeURIComponent(repositoryKey)}/images`);
    return response.data;
};

export const getJfrogTags = async (repositoryKey, imageName) => {
    const response = await registryApi.get(
        `/jfrog/repositories/${encodeURIComponent(repositoryKey)}/images/${encodeURIComponent(imageName)}/tags`
    );
    return response.data;
};

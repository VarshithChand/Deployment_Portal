import azureDevOpsApi from "../api/azureDevOpsApi";

// Session-scoped credential (Organization + PAT) - each visitor connects
// their own, isolated from every other visitor. Powers all four Source
// Control sub-pages below.

export const getAzureDevOpsStatus = async () => {
    const response = await azureDevOpsApi.get("/status");
    return response.data;
};

export const saveAzureDevOpsCredentials = async (payload) => {
    const response = await azureDevOpsApi.post("/credentials", payload);
    return response.data;
};

export const clearAzureDevOpsCredentials = async () => {
    const response = await azureDevOpsApi.delete("/credentials");
    return response.data;
};

export const getAzureDevOpsProjects = async () => {
    const response = await azureDevOpsApi.get("/projects");
    return response.data;
};

// ---- Branches: repositories -> branches ----

export const getAzureDevOpsRepositories = async () => {
    const response = await azureDevOpsApi.get("/repositories");
    return response.data;
};

export const getAzureDevOpsBranches = async (project, repositoryId) => {
    const response = await azureDevOpsApi.get(
        `/projects/${encodeURIComponent(project)}/repositories/${encodeURIComponent(repositoryId)}/branches`
    );
    return response.data;
};

// ---- Pipelines: pipelines -> runs ----

export const getAzureDevOpsPipelines = async (project) => {
    const response = await azureDevOpsApi.get(`/projects/${encodeURIComponent(project)}/pipelines`);
    return response.data;
};

export const getAzureDevOpsRuns = async (project, pipelineId) => {
    const response = await azureDevOpsApi.get(`/projects/${encodeURIComponent(project)}/pipelines/${pipelineId}/runs`);
    return response.data;
};

// ---- Build Artifacts: pipelines -> runs -> artifacts ----

export const getAzureDevOpsArtifacts = async (project, runId) => {
    const response = await azureDevOpsApi.get(`/projects/${encodeURIComponent(project)}/runs/${runId}/artifacts`);
    return response.data;
};

// ---- Package Feeds: feeds -> packages -> versions ----

export const getAzureDevOpsFeeds = async () => {
    const response = await azureDevOpsApi.get("/feeds");
    return response.data;
};

export const getAzureDevOpsPackages = async (feedId) => {
    const response = await azureDevOpsApi.get(`/feeds/${encodeURIComponent(feedId)}/packages`);
    return response.data;
};

export const getAzureDevOpsPackageVersions = async (feedId, packageId) => {
    const response = await azureDevOpsApi.get(
        `/feeds/${encodeURIComponent(feedId)}/packages/${encodeURIComponent(packageId)}/versions`
    );
    return response.data;
};

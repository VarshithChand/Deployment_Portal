import azureDevOpsApi from "../api/azureDevOpsApi";

// Session-scoped credential (Organization + PAT) - each visitor connects
// their own, isolated from every other visitor. Powers every Source
// Control sub-page below.

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

// ---- Dashboard: running pipelines for the selected project ----

export const getAzureDevOpsRunningBuilds = async (project) => {
    const response = await azureDevOpsApi.get(`/projects/${encodeURIComponent(project)}/running-builds`);
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

export const createAzureDevOpsBranch = async (project, repositoryId, newBranchName, sourceObjectId) => {
    const response = await azureDevOpsApi.post(
        `/projects/${encodeURIComponent(project)}/repositories/${encodeURIComponent(repositoryId)}/branches`,
        { newBranchName, sourceObjectId }
    );
    return response.data;
};

export const deleteAzureDevOpsBranch = async (project, repositoryId, branchName, objectId) => {
    const response = await azureDevOpsApi.delete(
        `/projects/${encodeURIComponent(project)}/repositories/${encodeURIComponent(repositoryId)}/branches/${encodeURIComponent(branchName)}`,
        { params: { objectId } }
    );
    return response.data;
};

// ---- Pipelines: pipelines -> runs ----

export const getAzureDevOpsPipelines = async (project) => {
    const response = await azureDevOpsApi.get(`/projects/${encodeURIComponent(project)}/pipelines`);
    return response.data;
};

// Resolved on demand right before showing a branch picker for one specific
// pipeline (its linked repository isn't part of the plain pipeline list).
export const getAzureDevOpsPipelineDetail = async (project, pipelineId) => {
    const response = await azureDevOpsApi.get(`/projects/${encodeURIComponent(project)}/pipelines/${pipelineId}`);
    return response.data;
};

export const getAzureDevOpsRuns = async (project, pipelineId) => {
    const response = await azureDevOpsApi.get(`/projects/${encodeURIComponent(project)}/pipelines/${pipelineId}/runs`);
    return response.data;
};

// Triggers a new run - against the pipeline's own default branch if branch
// is omitted, or a specific one if given. Self-service, no confirmation/
// gating on this call itself (the frontend confirms before calling it -
// see AzureDevOpsPipelinesView.jsx).
export const runAzureDevOpsPipeline = async (project, pipelineId, branch) => {
    const response = await azureDevOpsApi.post(`/projects/${encodeURIComponent(project)}/pipelines/${pipelineId}/runs`, { branch });
    return response.data;
};

// ---- Build Artifacts: pipelines -> latest run's artifacts ----

export const getAzureDevOpsLatestArtifacts = async (project, pipelineId) => {
    const response = await azureDevOpsApi.get(`/projects/${encodeURIComponent(project)}/pipelines/${pipelineId}/latest-artifacts`);
    return response.data;
};

// ---- Pull Requests: list / approve / complete ----

export const getAzureDevOpsPullRequests = async (project) => {
    const response = await azureDevOpsApi.get(`/projects/${encodeURIComponent(project)}/pullrequests`);
    return response.data;
};

export const approveAzureDevOpsPullRequest = async (project, repositoryId, pullRequestId) => {
    const response = await azureDevOpsApi.post(
        `/projects/${encodeURIComponent(project)}/repositories/${encodeURIComponent(repositoryId)}/pullrequests/${pullRequestId}/approve`
    );
    return response.data;
};

export const completeAzureDevOpsPullRequest = async (project, repositoryId, pullRequestId) => {
    const response = await azureDevOpsApi.post(
        `/projects/${encodeURIComponent(project)}/repositories/${encodeURIComponent(repositoryId)}/pullrequests/${pullRequestId}/complete`
    );
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

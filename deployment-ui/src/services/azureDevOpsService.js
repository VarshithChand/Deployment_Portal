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

// ---- History: every run across every pipeline in the project ----

export const getAzureDevOpsHistory = async (project) => {
    const response = await azureDevOpsApi.get(`/projects/${encodeURIComponent(project)}/history`);
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

// A pipeline's own declared runtime parameters (its YAML file's top-level
// `parameters:` list) - resolved from the same repositoryId/yamlPath
// getAzureDevOpsPipelineDetail already returns, right before showing the
// Run form's parameter fields.
export const getAzureDevOpsPipelineParameters = async (project, repositoryId, yamlPath) => {
    const response = await azureDevOpsApi.get(
        `/projects/${encodeURIComponent(project)}/repositories/${encodeURIComponent(repositoryId)}/parameters`,
        { params: { yamlPath } }
    );
    return response.data;
};

// Triggers a new run - against the pipeline's own default branch if branch
// is omitted, or a specific one if given, with whatever values were filled
// in for the pipeline's own declared parameters (templateParameters,
// keyed by parameter name). Self-service, no confirmation/gating on this
// call itself (the frontend confirms before calling it - see
// AzureDevOpsPipelinesView.jsx).
export const runAzureDevOpsPipeline = async (project, pipelineId, branch, templateParameters) => {
    const response = await azureDevOpsApi.post(
        `/projects/${encodeURIComponent(project)}/pipelines/${pipelineId}/runs`,
        { branch, templateParameters }
    );
    return response.data;
};

// ---- Build Artifacts: pipelines -> every recent run's own artifacts ----

export const getAzureDevOpsArtifactHistory = async (project, pipelineId) => {
    const response = await azureDevOpsApi.get(`/projects/${encodeURIComponent(project)}/pipelines/${pipelineId}/artifact-history`);
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

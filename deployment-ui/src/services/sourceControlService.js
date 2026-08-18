import sourceControlApi from "../api/sourceControlApi";

// Azure Repos - portal-wide, shared credential (Organization + PAT).

export const getAzureReposStatus = async () => {
    const response = await sourceControlApi.get("/azureRepos/status");
    return response.data;
};

export const saveAzureReposCredentials = async (payload) => {
    const response = await sourceControlApi.post("/azureRepos", payload);
    return response.data;
};

export const clearAzureReposCredentials = async () => {
    const response = await sourceControlApi.delete("/azureRepos");
    return response.data;
};

export const getAzureReposRepositories = async () => {
    const response = await sourceControlApi.get("/azureRepos/repositories");
    return response.data;
};

export const getAzureReposBranches = async (project, repositoryId) => {
    const response = await sourceControlApi.get(
        `/azureRepos/projects/${encodeURIComponent(project)}/repositories/${encodeURIComponent(repositoryId)}/branches`
    );
    return response.data;
};

// AWS CodeCommit - reuses this session's own AWS credentials, no separate
// credential to set up here.

export const getCodeCommitRepositories = async () => {
    const response = await sourceControlApi.get("/codeCommit/repositories");
    return response.data;
};

export const getCodeCommitBranches = async (repositoryName) => {
    const response = await sourceControlApi.get(`/codeCommit/repositories/${encodeURIComponent(repositoryName)}/branches`);
    return response.data;
};

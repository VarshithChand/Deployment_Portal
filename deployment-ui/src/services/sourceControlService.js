import sourceControlApi from "../api/sourceControlApi";

// AWS CodeCommit only - Azure DevOps moved to its own azureDevOpsService.js
// (it grew from one repos-browsing page into four). Reuses this session's
// own AWS credentials, no separate credential to set up here.

export const getCodeCommitRepositories = async () => {
    const response = await sourceControlApi.get("/codeCommit/repositories");
    return response.data;
};

export const getCodeCommitBranches = async (repositoryName) => {
    const response = await sourceControlApi.get(`/codeCommit/repositories/${encodeURIComponent(repositoryName)}/branches`);
    return response.data;
};

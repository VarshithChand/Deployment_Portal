import api from "../api/githubApi";

// force=true bypasses the backend's 20s cache — used for a user-initiated
// "Refresh" click, which should actually fetch new data rather than
// silently handing back whatever was already cached. Automatic polling
// leaves this false so it keeps getting served from cache, which is what
// keeps polling from burning through GitHub's rate limit.
export const getRepository = async (force = false) => {
    return await api.get("/repository", { params: force ? { force: true } : {} });
};

export const getBranches = async (force = false) => {
    return await api.get("/branches", { params: force ? { force: true } : {} });
};

export const getRateLimit = async () => {
    return await api.get("/rate-limit");
};

export const getTokenOwner = async () => {
    return await api.get("/token-owner");
};

export const getAccountRepositories = async () => {
    return await api.get("/account-repositories");
};

export const getArtifacts = async (force = false) => {
    return await api.get("/artifacts", { params: force ? { force: true } : {} });
};

export const deleteArtifact = async (id) => {
    return await api.delete(`/artifacts/${id}`);
};

export const getDockerImages = async () => {
    return await api.get("/docker-images");
};

export const getWorkflows = async (force = false) => {
    return await api.get("/workflows", { params: force ? { force: true } : {} });
};

export const getWorkflowInputs = async (path, branch) => {
    return await api.get("/workflow-inputs", { params: { path, branch } });
};

export const getWorkflowYaml = async (path, branch) => {
    return await api.get("/workflow-yaml", { params: { path, branch } });
};

export const explainPipeline = async (path, branch) => {
    return await api.get("/explain-pipeline", { params: { path, branch } });
};

export const getLastRun = async (workflow, branch) => {
    return await api.get("/workflows/last-run", { params: { workflow, branch } });
};
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

// Dashboard's "all your repos" container — recent runs (not just the
// single latest one - a repo can have more than one workflow running at
// once) for a repo other than the one this session is pointed at. Cached
// 20s per-repo server-side, so polling this across a page of cards doesn't
// burn through the rate limit on its own.
export const getRepoRuns = async (owner, repo) => {
    return await api.get("/repo-runs", { params: { owner, repo } });
};

// Batched version of getRepoRuns - one request for every repo in the grid
// instead of one per repo. `repos` is [{ owner, repo }, ...]; the response
// is a { "owner/repo": [...runs] } map.
export const getRepoRunsBulk = async (repos) => {
    return await api.post("/repo-runs/bulk", { repos });
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

export const getCodeQlAlerts = async (force = false) => {
    return await api.get("/code-scanning-alerts", { params: force ? { force: true } : {} });
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
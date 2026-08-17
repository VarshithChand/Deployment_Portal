import api from "../api/pullRequestsApi";

export const getOpenPullRequests = async (force = false) => {
    return await api.get("/", { params: force ? { force: true } : {} });
};

export const getPullRequestCount = async () => {
    return await api.get("/count");
};

export const getPullRequestHistory = async (force = false) => {
    return await api.get("/history", { params: force ? { force: true } : {} });
};

export const getRecentCommits = async (force = false) => {
    return await api.get("/commits", { params: force ? { force: true } : {} });
};

export const approvePullRequest = async (number) => {
    return await api.post(`/${number}/approve`);
};

export const mergePullRequest = async (number) => {
    return await api.post(`/${number}/merge`);
};

// labels is a plain comma-separated string, matching CreateIssueRequestDto
// on the backend (split there, not here) - same convention this app
// already uses for other short multi-value text fields.
export const createIssue = async (title, body, labels) => {
    return await api.post("/issues", { title, body, labels });
};

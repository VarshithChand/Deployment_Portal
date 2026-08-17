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

// labels/assignees are plain comma-separated strings, matching
// CreateIssueRequestDto on the backend (split there, not here) - same
// convention this app already uses for other short multi-value text
// fields. milestone is the milestone number (or null); projectId is a
// ProjectsV2 GraphQL node ID (or null) - see GetIssueProjects below.
export const createIssue = async (title, body, labels, assignees, milestone, projectId) => {
    return await api.post("/issues", { title, body, labels, assignees, milestone, projectId });
};

export const getIssueMilestones = async () => {
    return await api.get("/issues/milestones");
};

export const getIssueProjects = async () => {
    return await api.get("/issues/projects");
};

export const getIssueAssignableUsers = async () => {
    return await api.get("/issues/assignable-users");
};

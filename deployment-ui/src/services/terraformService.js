import terraformApi from "../api/terraformApi";

// Personal (non-org) Terraform page. Each uploaded folder is its own
// PROJECT (own file tree, own Explain/Preview/Plan/Apply) - see
// SettingsService.ListUserTerraformProjectsAsync's own comment for why
// that replaced one flat file list per user. Credentials stay
// project-independent (one Service Principal for all your projects).
// explain/preview/plan/apply below actually reach out (preview/explain to
// the AI Assistant; plan/apply to real Azure) - see TerraformController.cs's
// own header comment for the full reasoning.

export const getTerraformCredentials = async () => {
    const response = await terraformApi.get("/credentials");
    return response.data;
};

export const saveTerraformCredentials = async (payload) => {
    const response = await terraformApi.post("/credentials", payload);
    return response.data;
};

export const clearTerraformCredentials = async () => {
    const response = await terraformApi.delete("/credentials");
    return response.data;
};

export const listTerraformProjects = async () => {
    const response = await terraformApi.get("/projects");
    return response.data;
};

// files: [{ fileName, content }] - fileName may contain "/" (folder
// structure preserved). Creates a brand new project.
export const createTerraformProject = async (name, files) => {
    const response = await terraformApi.post("/projects", { name, files });
    return response.data;
};

export const getTerraformProject = async (projectId) => {
    const response = await terraformApi.get(`/projects/${projectId}`);
    return response.data;
};

export const deleteTerraformProject = async (projectId) => {
    const response = await terraformApi.delete(`/projects/${projectId}`);
    return response.data;
};

// Encodes each path segment separately (joined back with literal "/") -
// encodeURIComponent on the whole path would turn "/" into "%2F", which
// Kestrel rejects in a raw URL by default. The backend's catch-all
// {*fileName} route expects real "/" characters to split the segments,
// same as any normal nested URL path.
function encodeFilePath(fileName) {
    return fileName.split("/").map(encodeURIComponent).join("/");
}

// Upsert-by-path into an EXISTING project - re-syncing after local edits,
// or adding files missed on the first upload.
export const uploadFilesToProject = async (projectId, files) => {
    const response = await terraformApi.post(`/projects/${projectId}/files`, { files });
    return response.data;
};

export const getTerraformProjectFile = async (projectId, fileName) => {
    const response = await terraformApi.get(`/projects/${projectId}/files/${encodeFilePath(fileName)}`);
    return response.data;
};

export const updateTerraformProjectFile = async (projectId, fileName, content) => {
    const response = await terraformApi.put(`/projects/${projectId}/files/${encodeFilePath(fileName)}`, { content });
    return response.data;
};

export const deleteTerraformProjectFile = async (projectId, fileName) => {
    const response = await terraformApi.delete(`/projects/${projectId}/files/${encodeFilePath(fileName)}`);
    return response.data;
};

// Read-only AI summary of everything in this project - no Azure calls.
export const explainTerraformProject = async (projectId) => {
    const response = await terraformApi.post(`/projects/${projectId}/explain`);
    return response.data;
};

// The "fake plan" - deterministic resource extraction + an AI narrative,
// never touches Azure, never runs terraform. Safe to call anytime.
export const previewTerraformProject = async (projectId) => {
    const response = await terraformApi.post(`/projects/${projectId}/preview`);
    return response.data;
};

// Real execution - see TerraformExecutionService.cs's own header comment.
export const planTerraformProject = async (projectId) => {
    const response = await terraformApi.post(`/projects/${projectId}/plan`);
    return response.data;
};

export const applyTerraformProject = async (projectId, planId, confirmationText) => {
    const response = await terraformApi.post(`/projects/${projectId}/apply`, { planId, confirmationText });
    return response.data;
};

import terraformApi from "../api/terraformApi";

// Personal (non-org) Terraform page. File/credential storage is low-risk;
// explain/plan/apply below actually run real terraform against the user's
// real Azure subscription - see TerraformController.cs's own header
// comment for the full reasoning.

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

export const listTerraformFiles = async () => {
    const response = await terraformApi.get("/files");
    return response.data;
};

// Encodes each path segment separately (joined back with literal "/") -
// encodeURIComponent on the whole path would turn "/" into "%2F", which
// Kestrel rejects in a raw URL by default. The backend's [HttpGet("files/
// {*fileName}")] catch-all route expects real "/" characters to split the
// segments, same as any normal nested URL path.
function encodeFilePath(fileName) {
    return fileName.split("/").map(encodeURIComponent).join("/");
}

export const getTerraformFile = async (fileName) => {
    const response = await terraformApi.get(`/files/${encodeFilePath(fileName)}`);
    return response.data;
};

// files: [{ fileName, content }] - upsert by name, see
// UploadUserTerraformFilesAsync's own comment for why re-uploading the
// same folder is the expected everyday flow rather than an error case.
export const uploadTerraformFiles = async (files) => {
    const response = await terraformApi.post("/files", { files });
    return response.data;
};

export const updateTerraformFile = async (fileName, content) => {
    const response = await terraformApi.put(`/files/${encodeFilePath(fileName)}`, { content });
    return response.data;
};

export const deleteTerraformFile = async (fileName) => {
    const response = await terraformApi.delete(`/files/${encodeFilePath(fileName)}`);
    return response.data;
};

// Read-only AI summary of everything currently stored - no Azure calls.
export const explainTerraformFiles = async () => {
    const response = await terraformApi.post("/explain");
    return response.data;
};

// Real execution - see TerraformExecutionService.cs's own header comment.
export const planTerraform = async () => {
    const response = await terraformApi.post("/plan");
    return response.data;
};

export const applyTerraform = async (planId, confirmationText) => {
    const response = await terraformApi.post("/apply", { planId, confirmationText });
    return response.data;
};

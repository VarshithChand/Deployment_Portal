import terraformApi from "../api/terraformApi";

// Personal (non-org) Terraform page - storage/editing only, no execution.
// See TerraformController.cs's own header comment for the full reasoning.

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

export const getTerraformFile = async (fileName) => {
    const response = await terraformApi.get(`/files/${encodeURIComponent(fileName)}`);
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
    const response = await terraformApi.put(`/files/${encodeURIComponent(fileName)}`, { content });
    return response.data;
};

export const deleteTerraformFile = async (fileName) => {
    const response = await terraformApi.delete(`/files/${encodeURIComponent(fileName)}`);
    return response.data;
};

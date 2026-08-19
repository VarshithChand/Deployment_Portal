import api from "../api/cloudServicesApi";

// EC2/ECS reads reuse settingsService's getMyAwsEc2Detail/getMyAwsEcsDetail
// (already fetch everything these pages need) - only the write actions and
// the resource lists that didn't exist before this feature live here.

// ================= EC2 actions =================

export const startEc2Instance = async (instanceId) => {
    const response = await api.post(`/ec2/${encodeURIComponent(instanceId)}/start`);
    return response.data;
};

export const stopEc2Instance = async (instanceId) => {
    const response = await api.post(`/ec2/${encodeURIComponent(instanceId)}/stop`);
    return response.data;
};

export const rebootEc2Instance = async (instanceId) => {
    const response = await api.post(`/ec2/${encodeURIComponent(instanceId)}/reboot`);
    return response.data;
};

export const terminateEc2Instance = async (instanceId) => {
    const response = await api.post(`/ec2/${encodeURIComponent(instanceId)}/terminate`);
    return response.data;
};

// ================= ECS actions =================

export const scaleEcsService = async (cluster, service, desiredCount) => {
    const response = await api.post("/ecs/scale", { cluster, service, desiredCount });
    return response.data;
};

// ================= ECR =================

export const getEcrRepositories = async () => {
    const response = await api.get("/ecr");
    return response.data;
};

export const getEcrImages = async (repositoryName) => {
    const response = await api.get(`/ecr/${encodeURIComponent(repositoryName)}/images`);
    return response.data;
};

export const createEcrRepository = async (name) => {
    const response = await api.post("/ecr", { name });
    return response.data;
};

export const deleteEcrRepository = async (repositoryName) => {
    const response = await api.delete(`/ecr/${encodeURIComponent(repositoryName)}`);
    return response.data;
};

// ================= Lambda / RDS (read-only) =================

export const getLambdaFunctions = async () => {
    const response = await api.get("/lambda");
    return response.data;
};

export const getRdsInstances = async () => {
    const response = await api.get("/rds");
    return response.data;
};

// ================= Azure Virtual Machines =================
// Real write access (start/stop/restart/delete/create) - the Azure
// equivalent of the EC2 actions above.

export const getAzureVms = async () => {
    const response = await api.get("/azurevm");
    return response.data;
};

export const startAzureVm = async (resourceGroup, vmName) => {
    const response = await api.post(`/azurevm/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(vmName)}/start`);
    return response.data;
};

export const stopAzureVm = async (resourceGroup, vmName) => {
    const response = await api.post(`/azurevm/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(vmName)}/stop`);
    return response.data;
};

export const restartAzureVm = async (resourceGroup, vmName) => {
    const response = await api.post(`/azurevm/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(vmName)}/restart`);
    return response.data;
};

export const deleteAzureVm = async (resourceGroup, vmName) => {
    const response = await api.delete(`/azurevm/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(vmName)}`);
    return response.data;
};

export const createAzureVm = async (payload) => {
    const response = await api.post("/azurevm", payload);
    return response.data;
};

export const getAzureVmCatalog = async () => {
    const response = await api.get("/azurevm/catalog");
    return response.data;
};

// ================= Azure resource detail (generic view/read) =================
// Cloud Services' Azure page's "click into any resource, not just a VM"
// detail panel - resourceId/resourceType come straight off an inventory
// item (see getMyAzureResources in settingsService.js).

export const getAzureResourceDetail = async (resourceId, resourceType) => {
    const response = await api.get("/azureresource", { params: { resourceId, resourceType } });
    return response.data;
};

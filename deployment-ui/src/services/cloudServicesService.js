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

// ================= ECS detail / tasks / logs / metrics / bulk scale / running image =================
// Phase 2 of the multi-cloud infrastructure console - the fuller ECS
// console beyond the desired-count scale above.

export const getEcsServiceDetail = async (cluster, service) => {
    const response = await api.get(`/ecs/${encodeURIComponent(cluster)}/${encodeURIComponent(service)}/detail`);
    return response.data;
};

export const restartEcsService = async (cluster, service) => {
    const response = await api.post(`/ecs/${encodeURIComponent(cluster)}/${encodeURIComponent(service)}/restart`);
    return response.data;
};

export const stopEcsTask = async (cluster, taskId) => {
    const response = await api.post(`/ecs/${encodeURIComponent(cluster)}/tasks/${encodeURIComponent(taskId)}/stop`);
    return response.data;
};

export const bulkScaleEcsServices = async (services, desiredCount) => {
    const response = await api.post("/ecs/scale/bulk", { services, desiredCount });
    return response.data;
};

export const getEcsMetrics = async (cluster, service, rangeMinutes) => {
    const response = await api.get(`/ecs/${encodeURIComponent(cluster)}/${encodeURIComponent(service)}/metrics`, { params: { rangeMinutes } });
    return response.data;
};

export const getEcsTaskLogs = async (cluster, taskId, container, rangeMinutes) => {
    const response = await api.get(`/ecs/${encodeURIComponent(cluster)}/tasks/${encodeURIComponent(taskId)}/logs`, { params: { container, rangeMinutes } });
    return response.data;
};

export const getEcsRunningImage = async (cluster, service) => {
    const response = await api.get(`/ecs/${encodeURIComponent(cluster)}/${encodeURIComponent(service)}/image`);
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

// ================= EC2 detail / firewall / metrics =================
// Phase 1 of the multi-cloud infrastructure console - real per-resource
// detail beyond the management list above.

export const getEc2InstanceDetail = async (instanceId, region) => {
    const response = await api.get(`/ec2/${encodeURIComponent(instanceId)}`, { params: { region } });
    return response.data;
};

export const getEc2Firewall = async (instanceId, region) => {
    const response = await api.get(`/ec2/${encodeURIComponent(instanceId)}/firewall`, { params: { region } });
    return response.data;
};

export const addEc2FirewallRule = async (instanceId, rule, region) => {
    const response = await api.post(`/ec2/${encodeURIComponent(instanceId)}/firewall`, rule, { params: { region } });
    return response.data;
};

export const removeEc2FirewallRule = async (instanceId, rule, region) => {
    const response = await api.delete(`/ec2/${encodeURIComponent(instanceId)}/firewall`, { data: rule, params: { region } });
    return response.data;
};

export const getEc2Metrics = async (instanceId, rangeMinutes, region) => {
    const response = await api.get(`/ec2/${encodeURIComponent(instanceId)}/metrics`, { params: { rangeMinutes, region } });
    return response.data;
};

// ================= Azure VM detail / firewall / metrics =================

export const getAzureVmDetail = async (resourceGroup, vmName) => {
    const response = await api.get(`/azurevm/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(vmName)}/detail`);
    return response.data;
};

export const getAzureVmFirewall = async (resourceGroup, vmName, nsgId) => {
    const response = await api.get(`/azurevm/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(vmName)}/firewall`, { params: { nsgId } });
    return response.data;
};

export const addAzureVmFirewallRule = async (resourceGroup, vmName, rule, nsgId) => {
    const response = await api.post(`/azurevm/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(vmName)}/firewall`, rule, { params: { nsgId } });
    return response.data;
};

export const removeAzureVmFirewallRule = async (resourceGroup, vmName, ruleName, nsgId) => {
    const response = await api.delete(`/azurevm/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(vmName)}/firewall/${encodeURIComponent(ruleName)}`, { params: { nsgId } });
    return response.data;
};

export const getAzureVmMetrics = async (resourceGroup, vmName, rangeMinutes) => {
    const response = await api.get(`/azurevm/${encodeURIComponent(resourceGroup)}/${encodeURIComponent(vmName)}/metrics`, { params: { rangeMinutes } });
    return response.data;
};

// ================= GCP Compute Engine =================
// Replaces the "not built yet" GCP stub - real VM management the same
// shape as EC2/Azure VM above.

export const getGcpVms = async () => {
    const response = await api.get("/gcpvm");
    return response.data;
};

export const startGcpVm = async (zone, instanceName) => {
    const response = await api.post(`/gcpvm/${encodeURIComponent(zone)}/${encodeURIComponent(instanceName)}/start`);
    return response.data;
};

export const stopGcpVm = async (zone, instanceName) => {
    const response = await api.post(`/gcpvm/${encodeURIComponent(zone)}/${encodeURIComponent(instanceName)}/stop`);
    return response.data;
};

export const resetGcpVm = async (zone, instanceName) => {
    const response = await api.post(`/gcpvm/${encodeURIComponent(zone)}/${encodeURIComponent(instanceName)}/reset`);
    return response.data;
};

export const deleteGcpVm = async (zone, instanceName) => {
    const response = await api.delete(`/gcpvm/${encodeURIComponent(zone)}/${encodeURIComponent(instanceName)}`);
    return response.data;
};

export const getGcpVmMetrics = async (zone, instanceName, instanceId, rangeMinutes) => {
    const response = await api.get(`/gcpvm/${encodeURIComponent(zone)}/${encodeURIComponent(instanceName)}/metrics`, { params: { instanceId, rangeMinutes } });
    return response.data;
};

export const getGcpFirewall = async () => {
    const response = await api.get("/gcpfirewall");
    return response.data;
};

export const addGcpFirewallRule = async (rule) => {
    const response = await api.post("/gcpfirewall", rule);
    return response.data;
};

export const removeGcpFirewallRule = async (ruleName) => {
    const response = await api.delete(`/gcpfirewall/${encodeURIComponent(ruleName)}`);
    return response.data;
};

// ================= Audit history (best-effort) =================

export const getResourceAuditHistory = async (resource) => {
    const response = await api.get("/audit", { params: { resource } });
    return response.data;
};

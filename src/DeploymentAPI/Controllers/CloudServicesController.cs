using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

public class EcsScaleRequestDto
{
    public string Cluster { get; set; } = string.Empty;

    public string Service { get; set; } = string.Empty;

    public int DesiredCount { get; set; }
}

public class EcrCreateRepositoryRequestDto
{
    public string Name { get; set; } = string.Empty;
}

// The Cloud Services management pages' write actions (EC2 start/stop/
// reboot/terminate, ECS scale, ECR create/delete) plus the read-only
// lists that didn't already exist on SettingsController (ECR
// repositories/images, Lambda functions, RDS instances). EC2 and ECS
// reads reuse the existing /api/settings/me/aws/ec2-detail and
// /ecs-detail endpoints - no need to duplicate those here.
//
// No AdminGate on these - same self-service model as every other /me/*
// AWS endpoint (see SettingsController): these act on THIS session's own
// AWS credentials, and AWS's own IAM permission check is the real
// authorization boundary (see AppendAuditLog below, and section 23 of the
// request this feature came from) - the backend never pretends an
// AccessDenied from AWS was a success.
[ApiController]
[Route("api/cloudservices")]
public class CloudServicesController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly CloudStatusService _cloud;
    private readonly CloudServiceManagementService _management;
    private readonly ActivityLogService _log;

    public CloudServicesController(
        SettingsService settings, CloudStatusService cloud, CloudServiceManagementService management, ActivityLogService log)
    {
        _settings = settings;
        _cloud = cloud;
        _management = management;
        _log = log;
    }

    // Best-effort - the same STS GetCallerIdentity already used for the
    // TopBar's "signed in as" badge, reused here purely to label who did
    // what in the activity log rather than just an opaque session key.
    private async Task<string> ResolveActorLabelAsync(string sessionKey, UserAwsCredentials creds)
    {
        var identity = creds.IsConfigured ? await _cloud.GetCallerIdentityLabelAsync(creds) : null;
        return identity ?? $"session {sessionKey[..Math.Min(8, sessionKey.Length)]}";
    }

    private void AppendAuditLog(string actor, string action, string service, string resource, bool success, string? detail)
    {
        var outcome = success ? "succeeded" : "failed";
        var suffix = string.IsNullOrWhiteSpace(detail) ? "" : $" ({detail})";

        if (success)
            _log.LogInfo("Cloud Services", $"{actor} — {action} on {service} \"{resource}\" {outcome}{suffix}");
        else
            _log.LogError("Cloud Services", $"{actor} — {action} on {service} \"{resource}\" {outcome}{suffix}");
    }

    // ================= EC2 actions =================

    [HttpPost("ec2/{instanceId}/start")]
    public async Task<IActionResult> StartEc2(string instanceId, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.StartEc2InstanceAsync(creds, region, instanceId);
        AppendAuditLog(actor, "Start", "EC2", instanceId, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("ec2/{instanceId}/stop")]
    public async Task<IActionResult> StopEc2(string instanceId, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.StopEc2InstanceAsync(creds, region, instanceId);
        AppendAuditLog(actor, "Stop", "EC2", instanceId, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("ec2/{instanceId}/reboot")]
    public async Task<IActionResult> RebootEc2(string instanceId, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.RebootEc2InstanceAsync(creds, region, instanceId);
        AppendAuditLog(actor, "Reboot", "EC2", instanceId, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("ec2/{instanceId}/terminate")]
    public async Task<IActionResult> TerminateEc2(string instanceId, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.TerminateEc2InstanceAsync(creds, region, instanceId);
        AppendAuditLog(actor, "Terminate", "EC2", instanceId, result.Success, result.Error);

        return Ok(result);
    }

    // ================= EC2 detail / firewall / metrics =================
    // Phase 1 of the multi-cloud infrastructure console - real per-
    // resource detail beyond the management list above (connection info
    // is computed client-side, no backend call - see section 5/6). Same
    // self-service posture as the actions above, no AdminGate.

    [HttpGet("ec2/{instanceId}")]
    public async Task<IActionResult> GetEc2Detail(string instanceId, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetEc2InstanceDetailAsync(creds, region, instanceId));
    }

    [HttpGet("ec2/{instanceId}/firewall")]
    public async Task<IActionResult> GetEc2Firewall(string instanceId, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetEc2SecurityGroupsAsync(creds, region, instanceId));
    }

    [HttpPost("ec2/{instanceId}/firewall")]
    public async Task<IActionResult> AddEc2FirewallRule(string instanceId, [FromBody] AddSecurityRuleRequestDto request, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.AddEc2SecurityGroupRuleAsync(creds, region, instanceId, request);
        AppendAuditLog(actor, "FirewallRuleAdded", "EC2", instanceId, result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("ec2/{instanceId}/firewall")]
    public async Task<IActionResult> RemoveEc2FirewallRule(string instanceId, [FromBody] RemoveSecurityRuleRequestDto request, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.RemoveEc2SecurityGroupRuleAsync(creds, region, instanceId, request);
        AppendAuditLog(actor, "FirewallRuleRemoved", "EC2", instanceId, result.Success, result.Error);

        return Ok(result);
    }

    [HttpGet("ec2/{instanceId}/metrics")]
    public async Task<IActionResult> GetEc2Metrics(string instanceId, [FromQuery] string? region, [FromQuery] int rangeMinutes = 60)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetEc2MetricsAsync(creds, region, instanceId, rangeMinutes));
    }

    // ================= ECS actions =================

    [HttpPost("ecs/scale")]
    public async Task<IActionResult> ScaleEcs([FromBody] EcsScaleRequestDto request, [FromQuery] string? region)
    {
        if (string.IsNullOrWhiteSpace(request.Cluster) || string.IsNullOrWhiteSpace(request.Service))
            return BadRequest("cluster and service are required.");

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.ScaleEcsServiceAsync(creds, region, request.Cluster, request.Service, request.DesiredCount);
        AppendAuditLog(actor, $"Scale to {request.DesiredCount}", "ECS", $"{request.Cluster}/{request.Service}", result.Success, result.Error);

        return Ok(result);
    }

    // ================= ECS detail / tasks / logs / metrics / bulk scale / running image =================
    // Phase 2 of the multi-cloud infrastructure console - same self-
    // service posture as every route above, no AdminGate.

    [HttpGet("ecs/{cluster}/{service}/detail")]
    public async Task<IActionResult> GetEcsServiceDetail(string cluster, string service, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetEcsServiceDetailAsync(creds, region, cluster, service));
    }

    [HttpPost("ecs/{cluster}/{service}/restart")]
    public async Task<IActionResult> RestartEcsService(string cluster, string service, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.RestartEcsServiceAsync(creds, region, cluster, service);
        AppendAuditLog(actor, "Restart", "ECS", $"{cluster}/{service}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("ecs/{cluster}/tasks/{taskId}/stop")]
    public async Task<IActionResult> StopEcsTask(string cluster, string taskId, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.StopEcsTaskAsync(creds, region, cluster, taskId);
        AppendAuditLog(actor, "StopTask", "ECS", $"{cluster}/{taskId}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("ecs/scale/bulk")]
    public async Task<IActionResult> BulkScaleEcs([FromBody] EcsBulkScaleRequestDto request, [FromQuery] string? region)
    {
        if (request.Services == null || request.Services.Count == 0)
            return BadRequest("At least one service is required.");

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.BulkScaleEcsServicesAsync(creds, region, request.Services, request.DesiredCount);

        foreach (var item in result.Results)
            AppendAuditLog(actor, $"BulkScale to {request.DesiredCount}", "ECS", $"{item.Cluster}/{item.Service}", item.Success, item.Error);

        return Ok(result);
    }

    [HttpGet("ecs/{cluster}/{service}/metrics")]
    public async Task<IActionResult> GetEcsMetrics(string cluster, string service, [FromQuery] string? region, [FromQuery] int rangeMinutes = 60)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetEcsMetricsAsync(creds, region, cluster, service, rangeMinutes));
    }

    [HttpGet("ecs/{cluster}/tasks/{taskId}/logs")]
    public async Task<IActionResult> GetEcsTaskLogs(string cluster, string taskId, [FromQuery] string container, [FromQuery] string? region, [FromQuery] int rangeMinutes = 30)
    {
        if (string.IsNullOrWhiteSpace(container))
            return BadRequest("container is required.");

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetEcsTaskLogsAsync(creds, region, cluster, taskId, container, rangeMinutes));
    }

    [HttpGet("ecs/{cluster}/{service}/image")]
    public async Task<IActionResult> GetEcsRunningImage(string cluster, string service, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetEcsRunningImageAsync(creds, region, cluster, service));
    }

    // ================= ECR =================

    [HttpGet("ecr")]
    public async Task<IActionResult> GetEcrRepositories([FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetEcrRepositoriesAsync(creds, region));
    }

    [HttpGet("ecr/{repositoryName}/images")]
    public async Task<IActionResult> GetEcrImages(string repositoryName, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetEcrImagesAsync(creds, region, repositoryName));
    }

    [HttpPost("ecr")]
    public async Task<IActionResult> CreateEcrRepository([FromBody] EcrCreateRepositoryRequestDto request, [FromQuery] string? region)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest("name is required.");

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.CreateEcrRepositoryAsync(creds, region, request.Name);
        AppendAuditLog(actor, "Create", "ECR", request.Name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("ecr/{repositoryName}")]
    public async Task<IActionResult> DeleteEcrRepository(string repositoryName, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.DeleteEcrRepositoryAsync(creds, region, repositoryName);
        AppendAuditLog(actor, "Delete", "ECR", repositoryName, result.Success, result.Error);

        return Ok(result);
    }

    // ================= ACR (Azure Container Registry) =================
    // Same self-service posture as ECR above - this session's own Azure
    // credentials (see CloudCredentialsDto.cs's SubscriptionId field, added
    // specifically for this) are the auth boundary, no AdminGate.

    [HttpGet("acr")]
    public async Task<IActionResult> GetAcrRegistries()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAcrRegistriesAsync(creds));
    }

    [HttpGet("acr/{loginServer}/repositories")]
    public async Task<IActionResult> GetAcrRepositories(string loginServer)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAcrRepositoriesAsync(creds, loginServer));
    }

    [HttpGet("acr/{loginServer}/repositories/{repositoryName}/tags")]
    public async Task<IActionResult> GetAcrTags(string loginServer, string repositoryName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAcrTagsAsync(creds, loginServer, repositoryName));
    }

    // ================= Azure Virtual Machines =================
    // Real write access (start/stop/restart/delete/create), same
    // self-service posture as EC2 above - this session's own Azure
    // credentials, and Azure RBAC's own permission check, are the auth
    // boundary, no AdminGate. Audit-logged the same way EC2 actions are.

    private async Task<string> ResolveAzureActorLabelAsync(string sessionKey, UserAzureCredentials creds)
    {
        var identity = creds.IsConfigured ? await _cloud.GetAzureIdentityLabelAsync(creds) : null;
        return identity ?? $"session {sessionKey[..Math.Min(8, sessionKey.Length)]}";
    }

    [HttpGet("azurevm")]
    public async Task<IActionResult> GetAzureVms()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAzureVmsAsync(creds));
    }

    [HttpPost("azurevm/{resourceGroup}/{vmName}/start")]
    public async Task<IActionResult> StartAzureVm(string resourceGroup, string vmName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.StartAzureVmAsync(creds, resourceGroup, vmName);
        AppendAuditLog(actor, "Start", "Azure VM", vmName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("azurevm/{resourceGroup}/{vmName}/stop")]
    public async Task<IActionResult> StopAzureVm(string resourceGroup, string vmName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.StopAzureVmAsync(creds, resourceGroup, vmName);
        AppendAuditLog(actor, "Stop", "Azure VM", vmName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("azurevm/{resourceGroup}/{vmName}/restart")]
    public async Task<IActionResult> RestartAzureVm(string resourceGroup, string vmName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.RestartAzureVmAsync(creds, resourceGroup, vmName);
        AppendAuditLog(actor, "Restart", "Azure VM", vmName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("azurevm/{resourceGroup}/{vmName}")]
    public async Task<IActionResult> DeleteAzureVm(string resourceGroup, string vmName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.DeleteAzureVmAsync(creds, resourceGroup, vmName);
        AppendAuditLog(actor, "Delete", "Azure VM", vmName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("azurevm")]
    public async Task<IActionResult> CreateAzureVm([FromBody] AzureCreateVmRequestDto request)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.CreateAzureVmAsync(creds, request);
        AppendAuditLog(actor, "Create", "Azure VM", request.Name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpGet("azurevm/catalog")]
    public IActionResult GetAzureVmCatalog()
    {
        return Ok(new
        {
            Sizes = CloudServiceManagementService.VmSizeCatalog.Select(kv => new { value = kv.Key, label = kv.Value }),
            Images = CloudServiceManagementService.VmImageCatalog.Select(kv => new { value = kv.Key, label = kv.Value.Label, isWindows = kv.Value.IsWindows })
        });
    }

    // ================= Azure VM detail / NSG rules / metrics =================
    // Phase 1 of the multi-cloud infrastructure console - same self-
    // service posture as the VM actions above, no AdminGate.

    [HttpGet("azurevm/{resourceGroup}/{vmName}/detail")]
    public async Task<IActionResult> GetAzureVmDetail(string resourceGroup, string vmName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAzureVmDetailAsync(creds, resourceGroup, vmName));
    }

    [HttpGet("azurevm/{resourceGroup}/{vmName}/firewall")]
    public async Task<IActionResult> GetAzureVmFirewall(string resourceGroup, string vmName, [FromQuery] string? nsgId)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAzureNsgRulesAsync(creds, nsgId));
    }

    [HttpPost("azurevm/{resourceGroup}/{vmName}/firewall")]
    public async Task<IActionResult> AddAzureVmFirewallRule(string resourceGroup, string vmName, [FromBody] AddSecurityRuleRequestDto request, [FromQuery] string? nsgId)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.AddAzureNsgRuleAsync(creds, nsgId, request);
        AppendAuditLog(actor, "FirewallRuleAdded", "Azure VM", vmName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("azurevm/{resourceGroup}/{vmName}/firewall/{ruleName}")]
    public async Task<IActionResult> RemoveAzureVmFirewallRule(string resourceGroup, string vmName, string ruleName, [FromQuery] string? nsgId)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.RemoveAzureNsgRuleAsync(creds, nsgId, ruleName);
        AppendAuditLog(actor, "FirewallRuleRemoved", "Azure VM", vmName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpGet("azurevm/{resourceGroup}/{vmName}/metrics")]
    public async Task<IActionResult> GetAzureVmMetrics(string resourceGroup, string vmName, [FromQuery] int rangeMinutes = 60)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAzureVmMetricsAsync(creds, resourceGroup, vmName, rangeMinutes));
    }

    // ================= Azure resource detail (generic view/read) =================
    // Cloud Services' Azure page's "click into any resource, not just a
    // VM" detail panel - see AzureResourceDetailDto's own comment.
    // resourceId comes straight from the account-wide inventory's own
    // ResourceId field (see GetAzureResourceInventoryAsync), so this never
    // needs to guess or reconstruct one from a name.

    [HttpGet("azureresource")]
    public async Task<IActionResult> GetAzureResourceDetail([FromQuery] string resourceId, [FromQuery] string resourceType)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _cloud.GetAzureResourceDetailAsync(creds, resourceId, resourceType));
    }

    // ================= GCP Artifact Registry =================
    // Same self-service posture as ECR/ACR above - this session's own GCP
    // credentials are the auth boundary, no AdminGate.

    [HttpGet("artifactregistry")]
    public async Task<IActionResult> GetArtifactRegistryRepositories()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        return Ok(await _management.GetArtifactRegistryRepositoriesAsync(creds));
    }

    [HttpGet("artifactregistry/{repositoryName}/images")]
    public async Task<IActionResult> GetArtifactRegistryImages(string repositoryName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        return Ok(await _management.GetArtifactRegistryImagesAsync(creds, repositoryName));
    }

    // ================= GCP Compute Engine =================
    // Phase 1 of the multi-cloud infrastructure console - same self-
    // service posture as EC2/Azure VM above, no AdminGate. Actor label
    // for the audit log falls back to the session-key prefix (no GCP
    // equivalent of STS GetCallerIdentity/Graph wired up here).

    [HttpGet("gcpvm")]
    public async Task<IActionResult> GetGcpVms()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        return Ok(await _management.GetGcpComputeInstancesAsync(creds));
    }

    [HttpPost("gcpvm/{zone}/{instanceName}/start")]
    public async Task<IActionResult> StartGcpVm(string zone, string instanceName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _management.StartGcpVmAsync(creds, zone, instanceName);
        AppendAuditLog($"session {key[..Math.Min(8, key.Length)]}", "Start", "GCP VM", instanceName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("gcpvm/{zone}/{instanceName}/stop")]
    public async Task<IActionResult> StopGcpVm(string zone, string instanceName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _management.StopGcpVmAsync(creds, zone, instanceName);
        AppendAuditLog($"session {key[..Math.Min(8, key.Length)]}", "Stop", "GCP VM", instanceName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("gcpvm/{zone}/{instanceName}/reset")]
    public async Task<IActionResult> ResetGcpVm(string zone, string instanceName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _management.ResetGcpVmAsync(creds, zone, instanceName);
        AppendAuditLog($"session {key[..Math.Min(8, key.Length)]}", "Reset", "GCP VM", instanceName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("gcpvm/{zone}/{instanceName}")]
    public async Task<IActionResult> DeleteGcpVm(string zone, string instanceName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _management.DeleteGcpVmAsync(creds, zone, instanceName);
        AppendAuditLog($"session {key[..Math.Min(8, key.Length)]}", "Delete", "GCP VM", instanceName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpGet("gcpvm/{zone}/{instanceName}/metrics")]
    public async Task<IActionResult> GetGcpVmMetrics(string zone, string instanceName, [FromQuery] string? instanceId, [FromQuery] int rangeMinutes = 60)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        if (string.IsNullOrWhiteSpace(instanceId))
            return Ok(new ResourceMetricsDto { Configured = creds.IsConfigured, Error = "Missing instance ID." });

        return Ok(await _management.GetGcpVmMetricsAsync(creds, instanceId, rangeMinutes));
    }

    [HttpGet("gcpfirewall")]
    public async Task<IActionResult> GetGcpFirewall()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        return Ok(await _management.GetGcpFirewallRulesAsync(creds));
    }

    [HttpPost("gcpfirewall")]
    public async Task<IActionResult> AddGcpFirewallRule([FromBody] AddSecurityRuleRequestDto request)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _management.AddGcpFirewallRuleAsync(creds, request);
        AppendAuditLog($"session {key[..Math.Min(8, key.Length)]}", "FirewallRuleAdded", "GCP Network", "global", result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("gcpfirewall/{ruleName}")]
    public async Task<IActionResult> RemoveGcpFirewallRule(string ruleName)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _management.RemoveGcpFirewallRuleAsync(creds, ruleName);
        AppendAuditLog($"session {key[..Math.Min(8, key.Length)]}", "FirewallRuleRemoved", "GCP Network", ruleName, result.Success, result.Error);

        return Ok(result);
    }

    // ================= Audit history (best-effort) =================
    // Backs the resource detail pages' "Audit History" tab - filters the
    // same in-memory ActivityLogService every mutation above already
    // writes to, by a substring match on the resource name. In-memory,
    // resets on restart, substring match rather than a real resource
    // link - a known, already-accepted limitation (see ActivityLogService's
    // own comment), not a persisted audit store.

    [HttpGet("audit")]
    public IActionResult GetResourceAuditHistory([FromQuery] string resource)
    {
        if (string.IsNullOrWhiteSpace(resource))
            return Ok(new List<LogEntryDto>());

        var matches = _log.GetRecent()
            .Where(e => e.Category == "Cloud Services" && e.Message.Contains(resource, StringComparison.OrdinalIgnoreCase))
            .ToList();

        return Ok(matches);
    }

    // ================= Lambda (read-only) =================

    [HttpGet("lambda")]
    public async Task<IActionResult> GetLambdaFunctions([FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetLambdaFunctionsAsync(creds, region));
    }

    // ================= RDS (read-only) =================

    [HttpGet("rds")]
    public async Task<IActionResult> GetRdsInstances([FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetRdsInstancesAsync(creds, region));
    }
}

using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Phase 3 of the multi-cloud infrastructure console - Azure Container
// Apps and GCP Cloud Run. Own controller (not folded into
// CloudServicesController) mirroring how ContainerServiceManagementService
// is its own service - same self-service posture as every other route in
// this feature area, no AdminGate: this session's own Azure/GCP
// credentials, and the cloud provider's own IAM/RBAC, are the
// authorization boundary.
[ApiController]
[Route("api/containerservices")]
public class ContainerServicesController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly CloudStatusService _cloud;
    private readonly ContainerServiceManagementService _management;
    private readonly ActivityLogService _log;

    public ContainerServicesController(
        SettingsService settings, CloudStatusService cloud, ContainerServiceManagementService management, ActivityLogService log)
    {
        _settings = settings;
        _cloud = cloud;
        _management = management;
        _log = log;
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

    // ================= Azure Container Apps =================

    [HttpGet("azurecontainerapps")]
    public async Task<IActionResult> GetAzureContainerApps()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAzureContainerAppsAsync(creds));
    }

    [HttpGet("azurecontainerapps/{resourceGroup}/{name}")]
    public async Task<IActionResult> GetAzureContainerAppDetail(string resourceGroup, string name)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAzureContainerAppDetailAsync(creds, resourceGroup, name));
    }

    [HttpPost("azurecontainerapps/{resourceGroup}/{name}/scale")]
    public async Task<IActionResult> ScaleAzureContainerApp(string resourceGroup, string name, [FromBody] AzureContainerAppScaleRequestDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.ScaleAzureContainerAppAsync(creds, resourceGroup, name, request.MinReplicas, request.MaxReplicas);
        AppendAuditLog(actor, "Scale", "Azure Container App", name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("azurecontainerapps/{resourceGroup}/{name}/start")]
    public async Task<IActionResult> StartAzureContainerApp(string resourceGroup, string name)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.StartAzureContainerAppAsync(creds, resourceGroup, name);
        AppendAuditLog(actor, "Start", "Azure Container App", name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("azurecontainerapps/{resourceGroup}/{name}/stop")]
    public async Task<IActionResult> StopAzureContainerApp(string resourceGroup, string name)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.StopAzureContainerAppAsync(creds, resourceGroup, name);
        AppendAuditLog(actor, "Stop", "Azure Container App", name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("azurecontainerapps/{resourceGroup}/{name}/revisions/{revisionName}/restart")]
    public async Task<IActionResult> RestartAzureContainerAppRevision(string resourceGroup, string name, string revisionName)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.RestartAzureContainerAppRevisionAsync(creds, resourceGroup, name, revisionName);
        AppendAuditLog(actor, "Restart", "Azure Container App", $"{name}/{revisionName}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("azurecontainerapps/{resourceGroup}/{name}")]
    public async Task<IActionResult> DeleteAzureContainerApp(string resourceGroup, string name)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveAzureActorLabelAsync(key, creds);

        var result = await _management.DeleteAzureContainerAppAsync(creds, resourceGroup, name);
        AppendAuditLog(actor, "Delete", "Azure Container App", name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpGet("azurecontainerapps/{resourceGroup}/{name}/metrics")]
    public async Task<IActionResult> GetAzureContainerAppMetrics(string resourceGroup, string name, [FromQuery] int rangeMinutes = 60)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAzureContainerAppMetricsAsync(creds, resourceGroup, name, rangeMinutes));
    }

    private async Task<string> ResolveAzureActorLabelAsync(string sessionKey, UserAzureCredentials creds)
    {
        var identity = creds.IsConfigured ? await _cloud.GetAzureIdentityLabelAsync(creds) : null;
        return identity ?? $"session {sessionKey[..Math.Min(8, sessionKey.Length)]}";
    }

    // ================= GCP Cloud Run =================

    [HttpGet("cloudrun")]
    public async Task<IActionResult> GetCloudRunServices()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        return Ok(await _management.GetCloudRunServicesAsync(creds));
    }

    [HttpPost("cloudrun/{name}/scale")]
    public async Task<IActionResult> ScaleCloudRunService(string name, [FromBody] GcpCloudRunScaleRequestDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _management.ScaleCloudRunServiceAsync(creds, name, request.MinInstances, request.MaxInstances);
        AppendAuditLog($"session {key[..Math.Min(8, key.Length)]}", "Scale", "GCP Cloud Run", name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("cloudrun/{name}/redeploy")]
    public async Task<IActionResult> RedeployCloudRunService(string name)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _management.RedeployCloudRunServiceAsync(creds, name);
        AppendAuditLog($"session {key[..Math.Min(8, key.Length)]}", "Redeploy", "GCP Cloud Run", name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("cloudrun/{name}")]
    public async Task<IActionResult> DeleteCloudRunService(string name)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _management.DeleteCloudRunServiceAsync(creds, name);
        AppendAuditLog($"session {key[..Math.Min(8, key.Length)]}", "Delete", "GCP Cloud Run", name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpGet("cloudrun/{name}/metrics")]
    public async Task<IActionResult> GetCloudRunMetrics(string name, [FromQuery] int rangeMinutes = 60)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        return Ok(await _management.GetCloudRunMetricsAsync(creds, name, rangeMinutes));
    }

    // ================= Cloud Run revisions / traffic / rollback (Phase C) =================

    [HttpGet("cloudrun/{name}/revisions")]
    public async Task<IActionResult> GetCloudRunRevisions(string name)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        return Ok(await _management.GetCloudRunRevisionsAsync(creds, name));
    }

    [HttpPost("cloudrun/{name}/traffic")]
    public async Task<IActionResult> UpdateCloudRunTraffic(string name, [FromBody] GcpCloudRunTrafficUpdateRequestDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _management.UpdateCloudRunTrafficAsync(creds, name, request.Traffic);
        AppendAuditLog($"session {key[..Math.Min(8, key.Length)]}", "UpdateTraffic", "GCP Cloud Run", name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("cloudrun/{name}/rollback")]
    public async Task<IActionResult> RollbackCloudRun(string name, [FromBody] GcpCloudRunRollbackRequestDto request)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _management.RollbackCloudRunAsync(creds, name, request.RevisionName);
        AppendAuditLog($"session {key[..Math.Min(8, key.Length)]}", $"Rollback to {request.RevisionName}", "GCP Cloud Run", name, result.Success, result.Error);

        return Ok(result);
    }
}

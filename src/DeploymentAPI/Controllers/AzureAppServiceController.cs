using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Phase B of the PaaS/Microservices console - Azure App Service +
// Deployment Slots + Swap. Same self-service posture as every other
// route in this feature area, no AdminGate.
[ApiController]
[Route("api/paas/azure/appservices")]
public class AzureAppServiceController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly CloudStatusService _cloud;
    private readonly AzureAppServiceManagementService _management;
    private readonly ActivityLogService _log;

    public AzureAppServiceController(
        SettingsService settings, CloudStatusService cloud, AzureAppServiceManagementService management, ActivityLogService log)
    {
        _settings = settings;
        _cloud = cloud;
        _management = management;
        _log = log;
    }

    private async Task<string> ResolveActorLabelAsync(string sessionKey, UserAzureCredentials creds)
    {
        var identity = creds.IsConfigured ? await _cloud.GetAzureIdentityLabelAsync(creds) : null;
        return identity ?? $"session {sessionKey[..Math.Min(8, sessionKey.Length)]}";
    }

    private void AppendAuditLog(string actor, string action, string resource, bool success, string? detail)
    {
        var outcome = success ? "succeeded" : "failed";
        var suffix = string.IsNullOrWhiteSpace(detail) ? "" : $" ({detail})";

        if (success)
            _log.LogInfo("Cloud Services", $"{actor} — {action} on App Service \"{resource}\" {outcome}{suffix}");
        else
            _log.LogError("Cloud Services", $"{actor} — {action} on App Service \"{resource}\" {outcome}{suffix}");
    }

    [HttpGet("apps")]
    public async Task<IActionResult> GetApps()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAppServicesAsync(creds));
    }

    [HttpGet("apps/{resourceGroup}/{name}")]
    public async Task<IActionResult> GetAppDetail(string resourceGroup, string name)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetAppServiceDetailAsync(creds, resourceGroup, name));
    }

    [HttpPost("apps/{resourceGroup}/{name}/start")]
    public Task<IActionResult> StartProduction(string resourceGroup, string name) => RunLifecycle(resourceGroup, name, null, _management.StartAsync, "Start");

    [HttpPost("apps/{resourceGroup}/{name}/stop")]
    public Task<IActionResult> StopProduction(string resourceGroup, string name) => RunLifecycle(resourceGroup, name, null, _management.StopAsync, "Stop");

    [HttpPost("apps/{resourceGroup}/{name}/restart")]
    public Task<IActionResult> RestartProduction(string resourceGroup, string name) => RunLifecycle(resourceGroup, name, null, _management.RestartAsync, "Restart");

    [HttpPost("apps/{resourceGroup}/{name}/slots/{slot}/start")]
    public Task<IActionResult> StartSlot(string resourceGroup, string name, string slot) => RunLifecycle(resourceGroup, name, slot, _management.StartAsync, "Start");

    [HttpPost("apps/{resourceGroup}/{name}/slots/{slot}/stop")]
    public Task<IActionResult> StopSlot(string resourceGroup, string name, string slot) => RunLifecycle(resourceGroup, name, slot, _management.StopAsync, "Stop");

    [HttpPost("apps/{resourceGroup}/{name}/slots/{slot}/restart")]
    public Task<IActionResult> RestartSlot(string resourceGroup, string name, string slot) => RunLifecycle(resourceGroup, name, slot, _management.RestartAsync, "Restart");

    private async Task<IActionResult> RunLifecycle(string resourceGroup, string name, string? slot, Func<UserAzureCredentials, string, string, string?, Task<CloudServiceActionResultDto>> actionFn, string label)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await actionFn(creds, resourceGroup, name, slot);
        AppendAuditLog(actor, label, slot == null ? name : $"{name}/{slot}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("apps/{resourceGroup}/{name}/slots/{slot}/swap")]
    public async Task<IActionResult> SwapSlot(string resourceGroup, string name, string slot, [FromBody] AzureSlotSwapRequestDto request)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.SwapSlotAsync(creds, resourceGroup, name, slot, request.TargetSlot);
        AppendAuditLog(actor, $"Swap {slot} -> {request.TargetSlot}", name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("bulk/swap")]
    public async Task<IActionResult> BulkSwap([FromBody] AzureBulkSwapRequestDto request)
    {
        if (request.Items == null || request.Items.Count == 0)
            return BadRequest("At least one item is required.");

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.BulkSwapAsync(creds, request.Items);

        foreach (var item in result.Results)
            AppendAuditLog(actor, $"BulkSwap {item.Slot}", item.AppName, item.Success, item.Error);

        return Ok(result);
    }

    [HttpGet("apps/{resourceGroup}/{name}/variables")]
    public async Task<IActionResult> GetVariables(string resourceGroup, string name, [FromQuery] string? slot)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetEnvVarsAsync(creds, resourceGroup, name, slot));
    }

    [HttpPut("apps/{resourceGroup}/{name}/variables")]
    public async Task<IActionResult> UpdateVariable(string resourceGroup, string name, [FromBody] AzureAppServiceEnvVarUpdateDto request, [FromQuery] string? slot)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest("name is required.");

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.UpdateEnvVarAsync(creds, resourceGroup, name, slot, request.Name, request.Value);
        AppendAuditLog(actor, request.Value == null ? $"RemoveSetting {request.Name}" : $"SetSetting {request.Name}", slot == null ? name : $"{name}/{slot}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("apps/{resourceGroup}/{name}/scale")]
    public async Task<IActionResult> Scale(string resourceGroup, string name, [FromBody] AzureAppServiceScaleRequestDto request)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var detail = await _management.GetAppServiceDetailAsync(creds, resourceGroup, name);
        var result = await _management.ScalePlanAsync(creds, detail.App?.ServerFarmId ?? string.Empty, request.Capacity);
        AppendAuditLog(actor, $"Scale plan to {request.Capacity}", name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("apps/{resourceGroup}/{name}")]
    public async Task<IActionResult> DeleteApp(string resourceGroup, string name)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.DeleteAppAsync(creds, resourceGroup, name);
        AppendAuditLog(actor, "Delete", name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("apps/{resourceGroup}/{name}/slots/{slot}")]
    public async Task<IActionResult> DeleteSlot(string resourceGroup, string name, string slot)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.DeleteSlotAsync(creds, resourceGroup, name, slot);
        AppendAuditLog(actor, "DeleteSlot", $"{name}/{slot}", result.Success, result.Error);

        return Ok(result);
    }

    [HttpGet("apps/{resourceGroup}/{name}/metrics")]
    public async Task<IActionResult> GetMetrics(string resourceGroup, string name, [FromQuery] string? slot, [FromQuery] int rangeMinutes = 60)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAzureCredentialsAsync(key);

        return Ok(await _management.GetMetricsAsync(creds, resourceGroup, name, slot, rangeMinutes));
    }
}

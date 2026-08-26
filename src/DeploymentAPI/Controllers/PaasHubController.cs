using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Phase C of the PaaS/Microservices console - the cross-provider hub
// (section 2's main application list + section 14's bulk restart). Same
// self-service posture as every other route in this feature area, no
// AdminGate.
[ApiController]
[Route("api/paas")]
public class PaasHubController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly PaasAggregationService _aggregation;
    private readonly ActivityLogService _log;

    public PaasHubController(SettingsService settings, PaasAggregationService aggregation, ActivityLogService log)
    {
        _settings = settings;
        _aggregation = aggregation;
        _log = log;
    }

    [HttpGet("applications")]
    public async Task<IActionResult> GetApplications()
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

        var awsCreds = await _settings.GetUserAwsCredentialsAsync(key);
        var azureCreds = await _settings.GetUserAzureCredentialsAsync(key);
        var gcpCreds = await _settings.GetUserGcpCredentialsAsync(key);

        return Ok(await _aggregation.GetAllApplicationsAsync(awsCreds, azureCreds, gcpCreds));
    }

    [HttpPost("bulk/restart")]
    public async Task<IActionResult> BulkRestart([FromBody] PaasBulkRestartRequestDto request)
    {
        if (request.Items == null || request.Items.Count == 0)
            return BadRequest("At least one item is required.");

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

        var awsCreds = await _settings.GetUserAwsCredentialsAsync(key);
        var azureCreds = await _settings.GetUserAzureCredentialsAsync(key);
        var gcpCreds = await _settings.GetUserGcpCredentialsAsync(key);

        var result = await _aggregation.BulkRestartAsync(awsCreds, azureCreds, gcpCreds, request.Items);

        var actor = $"session {key[..Math.Min(8, key.Length)]}";

        foreach (var item in result.Results)
            _log.LogInfo("Cloud Services", $"{actor} — BulkRestart on {item.Provider} \"{item.Name}\" {(item.Success ? "succeeded" : $"failed ({item.Error})")}");

        return Ok(result);
    }
}

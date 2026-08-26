using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Phase A of the PaaS/Microservices console - AWS Elastic Beanstalk.
// Same self-service posture as every other route in this feature area
// (no AdminGate): this session's own AWS credentials, and AWS's own IAM
// permission check, are the authorization boundary.
[ApiController]
[Route("api/paas/aws/elasticbeanstalk")]
public class ElasticBeanstalkController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly CloudStatusService _cloud;
    private readonly ElasticBeanstalkService _beanstalk;
    private readonly ActivityLogService _log;

    public ElasticBeanstalkController(
        SettingsService settings, CloudStatusService cloud, ElasticBeanstalkService beanstalk, ActivityLogService log)
    {
        _settings = settings;
        _cloud = cloud;
        _beanstalk = beanstalk;
        _log = log;
    }

    private async Task<string> ResolveActorLabelAsync(string sessionKey, UserAwsCredentials creds)
    {
        var identity = creds.IsConfigured ? await _cloud.GetCallerIdentityLabelAsync(creds) : null;
        return identity ?? $"session {sessionKey[..Math.Min(8, sessionKey.Length)]}";
    }

    private void AppendAuditLog(string actor, string action, string resource, bool success, string? detail)
    {
        var outcome = success ? "succeeded" : "failed";
        var suffix = string.IsNullOrWhiteSpace(detail) ? "" : $" ({detail})";

        if (success)
            _log.LogInfo("Cloud Services", $"{actor} — {action} on Elastic Beanstalk \"{resource}\" {outcome}{suffix}");
        else
            _log.LogError("Cloud Services", $"{actor} — {action} on Elastic Beanstalk \"{resource}\" {outcome}{suffix}");
    }

    [HttpGet("applications")]
    public async Task<IActionResult> GetApplications([FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _beanstalk.GetApplicationsAsync(creds, region));
    }

    [HttpGet("environments")]
    public async Task<IActionResult> GetEnvironments([FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _beanstalk.GetEnvironmentsAsync(creds, region));
    }

    [HttpGet("environments/{environmentName}")]
    public async Task<IActionResult> GetEnvironmentDetail(string environmentName, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _beanstalk.GetEnvironmentDetailAsync(creds, region, environmentName));
    }

    [HttpGet("applications/{applicationName}/versions")]
    public async Task<IActionResult> GetApplicationVersions(string applicationName, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _beanstalk.GetApplicationVersionsAsync(creds, region, applicationName));
    }

    [HttpPost("environments/{environmentName}/deploy")]
    public async Task<IActionResult> DeployVersion(string environmentName, [FromBody] EbDeployVersionRequestDto request, [FromQuery] string? region)
    {
        if (string.IsNullOrWhiteSpace(request.VersionLabel))
            return BadRequest("versionLabel is required.");

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _beanstalk.DeployVersionAsync(creds, region, environmentName, request.VersionLabel);
        AppendAuditLog(actor, $"Deploy {request.VersionLabel}", environmentName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("environments/{environmentName}/restart")]
    public async Task<IActionResult> RestartAppServer(string environmentName, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _beanstalk.RestartAppServerAsync(creds, region, environmentName);
        AppendAuditLog(actor, "Restart", environmentName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("environments/{environmentName}/rebuild")]
    public async Task<IActionResult> RebuildEnvironment(string environmentName, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _beanstalk.RebuildEnvironmentAsync(creds, region, environmentName);
        AppendAuditLog(actor, "Rebuild", environmentName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("environments/{environmentName}/scale")]
    public async Task<IActionResult> ScaleEnvironment(string environmentName, [FromBody] EbScaleRequestDto request, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _beanstalk.ScaleEnvironmentAsync(creds, region, environmentName, request.MinSize, request.MaxSize);
        AppendAuditLog(actor, $"Scale to {request.MinSize}-{request.MaxSize}", environmentName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPut("environments/{environmentName}/variables")]
    public async Task<IActionResult> UpdateEnvironmentVariable(string environmentName, [FromBody] EbEnvironmentVariableUpdateDto request, [FromQuery] string? region)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest("name is required.");

        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _beanstalk.UpdateEnvironmentVariableAsync(creds, region, environmentName, request.Name, request.Value);
        AppendAuditLog(actor, request.Value == null ? $"RemoveVariable {request.Name}" : $"SetVariable {request.Name}", environmentName, result.Success, result.Error);

        return Ok(result);
    }

    [HttpGet("environments/{environmentName}/events")]
    public async Task<IActionResult> GetEnvironmentEvents(string environmentName, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _beanstalk.GetEnvironmentEventsAsync(creds, region, environmentName));
    }

    [HttpGet("environments/{environmentName}/metrics")]
    public async Task<IActionResult> GetEnvironmentMetrics(string environmentName, [FromQuery] string autoScalingGroupName, [FromQuery] string? region, [FromQuery] int rangeMinutes = 60)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _beanstalk.GetEnvironmentMetricsAsync(creds, region, autoScalingGroupName, rangeMinutes));
    }

    [HttpDelete("environments/{environmentName}")]
    public async Task<IActionResult> TerminateEnvironment(string environmentName, [FromQuery] string? region)
    {
        var (key, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _beanstalk.TerminateEnvironmentAsync(creds, region, environmentName);
        AppendAuditLog(actor, "Terminate", environmentName, result.Success, result.Error);

        return Ok(result);
    }
}

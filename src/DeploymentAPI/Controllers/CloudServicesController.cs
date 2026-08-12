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
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.StartEc2InstanceAsync(creds, region, instanceId);
        AppendAuditLog(actor, "Start", "EC2", instanceId, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("ec2/{instanceId}/stop")]
    public async Task<IActionResult> StopEc2(string instanceId, [FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.StopEc2InstanceAsync(creds, region, instanceId);
        AppendAuditLog(actor, "Stop", "EC2", instanceId, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("ec2/{instanceId}/reboot")]
    public async Task<IActionResult> RebootEc2(string instanceId, [FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.RebootEc2InstanceAsync(creds, region, instanceId);
        AppendAuditLog(actor, "Reboot", "EC2", instanceId, result.Success, result.Error);

        return Ok(result);
    }

    [HttpPost("ec2/{instanceId}/terminate")]
    public async Task<IActionResult> TerminateEc2(string instanceId, [FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.TerminateEc2InstanceAsync(creds, region, instanceId);
        AppendAuditLog(actor, "Terminate", "EC2", instanceId, result.Success, result.Error);

        return Ok(result);
    }

    // ================= ECS actions =================

    [HttpPost("ecs/scale")]
    public async Task<IActionResult> ScaleEcs([FromBody] EcsScaleRequestDto request, [FromQuery] string? region)
    {
        if (string.IsNullOrWhiteSpace(request.Cluster) || string.IsNullOrWhiteSpace(request.Service))
            return BadRequest("cluster and service are required.");

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.ScaleEcsServiceAsync(creds, region, request.Cluster, request.Service, request.DesiredCount);
        AppendAuditLog(actor, $"Scale to {request.DesiredCount}", "ECS", $"{request.Cluster}/{request.Service}", result.Success, result.Error);

        return Ok(result);
    }

    // ================= ECR =================

    [HttpGet("ecr")]
    public async Task<IActionResult> GetEcrRepositories([FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetEcrRepositoriesAsync(creds, region));
    }

    [HttpGet("ecr/{repositoryName}/images")]
    public async Task<IActionResult> GetEcrImages(string repositoryName, [FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetEcrImagesAsync(creds, region, repositoryName));
    }

    [HttpPost("ecr")]
    public async Task<IActionResult> CreateEcrRepository([FromBody] EcrCreateRepositoryRequestDto request, [FromQuery] string? region)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest("name is required.");

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.CreateEcrRepositoryAsync(creds, region, request.Name);
        AppendAuditLog(actor, "Create", "ECR", request.Name, result.Success, result.Error);

        return Ok(result);
    }

    [HttpDelete("ecr/{repositoryName}")]
    public async Task<IActionResult> DeleteEcrRepository(string repositoryName, [FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);
        var actor = await ResolveActorLabelAsync(key, creds);

        var result = await _management.DeleteEcrRepositoryAsync(creds, region, repositoryName);
        AppendAuditLog(actor, "Delete", "ECR", repositoryName, result.Success, result.Error);

        return Ok(result);
    }

    // ================= Lambda (read-only) =================

    [HttpGet("lambda")]
    public async Task<IActionResult> GetLambdaFunctions([FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetLambdaFunctionsAsync(creds, region));
    }

    // ================= RDS (read-only) =================

    [HttpGet("rds")]
    public async Task<IActionResult> GetRdsInstances([FromQuery] string? region)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserAwsCredentialsAsync(key);

        return Ok(await _management.GetRdsInstancesAsync(creds, region));
    }
}

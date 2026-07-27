using Docker.DotNet;

using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Container/image/volume/network management against the host's Docker
// Engine (see DockerApiService) — everything here, including the read
// endpoints, is admin-gated. Unlike GET /api/settings this has no safe
// public view: listing containers hands out the full inventory of
// whatever's running on the host, not just this portal's own services.
// [Authorize] closes the gap AdminGate.IsAdminOrBootstrap leaves open: in
// bootstrap mode (empty admin list) that check treats everyone as admin,
// so without a real login requirement here, an unconfigured deployment
// would leave Docker management reachable with no login at all. Populate
// Auth:AdminGitHubUsernames to leave bootstrap mode and get real Admin-only
// enforcement.
[Authorize]
[ApiController]
[Route("api/docker")]
public class DockerController : ControllerBase
{
    private readonly DockerApiService _docker;
    private readonly SettingsService _settings;
    private readonly ActivityLogService _log;

    public DockerController(DockerApiService docker, SettingsService settings, ActivityLogService log)
    {
        _docker = docker;
        _settings = settings;
        _log = log;
    }

    private async Task<IActionResult?> DenyUnlessAdminAsync(string action) =>
        await AdminGate.DenyUnlessAdminAsync(this, _settings, action);

    // ---------- Containers ----------

    [HttpGet("containers")]
    public async Task<IActionResult> ListContainers()
    {
        if (await DenyUnlessAdminAsync("view Docker containers") is IActionResult denied)
            return denied;

        return await RunAsync(() => _docker.ListContainersAsync());
    }

    [HttpPost("containers")]
    public async Task<IActionResult> CreateContainer(CreateDockerContainerDto request)
    {
        if (await DenyUnlessAdminAsync("create Docker containers") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(request.Image))
            return BadRequest(new { message = "An image is required." });

        return await RunAsync(async () =>
        {
            var id = await _docker.CreateContainerAsync(request);
            _log.LogInfo("Docker", $"Created container '{request.Name}' from {request.Image}.");
            return id;
        });
    }

    [HttpPost("containers/{id}/stop")]
    public async Task<IActionResult> StopContainer(string id)
    {
        if (await DenyUnlessAdminAsync("stop Docker containers") is IActionResult denied)
            return denied;

        return await RunAsync(async () =>
        {
            await _docker.StopContainerAsync(id);
            _log.LogInfo("Docker", $"Stopped container {id[..Math.Min(12, id.Length)]}.");
        });
    }

    [HttpPost("containers/{id}/restart")]
    public async Task<IActionResult> RestartContainer(string id)
    {
        if (await DenyUnlessAdminAsync("restart Docker containers") is IActionResult denied)
            return denied;

        return await RunAsync(async () =>
        {
            await _docker.RestartContainerAsync(id);
            _log.LogInfo("Docker", $"Restarted container {id[..Math.Min(12, id.Length)]}.");
        });
    }

    [HttpDelete("containers/{id}")]
    public async Task<IActionResult> RemoveContainer(string id)
    {
        if (await DenyUnlessAdminAsync("remove Docker containers") is IActionResult denied)
            return denied;

        return await RunAsync(async () =>
        {
            await _docker.RemoveContainerAsync(id);
            _log.LogInfo("Docker", $"Removed container {id[..Math.Min(12, id.Length)]}.");
        });
    }

    [HttpGet("containers/{id}/logs")]
    public async Task<IActionResult> ContainerLogs(string id, [FromQuery] int tail = 200)
    {
        if (await DenyUnlessAdminAsync("view Docker container logs") is IActionResult denied)
            return denied;

        return await RunAsync(() => _docker.GetContainerLogsAsync(id, tail));
    }

    // ---------- Images ----------

    [HttpGet("images")]
    public async Task<IActionResult> ListImages()
    {
        if (await DenyUnlessAdminAsync("view Docker images") is IActionResult denied)
            return denied;

        return await RunAsync(() => _docker.ListImagesAsync());
    }

    [HttpDelete("images/{id}")]
    public async Task<IActionResult> RemoveImage(string id)
    {
        if (await DenyUnlessAdminAsync("remove Docker images") is IActionResult denied)
            return denied;

        return await RunAsync(async () =>
        {
            await _docker.RemoveImageAsync(id);
            _log.LogInfo("Docker", $"Removed image {id[..Math.Min(12, id.Length)]}.");
        });
    }

    // ---------- Volumes ----------

    [HttpGet("volumes")]
    public async Task<IActionResult> ListVolumes()
    {
        if (await DenyUnlessAdminAsync("view Docker volumes") is IActionResult denied)
            return denied;

        return await RunAsync(() => _docker.ListVolumesAsync());
    }

    [HttpPost("volumes")]
    public async Task<IActionResult> CreateVolume(CreateDockerVolumeDto request)
    {
        if (await DenyUnlessAdminAsync("create Docker volumes") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "A volume name is required." });

        return await RunAsync(async () =>
        {
            await _docker.CreateVolumeAsync(request.Name);
            _log.LogInfo("Docker", $"Created volume '{request.Name}'.");
        });
    }

    [HttpDelete("volumes/{name}")]
    public async Task<IActionResult> RemoveVolume(string name)
    {
        if (await DenyUnlessAdminAsync("remove Docker volumes") is IActionResult denied)
            return denied;

        return await RunAsync(async () =>
        {
            await _docker.RemoveVolumeAsync(name);
            _log.LogInfo("Docker", $"Removed volume '{name}'.");
        });
    }

    // ---------- Networks ----------

    [HttpGet("networks")]
    public async Task<IActionResult> ListNetworks()
    {
        if (await DenyUnlessAdminAsync("view Docker networks") is IActionResult denied)
            return denied;

        return await RunAsync(() => _docker.ListNetworksAsync());
    }

    [HttpPost("networks")]
    public async Task<IActionResult> CreateNetwork(CreateDockerNetworkDto request)
    {
        if (await DenyUnlessAdminAsync("create Docker networks") is IActionResult denied)
            return denied;

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "A network name is required." });

        return await RunAsync(async () =>
        {
            await _docker.CreateNetworkAsync(request.Name, request.Driver);
            _log.LogInfo("Docker", $"Created network '{request.Name}' ({request.Driver}).");
        });
    }

    [HttpDelete("networks/{id}")]
    public async Task<IActionResult> RemoveNetwork(string id)
    {
        if (await DenyUnlessAdminAsync("remove Docker networks") is IActionResult denied)
            return denied;

        return await RunAsync(async () =>
        {
            await _docker.RemoveNetworkAsync(id);
            _log.LogInfo("Docker", $"Removed network {id[..Math.Min(12, id.Length)]}.");
        });
    }

    // ---------- Shared error handling ----------

    // Docker Engine API errors (unknown container, name already in use, image
    // still in use by a container, etc.) surface as DockerApiException with
    // the Engine's own status code and a JSON body — pass the status code
    // through and pull out its "message" field instead of a raw 500.
    private async Task<IActionResult> RunAsync(Func<Task> action)
    {
        try
        {
            await action();
            return Ok();
        }
        catch (DockerApiException ex)
        {
            return StatusCode((int)ex.StatusCode, new { message = ExtractMessage(ex) });
        }
    }

    private async Task<IActionResult> RunAsync<T>(Func<Task<T>> action)
    {
        try
        {
            return Ok(await action());
        }
        catch (DockerApiException ex)
        {
            return StatusCode((int)ex.StatusCode, new { message = ExtractMessage(ex) });
        }
    }

    private static string ExtractMessage(DockerApiException ex)
    {
        try
        {
            var body = Newtonsoft.Json.Linq.JObject.Parse(ex.ResponseBody);
            return body["message"]?.ToString() ?? ex.Message;
        }
        catch
        {
            return ex.Message;
        }
    }
}

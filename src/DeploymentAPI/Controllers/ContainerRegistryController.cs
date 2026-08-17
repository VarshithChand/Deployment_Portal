using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Docker Hub and GHCR - the two portal-wide "standalone" registries on the
// Container Registry hub (see ContainerRegistry.jsx). Configuring/clearing
// the shared credential is restricted to admins (AdminGate.
// DenyUnlessAdminAsync + the same screen-lock PIN gate every other shared
// credential in this app goes through - see CredentialGate) - the exact
// same bar the existing generic "Docker" registry credential
// (SettingsController.SaveDocker) already uses, NOT the higher
// DenyUnlessSuperAdminAsync bar Hosting Observability's portal-wide
// credentials use. Browsing (repositories/tags/packages/versions) has no
// gate at all - once an admin connects it, every portal visitor sees the
// same repositories, matching how ECR/ACR/Artifact Registry browsing is
// already self-service on this same hub.
[ApiController]
[Route("api/containerregistry")]
public class ContainerRegistryController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly ContainerRegistryService _registry;
    private readonly SessionActivityService _activity;

    public ContainerRegistryController(SettingsService settings, ContainerRegistryService registry, SessionActivityService activity)
    {
        _settings = settings;
        _registry = registry;
        _activity = activity;
    }

    private static IActionResult? ValidateProvider(string provider) =>
        provider is "dockerhub" or "ghcr"
            ? null
            : new NotFoundObjectResult(new { message = $"Unknown registry \"{provider}\"." });

    // ---- Credential status/save/clear -----------------------------------

    [HttpGet("{provider}/status")]
    public async Task<IActionResult> GetStatus(string provider)
    {
        if (ValidateProvider(provider) is IActionResult invalid)
            return invalid;

        var creds = await _settings.GetPortalContainerRegistryCredentialsAsync(provider);

        return Ok(new ContainerRegistryCredentialStatusDto
        {
            Configured = creds.IsConfigured,
            Username = creds.AccountId ?? string.Empty
        });
    }

    [HttpPost("{provider}")]
    public async Task<IActionResult> SaveCredentials(string provider, PaasCredentialsUpdateDto request)
    {
        if (ValidateProvider(provider) is IActionResult invalid)
            return invalid;

        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        var existing = await _settings.GetPortalContainerRegistryCredentialsAsync(provider);
        var effectiveUsername = string.IsNullOrWhiteSpace(request.AccountId) ? existing.AccountId : request.AccountId;

        if (string.IsNullOrWhiteSpace(effectiveUsername))
            return BadRequest(new { message = "A username is required." });

        await _settings.SavePortalContainerRegistryCredentialsAsync(provider, request);

        return Ok(new { configured = true });
    }

    [HttpDelete("{provider}")]
    public async Task<IActionResult> ClearCredentials(string provider)
    {
        if (ValidateProvider(provider) is IActionResult invalid)
            return invalid;

        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        await _settings.ClearPortalContainerRegistryCredentialsAsync(provider);

        return Ok(new { success = true });
    }

    // ---- Docker Hub browse -------------------------------------------------

    [HttpGet("dockerhub/repositories")]
    public async Task<IActionResult> GetDockerHubRepositories()
    {
        var creds = await _settings.GetPortalContainerRegistryCredentialsAsync("dockerhub");
        return Ok(await _registry.GetDockerHubRepositoriesAsync(creds));
    }

    [HttpGet("dockerhub/repositories/{repositoryName}/tags")]
    public async Task<IActionResult> GetDockerHubTags(string repositoryName)
    {
        var creds = await _settings.GetPortalContainerRegistryCredentialsAsync("dockerhub");
        return Ok(await _registry.GetDockerHubTagsAsync(creds, repositoryName));
    }

    // ---- GHCR browse ------------------------------------------------------

    [HttpGet("ghcr/packages")]
    public async Task<IActionResult> GetGhcrPackages()
    {
        var creds = await _settings.GetPortalContainerRegistryCredentialsAsync("ghcr");
        return Ok(await _registry.GetGhcrPackagesAsync(creds));
    }

    [HttpGet("ghcr/packages/{packageName}/versions")]
    public async Task<IActionResult> GetGhcrVersions(string packageName)
    {
        var creds = await _settings.GetPortalContainerRegistryCredentialsAsync("ghcr");
        return Ok(await _registry.GetGhcrVersionsAsync(creds, packageName));
    }
}

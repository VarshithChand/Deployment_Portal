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

    // ---- GitLab Registry: credential status/save/clear ---------------------
    //
    // Its own routes, not the generic {provider} ones above - the request
    // body (HostUrl, ProjectId, Token) doesn't fit PaasCredentialsUpdateDto's
    // (Token, AccountId) shape, see ContainerRegistryDtos.cs's own comment.

    [HttpGet("gitlab-registry/status")]
    public async Task<IActionResult> GetGitLabRegistryStatus()
    {
        var creds = await _settings.GetPortalGitLabRegistryCredentialsAsync();

        return Ok(new GitLabRegistryStatusDto
        {
            Configured = creds.IsConfigured,
            HostUrl = creds.HostUrl ?? string.Empty,
            ProjectId = creds.ProjectId ?? string.Empty
        });
    }

    [HttpPost("gitlab-registry")]
    public async Task<IActionResult> SaveGitLabRegistryCredentials(GitLabRegistryCredentialsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "gitlab-registry") is IActionResult locked)
            return locked;

        var existing = await _settings.GetPortalGitLabRegistryCredentialsAsync();
        var effectiveProjectId = string.IsNullOrWhiteSpace(request.ProjectId) ? existing.ProjectId : request.ProjectId;

        if (string.IsNullOrWhiteSpace(effectiveProjectId))
            return BadRequest(new { message = "A Project ID (or path) is required." });

        await _settings.SavePortalGitLabRegistryCredentialsAsync(request);

        return Ok(new { configured = true });
    }

    [HttpDelete("gitlab-registry")]
    public async Task<IActionResult> ClearGitLabRegistryCredentials()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "gitlab-registry") is IActionResult locked)
            return locked;

        await _settings.ClearPortalGitLabRegistryCredentialsAsync();

        return Ok(new { success = true });
    }

    // ---- GitLab Registry: browse --------------------------------------------

    [HttpGet("gitlab-registry/repositories")]
    public async Task<IActionResult> GetGitLabRepositories()
    {
        var creds = await _settings.GetPortalGitLabRegistryCredentialsAsync();
        return Ok(await _registry.GetGitLabRepositoriesAsync(creds));
    }

    [HttpGet("gitlab-registry/repositories/{repositoryId}/tags")]
    public async Task<IActionResult> GetGitLabTags(string repositoryId)
    {
        var creds = await _settings.GetPortalGitLabRegistryCredentialsAsync();
        return Ok(await _registry.GetGitLabTagsAsync(creds, repositoryId));
    }

    // ---- JFrog Artifactory: credential status/save/clear --------------------

    [HttpGet("jfrog/status")]
    public async Task<IActionResult> GetJfrogStatus()
    {
        var creds = await _settings.GetPortalJfrogCredentialsAsync();

        return Ok(new JfrogStatusDto
        {
            Configured = creds.IsConfigured,
            HostUrl = creds.HostUrl ?? string.Empty
        });
    }

    [HttpPost("jfrog")]
    public async Task<IActionResult> SaveJfrogCredentials(JfrogCredentialsUpdateDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "jfrog") is IActionResult locked)
            return locked;

        var existing = await _settings.GetPortalJfrogCredentialsAsync();
        var effectiveHostUrl = string.IsNullOrWhiteSpace(request.HostUrl) ? existing.HostUrl : request.HostUrl;

        if (string.IsNullOrWhiteSpace(effectiveHostUrl))
            return BadRequest(new { message = "A host URL is required." });

        await _settings.SavePortalJfrogCredentialsAsync(request);

        return Ok(new { configured = true });
    }

    [HttpDelete("jfrog")]
    public async Task<IActionResult> ClearJfrogCredentials()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "change settings") is IActionResult denied)
            return denied;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "jfrog") is IActionResult locked)
            return locked;

        await _settings.ClearPortalJfrogCredentialsAsync();

        return Ok(new { success = true });
    }

    // ---- JFrog Artifactory: browse -------------------------------------------

    [HttpGet("jfrog/repositories")]
    public async Task<IActionResult> GetJfrogRepositories()
    {
        var creds = await _settings.GetPortalJfrogCredentialsAsync();
        return Ok(await _registry.GetJfrogRepositoriesAsync(creds));
    }

    [HttpGet("jfrog/repositories/{repositoryKey}/images")]
    public async Task<IActionResult> GetJfrogImages(string repositoryKey)
    {
        var creds = await _settings.GetPortalJfrogCredentialsAsync();
        return Ok(await _registry.GetJfrogImagesAsync(creds, repositoryKey));
    }

    [HttpGet("jfrog/repositories/{repositoryKey}/images/{imageName}/tags")]
    public async Task<IActionResult> GetJfrogTags(string repositoryKey, string imageName)
    {
        var creds = await _settings.GetPortalJfrogCredentialsAsync();
        return Ok(await _registry.GetJfrogTagsAsync(creds, repositoryKey, imageName));
    }
}

using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Docker Hub, GHCR, GitLab Registry, JFrog, Harbor, Nexus - all six
// standalone registries on the Container Registry hub (see
// ContainerRegistry.jsx). Session-scoped: each visitor connects their own
// credential, isolated from every other visitor (same posture as ECR/ACR/
// Artifact Registry browsing on this same hub, and as AWS/Azure/GCP/GitHub
// credentials elsewhere in this app) - no AdminGate on save/clear, just the
// same screen-lock PIN gate every session credential goes through (see
// CredentialGate). Browsing (repositories/tags/packages/versions) has no
// gate at all and reads only the CALLING session's own credential, never
// another visitor's.
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

    // Harbor/Nexus share PortalHostCredentials' generic (HostUrl, Username,
    // Password) shape - see its own comment - so their status/save/clear
    // routes stay generic-by-provider like Docker Hub/GHCR's above, just
    // against a different credential DTO.
    private static IActionResult? ValidateHostProvider(string provider) =>
        provider is "harbor" or "nexus"
            ? null
            : new NotFoundObjectResult(new { message = $"Unknown registry \"{provider}\"." });

    // ---- Credential status/save/clear -----------------------------------

    [HttpGet("{provider}/status")]
    public async Task<IActionResult> GetStatus(string provider)
    {
        if (ValidateProvider(provider) is IActionResult invalid)
            return invalid;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync(provider, key);

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

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var existing = await _settings.GetUserPaasCredentialsAsync(provider, key);
        var effectiveUsername = string.IsNullOrWhiteSpace(request.AccountId) ? existing.AccountId : request.AccountId;

        if (string.IsNullOrWhiteSpace(effectiveUsername))
            return BadRequest(new { message = "A username is required." });

        await _settings.SaveUserPaasCredentialsAsync(provider, key, request);

        return Ok(new { configured = true });
    }

    [HttpDelete("{provider}")]
    public async Task<IActionResult> ClearCredentials(string provider)
    {
        if (ValidateProvider(provider) is IActionResult invalid)
            return invalid;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserPaasCredentialsAsync(provider, key);
        _activity.RevokeCredentialUnlock(key, provider);

        return Ok(new { success = true });
    }

    // ---- Docker Hub browse -------------------------------------------------

    [HttpGet("dockerhub/repositories")]
    public async Task<IActionResult> GetDockerHubRepositories()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync("dockerhub", key);
        return Ok(await _registry.GetDockerHubRepositoriesAsync(creds));
    }

    [HttpGet("dockerhub/repositories/{repositoryName}/tags")]
    public async Task<IActionResult> GetDockerHubTags(string repositoryName)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync("dockerhub", key);
        return Ok(await _registry.GetDockerHubTagsAsync(creds, repositoryName));
    }

    // ---- GHCR browse ------------------------------------------------------

    [HttpGet("ghcr/packages")]
    public async Task<IActionResult> GetGhcrPackages()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync("ghcr", key);
        return Ok(await _registry.GetGhcrPackagesAsync(creds));
    }

    [HttpGet("ghcr/packages/{packageName}/versions")]
    public async Task<IActionResult> GetGhcrVersions(string packageName)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserPaasCredentialsAsync("ghcr", key);
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
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGitLabRegistryCredentialsAsync(key);

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
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "gitlab-registry") is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var existing = await _settings.GetUserGitLabRegistryCredentialsAsync(key);
        var effectiveProjectId = string.IsNullOrWhiteSpace(request.ProjectId) ? existing.ProjectId : request.ProjectId;

        if (string.IsNullOrWhiteSpace(effectiveProjectId))
            return BadRequest(new { message = "A Project ID (or path) is required." });

        await _settings.SaveUserGitLabRegistryCredentialsAsync(key, request);

        return Ok(new { configured = true });
    }

    [HttpDelete("gitlab-registry")]
    public async Task<IActionResult> ClearGitLabRegistryCredentials()
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "gitlab-registry") is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserGitLabRegistryCredentialsAsync(key);
        _activity.RevokeCredentialUnlock(key, "gitlab-registry");

        return Ok(new { success = true });
    }

    // ---- GitLab Registry: browse --------------------------------------------

    [HttpGet("gitlab-registry/repositories")]
    public async Task<IActionResult> GetGitLabRepositories()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGitLabRegistryCredentialsAsync(key);
        return Ok(await _registry.GetGitLabRepositoriesAsync(creds));
    }

    [HttpGet("gitlab-registry/repositories/{repositoryId}/tags")]
    public async Task<IActionResult> GetGitLabTags(string repositoryId)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserGitLabRegistryCredentialsAsync(key);
        return Ok(await _registry.GetGitLabTagsAsync(creds, repositoryId));
    }

    // ---- JFrog Artifactory: credential status/save/clear --------------------

    [HttpGet("jfrog/status")]
    public async Task<IActionResult> GetJfrogStatus()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserJfrogCredentialsAsync(key);

        return Ok(new JfrogStatusDto
        {
            Configured = creds.IsConfigured,
            HostUrl = creds.HostUrl ?? string.Empty
        });
    }

    [HttpPost("jfrog")]
    public async Task<IActionResult> SaveJfrogCredentials(JfrogCredentialsUpdateDto request)
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "jfrog") is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var existing = await _settings.GetUserJfrogCredentialsAsync(key);
        var effectiveHostUrl = string.IsNullOrWhiteSpace(request.HostUrl) ? existing.HostUrl : request.HostUrl;

        if (string.IsNullOrWhiteSpace(effectiveHostUrl))
            return BadRequest(new { message = "A host URL is required." });

        await _settings.SaveUserJfrogCredentialsAsync(key, request);

        return Ok(new { configured = true });
    }

    [HttpDelete("jfrog")]
    public async Task<IActionResult> ClearJfrogCredentials()
    {
        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, "jfrog") is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserJfrogCredentialsAsync(key);
        _activity.RevokeCredentialUnlock(key, "jfrog");

        return Ok(new { success = true });
    }

    // ---- JFrog Artifactory: browse -------------------------------------------

    [HttpGet("jfrog/repositories")]
    public async Task<IActionResult> GetJfrogRepositories()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserJfrogCredentialsAsync(key);
        return Ok(await _registry.GetJfrogRepositoriesAsync(creds));
    }

    [HttpGet("jfrog/repositories/{repositoryKey}/images")]
    public async Task<IActionResult> GetJfrogImages(string repositoryKey)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserJfrogCredentialsAsync(key);
        return Ok(await _registry.GetJfrogImagesAsync(creds, repositoryKey));
    }

    [HttpGet("jfrog/repositories/{repositoryKey}/images/{imageName}/tags")]
    public async Task<IActionResult> GetJfrogTags(string repositoryKey, string imageName)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserJfrogCredentialsAsync(key);
        return Ok(await _registry.GetJfrogTagsAsync(creds, repositoryKey, imageName));
    }

    // ---- Harbor/Nexus: credential status/save/clear --------------------

    [HttpGet("{provider}/host-status")]
    public async Task<IActionResult> GetHostStatus(string provider)
    {
        if (ValidateHostProvider(provider) is IActionResult invalid)
            return invalid;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserHostCredentialsAsync(provider, key);

        return Ok(new HostCredentialStatusDto
        {
            Configured = creds.IsConfigured,
            HostUrl = creds.HostUrl ?? string.Empty,
            Username = creds.Username ?? string.Empty
        });
    }

    [HttpPost("{provider}/host")]
    public async Task<IActionResult> SaveHostCredentials(string provider, HostCredentialsUpdateDto request)
    {
        if (ValidateHostProvider(provider) is IActionResult invalid)
            return invalid;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var existing = await _settings.GetUserHostCredentialsAsync(provider, key);
        var effectiveHostUrl = string.IsNullOrWhiteSpace(request.HostUrl) ? existing.HostUrl : request.HostUrl;

        if (string.IsNullOrWhiteSpace(effectiveHostUrl))
            return BadRequest(new { message = "A host URL is required." });

        await _settings.SaveUserHostCredentialsAsync(provider, key, request);

        return Ok(new { configured = true });
    }

    [HttpDelete("{provider}/host")]
    public async Task<IActionResult> ClearHostCredentials(string provider)
    {
        if (ValidateHostProvider(provider) is IActionResult invalid)
            return invalid;

        if (await CredentialGate.DenyUnlessUnlockedAsync(this, _settings, _activity, provider) is IActionResult locked)
            return locked;

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        await _settings.ClearUserHostCredentialsAsync(provider, key);
        _activity.RevokeCredentialUnlock(key, provider);

        return Ok(new { success = true });
    }

    // ---- Harbor browse ---------------------------------------------------

    [HttpGet("harbor/projects")]
    public async Task<IActionResult> GetHarborProjects()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserHostCredentialsAsync("harbor", key);
        return Ok(await _registry.GetHarborProjectsAsync(creds));
    }

    [HttpGet("harbor/projects/{projectName}/repositories")]
    public async Task<IActionResult> GetHarborRepositories(string projectName)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserHostCredentialsAsync("harbor", key);
        return Ok(await _registry.GetHarborRepositoriesAsync(creds, projectName));
    }

    [HttpGet("harbor/projects/{projectName}/repositories/{repositoryName}/artifacts")]
    public async Task<IActionResult> GetHarborArtifacts(string projectName, string repositoryName)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserHostCredentialsAsync("harbor", key);
        return Ok(await _registry.GetHarborArtifactsAsync(creds, projectName, repositoryName));
    }

    // ---- Nexus browse ------------------------------------------------------

    [HttpGet("nexus/repositories")]
    public async Task<IActionResult> GetNexusRepositories()
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserHostCredentialsAsync("nexus", key);
        return Ok(await _registry.GetNexusRepositoriesAsync(creds));
    }

    [HttpGet("nexus/repositories/{repositoryName}/images")]
    public async Task<IActionResult> GetNexusImages(string repositoryName)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserHostCredentialsAsync("nexus", key);
        return Ok(await _registry.GetNexusImagesAsync(creds, repositoryName));
    }

    [HttpGet("nexus/repositories/{repositoryName}/images/{imageName}/tags")]
    public async Task<IActionResult> GetNexusTags(string repositoryName, string imageName)
    {
        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var creds = await _settings.GetUserHostCredentialsAsync("nexus", key);
        return Ok(await _registry.GetNexusTagsAsync(creds, repositoryName, imageName));
    }
}

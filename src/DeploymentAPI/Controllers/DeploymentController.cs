using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// No class-level [Authorize]: Deploy() already runs through AdminGate,
// which is bootstrap-aware (see AdminGate/SettingsController) — a blanket
// attribute here would block that intentional bootstrap flow.
[ApiController]
[Route("api/deployment")]
public class DeploymentController : ControllerBase
{
    private readonly DeploymentService _service;
    private readonly SettingsService _settings;
    private readonly GitHubAuthService _githubAuth;
    private readonly OrgCredentialService _orgCredentials;
    private readonly MembershipService _membership;
    private readonly OrgAuthorizationService _orgAuth;

    public DeploymentController(
        DeploymentService service,
        SettingsService settings,
        GitHubAuthService githubAuth,
        OrgCredentialService orgCredentials,
        MembershipService membership,
        OrgAuthorizationService orgAuth)
    {
        _service = service;
        _settings = settings;
        _githubAuth = githubAuth;
        _orgCredentials = orgCredentials;
        _membership = membership;
        _orgAuth = orgAuth;
    }

    // Triggering a real GitHub Actions run against the configured repo is
    // exactly the kind of action the admin allowlist exists to gate — this
    // had no check at all before, meaning any anonymous visitor could kick
    // off a workflow run. allowRepoWrite: true additionally lets through
    // anyone whose connected token has real GitHub push access to the repo
    // (the same permission level GitHub's own Actions API itself requires
    // to dispatch a workflow_dispatch run) — not just people on the
    // portal's own admin allowlist/page grant, since requiring a SEPARATE
    // portal-side allowlist entry for someone who already has GitHub write
    // access to the repo added no real security here.
    //
    // X-Organization-Id absent/"personal" (the default - see OrgContext)
    // takes this EXACT path unchanged, byte for byte, regardless of
    // anything below - that's what keeps a Personal-context deploy immune
    // to any regression from the organization-scoped branch. A real
    // organization additionally requires deployments.execute (may I
    // deploy at all for this org) and credentials.use (may I deploy using
    // this org's saved GitHub connection, without ever seeing it - see
    // OrgCredentialService) before loading that org's credential via
    // GitHubAuthService.LoadForOrganizationAsync instead of the per-user
    // connection the request-start middleware already loaded.
    [HttpPost("deploy")]
    public async Task<IActionResult> Deploy(
        DeployDto request)
    {
        var orgHeader = Request.Headers["X-Organization-Id"].ToString();
        var isOrganizationContext = !string.IsNullOrWhiteSpace(orgHeader)
            && !string.Equals(orgHeader, "personal", StringComparison.OrdinalIgnoreCase);

        if (!isOrganizationContext)
        {
            if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "trigger a deployment", "deploy", allowRepoWrite: true) is IActionResult denied)
                return denied;

            var personalResult = await _service.DeployAsync(request);
            return Ok(personalResult);
        }

        if (!Guid.TryParse(orgHeader, out var organizationId))
            return StatusCode(400, new { message = "Invalid X-Organization-Id header." });

        var (userId, authDenied) = RequireAuth.RequireUserId(this);
        if (authDenied != null) return authDenied;

        var executeDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, organizationId, "deployments.execute", "trigger a deployment");
        if (executeDenied != null) return executeDenied;

        var useDenied = await OrgAuthGate.DenyUnlessPermissionAsync(
            this, _membership, _orgAuth, userId!, organizationId, "credentials.use", "deploy using this organization's credentials");
        if (useDenied != null) return useDenied;

        await _githubAuth.LoadForOrganizationAsync(organizationId, _orgCredentials);

        if (!_githubAuth.HasToken || string.IsNullOrWhiteSpace(_githubAuth.Owner) || string.IsNullOrWhiteSpace(_githubAuth.Repository))
        {
            return Ok(new DeployResultDto
            {
                Success = false,
                Message = "This organization doesn't have a GitHub credential configured yet."
            });
        }

        var orgResult = await _service.DeployAsync(request);
        return Ok(orgResult);
    }
}
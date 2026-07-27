using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// No [Authorize] anywhere: Decide() already runs through AdminGate, which
// is bootstrap-aware (see AdminGate/SettingsController); the read actions
// are scoped to whatever repo/token PortalIdentity resolved for this caller
// (see GitHubAuthService), no login required.
[ApiController]
[Route("api/approvals")]
public class ApprovalsController : ControllerBase
{
    private readonly GitHubApiService _service;
    private readonly SettingsService _settings;

    public ApprovalsController(GitHubApiService service, SettingsService settings)
    {
        _service = service;
        _settings = settings;
    }

    [HttpGet("pending")]
    public async Task<IActionResult> Pending()
    {
        return Ok(await _service.GetPendingApprovalsAsync());
    }

    // Approving/rejecting a protected-environment deployment had no
    // server-side check at all before this — the Approvals nav tab/button
    // being hidden client-side for non-admins is a UX nicety, not access
    // control; anyone who called this endpoint directly could approve or
    // reject regardless of what the UI showed them.
    [HttpPost("decide")]
    public async Task<IActionResult> Decide(ApprovalDecisionDto decision)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "approve or reject a release") is IActionResult denied)
            return denied;

        if (decision.RunId <= 0 || decision.EnvironmentIds.Count == 0)
            return BadRequest("runId and at least one environmentId are required.");

        await _service.SubmitApprovalAsync(decision);
        return Ok();
    }

    [HttpGet("history")]
    public async Task<IActionResult> History()
    {
        return Ok(await _service.GetApprovalHistoryAsync());
    }
}

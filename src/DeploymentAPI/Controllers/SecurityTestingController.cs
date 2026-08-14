using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ActionConstraints;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace DeploymentAPI.Controllers;

// Settings > Security Testing Lab - restricted to the single super-admin
// identity (see AdminGate.DenyUnlessSuperAdminAsync), same gate as
// Database Management and Admin Access. Every action here starts with
// that check; nothing in this controller is reachable by a general admin,
// let alone an anonymous or Viewer-role caller. This is the authorization
// layer of the chain the feature's own spec insisted on: Authorized Admin
// -> Authorized Target (IsSecurityTestingTargetAuthorizedAsync below) ->
// SSRF validation (SecurityTestingScanService/SsrfGuard) -> a bounded,
// non-destructive request -> redacted findings. No action here ever
// accepts an HTTP method, request body, or header set from the caller to
// forward to the target - only a URL, checked against the allowlist
// before anything is fetched.
[ApiController]
[Route("api/admin/security-testing")]
public class SecurityTestingController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly SecurityTestingScanService _scanner;
    private readonly SessionActivityService _activity;
    private readonly ActivityLogService _log;

    public SecurityTestingController(
        SettingsService settings,
        SecurityTestingScanService scanner,
        SessionActivityService activity,
        ActivityLogService log)
    {
        _settings = settings;
        _scanner = scanner;
        _activity = activity;
        _log = log;
    }

    private static bool TryParseHttpUrl(string? url, out Uri uri)
    {
        uri = null!;

        // Only http/https ever gets past this - javascript:, data:, file:,
        // chrome:, about:, and every other scheme is rejected outright,
        // before it's ever passed to Uri comparisons or the fetch layer.
        return !string.IsNullOrWhiteSpace(url)
            && Uri.TryCreate(url.Trim(), UriKind.Absolute, out uri!)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }

    [HttpGet("targets")]
    public async Task<IActionResult> GetTargets()
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "view authorized security-testing targets") is IActionResult denied)
            return denied;

        return Ok(await _settings.GetSecurityTestingTargetsAsync());
    }

    [HttpPost("targets")]
    public async Task<IActionResult> AddTarget(AddSecurityTestingTargetRequestDto request)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "add an authorized security-testing target") is IActionResult denied)
            return denied;

        if (!TryParseHttpUrl(request.Url, out var uri))
            return BadRequest(new { message = "Enter a valid http:// or https:// URL." });

        var target = await _settings.AddSecurityTestingTargetAsync(uri.ToString());

        _log.LogInfo("SecurityTesting", $"Target added: {uri}");

        return Ok(target);
    }

    [HttpDelete("targets/{id}")]
    public async Task<IActionResult> RemoveTarget(string id)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "remove an authorized security-testing target") is IActionResult denied)
            return denied;

        await _settings.RemoveSecurityTestingTargetAsync(id);

        return Ok(new { success = true });
    }

    [HttpPost("scan")]
    public async Task<IActionResult> Scan(SecurityScanRequestDto request)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "run a security scan") is IActionResult denied)
            return denied;

        if (!TryParseHttpUrl(request.Url, out var uri))
            return BadRequest(new { message = "Enter a valid http:// or https:// URL." });

        if (!await _settings.IsSecurityTestingTargetAuthorizedAsync(uri))
        {
            return StatusCode(403, new
            {
                message = "This target isn't on the authorized-targets list. Add it there first - " +
                    "only explicitly authorized targets can be scanned."
            });
        }

        // Active mode requires BOTH flags true, checked here regardless of
        // what the frontend sent as ActiveMode alone - see
        // SecurityScanRequestDto's own comment on why these are separate.
        var activeMode = request.ActiveMode && request.ActiveModeConfirmed;

        var (allowed, reason) = _activity.TryRegisterScanAttempt();

        if (!allowed)
            return StatusCode(429, new { message = reason });

        _log.LogInfo("SecurityTesting", $"Scan started: {uri} (active mode: {activeMode})");

        SecurityScanResultDto result;

        try
        {
            result = await _scanner.ScanAsync(uri, activeMode);
        }
        catch (Exception ex)
        {
            _log.LogError("SecurityTesting", $"Scan failed for {uri}: {ex.Message}");
            return StatusCode(500, new { message = "The scan failed unexpectedly. See the server's activity log for details." });
        }

        await _settings.SaveSecurityTestingScanAsync(result);

        _log.LogInfo("SecurityTesting",
            result.Error != null
                ? $"Scan completed with an error for {uri}: {result.Error}"
                : $"Scan completed for {uri}: score {result.SecurityScore}, " +
                  $"{result.Summary.Critical} critical / {result.Summary.High} high / " +
                  $"{result.Summary.Medium} medium / {result.Summary.Low} low / {result.Summary.Info} info.");

        return Ok(result);
    }

    // "When we add any new page, that should be automatically detected" -
    // for the BACKEND half of that, this reflects the real, live routing
    // table ASP.NET Core itself built at startup, rather than a hand-
    // maintained list that could silently drift out of date. A newly
    // added controller/action shows up here automatically the next time
    // the app starts - nothing here needs to be updated when the app
    // grows. (The frontend half - the portal's own tabs/Settings sub-
    // pages - can't be reflected this way, since the backend has no
    // visibility into the React app's client-side routing; the frontend
    // derives its own list from Sidebar.jsx's FLAT_TABS/settingsViews.js's
    // VIEWS instead, the same single source of truth its own navigation
    // already renders from.)
    [HttpGet("discovered-routes")]
    public async Task<IActionResult> GetDiscoveredRoutes([FromServices] IActionDescriptorCollectionProvider provider)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "view discovered application routes") is IActionResult denied)
            return denied;

        var routes = provider.ActionDescriptors.Items
            .OfType<ControllerActionDescriptor>()
            .Where(a => !string.IsNullOrWhiteSpace(a.AttributeRouteInfo?.Template))
            .Select(a => new DiscoveredRouteDto
            {
                Controller = a.ControllerName,
                Method = a.ActionConstraints?.OfType<HttpMethodActionConstraint>()
                    .FirstOrDefault()?.HttpMethods.FirstOrDefault() ?? "GET",
                Path = "/" + a.AttributeRouteInfo!.Template!.TrimStart('/')
            })
            .DistinctBy(r => (r.Method, r.Path))
            .OrderBy(r => r.Controller).ThenBy(r => r.Path)
            .ToList();

        return Ok(routes);
    }

    [HttpGet("scans")]
    public async Task<IActionResult> GetScans()
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "view security-scan history") is IActionResult denied)
            return denied;

        return Ok(await _settings.GetSecurityTestingScansAsync());
    }

    [HttpGet("scans/{id}")]
    public async Task<IActionResult> GetScan(string id)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "view a security-scan result") is IActionResult denied)
            return denied;

        var scan = await _settings.GetSecurityTestingScanAsync(id);

        return scan == null ? NotFound(new { message = "Scan not found." }) : Ok(scan);
    }

    [HttpDelete("scans/{id}")]
    public async Task<IActionResult> DeleteScan(string id)
    {
        if (await AdminGate.DenyUnlessSuperAdminAsync(this, "delete a security-scan result") is IActionResult denied)
            return denied;

        await _settings.DeleteSecurityTestingScanAsync(id);

        return Ok(new { success = true });
    }
}

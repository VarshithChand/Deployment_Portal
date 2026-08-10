using DeploymentAPI.DTOs;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Backs the Services page's "Security (SecurityAPI)" tab's Audit Log
// panel — see AuditLogStore for why this lives in DeploymentAPI itself
// rather than a separate origin.
[ApiController]
[Route("api/security/audit-logs")]
public class SecurityAuditLogController : ControllerBase
{
    private readonly AuditLogStore _logs;

    public SecurityAuditLogController(AuditLogStore logs)
    {
        _logs = logs;
    }

    [HttpGet]
    public IActionResult GetRecent([FromQuery] int limit = 200)
    {
        return Ok(_logs.GetRecent(limit));
    }

    [HttpPost]
    public IActionResult Create(CreateAuditLogRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Action))
            return BadRequest(new { message = "An action is required." });

        return Ok(_logs.Add(request));
    }
}

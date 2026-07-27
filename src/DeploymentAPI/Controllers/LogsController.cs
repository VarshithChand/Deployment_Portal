using DeploymentAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

[Authorize]
[ApiController]
[Route("api/logs")]
public class LogsController : ControllerBase
{
    private readonly ActivityLogService _logs;

    public LogsController(ActivityLogService logs)
    {
        _logs = logs;
    }

    [HttpGet]
    public IActionResult Get()
    {
        return Ok(_logs.GetRecent());
    }
}

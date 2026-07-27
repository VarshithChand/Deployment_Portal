using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

[ApiController]
[Route("api/history")]
public class HistoryController : ControllerBase
{
    private readonly GitHubApiService _service;

    public HistoryController(GitHubApiService service)
    {
        _service = service;
    }

    [HttpGet("runs")]
    public async Task<IActionResult> Runs()
    {
        var runs = await _service.GetWorkflowRuns();
        return Ok(runs);
    }

    [HttpGet("run/{id:long}")]
    public async Task<IActionResult> Run(long id)
    {
        var run = await _service.GetWorkflowRun(id);

        if (run == null)
            return NotFound();

        return Ok(run);
    }
}
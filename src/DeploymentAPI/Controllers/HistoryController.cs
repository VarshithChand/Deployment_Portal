using DeploymentAPI.DTOs;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

[ApiController]
[Route("api/history")]
public class HistoryController : ControllerBase
{
    private readonly GitHubApiService _service;
    private readonly ErrorAnalysisService _analysis;

    public HistoryController(GitHubApiService service, ErrorAnalysisService analysis)
    {
        _service = service;
        _analysis = analysis;
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

    // What History's row expansion calls to explain a failed/cancelled
    // run - lazily, only once a row is actually expanded, since most
    // runs in a page of history are never clicked at all.
    [HttpGet("run/{id:long}/errors")]
    public async Task<IActionResult> RunErrors(long id)
    {
        var errors = await _service.GetWorkflowRunErrorsAsync(id);
        return Ok(errors);
    }

    // Backs the "View full message" popup's plain-English explanation -
    // tries GitHub Models against this visitor's own PAT first, falls
    // back to a built-in heuristic when that's unavailable. See
    // ErrorAnalysisService for why this never just errors out instead.
    [HttpPost("errors/analyze")]
    public async Task<IActionResult> AnalyzeError(AnalyzeErrorRequestDto request)
    {
        var result = await _analysis.AnalyzeAsync(request);
        return Ok(result);
    }
}
using DeploymentAPI.DTOs;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Standalone (not nested under /api/pmscore/projects/{id}) since a task
// is looked up and edited by its own id once created —
// PmsCoreProjectsController handles creating a task under a specific
// project.
[ApiController]
[Route("api/pmscore/tasks")]
public class PmsCoreTasksController : ControllerBase
{
    private readonly ProjectStore _projects;

    public PmsCoreTasksController(ProjectStore projects)
    {
        _projects = projects;
    }

    [HttpGet("{id}")]
    public IActionResult GetById(int id)
    {
        var task = _projects.GetTask(id);
        return task is null ? NotFound() : Ok(task);
    }

    [HttpPut("{id}")]
    public IActionResult Update(int id, UpdateTaskRequest request)
    {
        var updated = _projects.UpdateTask(id, request);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(int id)
    {
        return _projects.RemoveTask(id) ? NoContent() : NotFound();
    }
}

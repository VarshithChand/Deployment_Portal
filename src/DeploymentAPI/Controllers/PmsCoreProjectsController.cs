using DeploymentAPI.DTOs;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Backs the Services page's "Projects (PMSCoreAPI)" tab — see
// ProjectStore for why this lives in DeploymentAPI itself rather than a
// separate origin.
[ApiController]
[Route("api/pmscore/projects")]
public class PmsCoreProjectsController : ControllerBase
{
    private readonly ProjectStore _projects;

    public PmsCoreProjectsController(ProjectStore projects)
    {
        _projects = projects;
    }

    [HttpGet]
    public IActionResult GetAll()
    {
        return Ok(_projects.GetAllProjects());
    }

    [HttpGet("{id}")]
    public IActionResult GetById(int id)
    {
        var project = _projects.GetProject(id);
        return project is null ? NotFound() : Ok(project);
    }

    [HttpPost]
    public IActionResult Create(CreateProjectRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "A project name is required." });

        var created = _projects.AddProject(request);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id}")]
    public IActionResult Update(int id, UpdateProjectRequest request)
    {
        var updated = _projects.UpdateProject(id, request);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(int id)
    {
        return _projects.RemoveProject(id) ? NoContent() : NotFound();
    }

    [HttpGet("{id}/tasks")]
    public IActionResult GetTasks(int id)
    {
        if (_projects.GetProject(id) is null) return NotFound();
        return Ok(_projects.GetTasksForProject(id));
    }

    [HttpPost("{id}/tasks")]
    public IActionResult CreateTask(int id, CreateTaskRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            return BadRequest(new { message = "A task title is required." });

        var task = _projects.AddTask(id, request);
        return task is null ? NotFound(new { message = $"No project with id {id}." }) : Ok(task);
    }
}

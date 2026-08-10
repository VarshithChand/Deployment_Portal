using DeploymentAPI.DTOs;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Backs the Services page's "Users (AdminAPI)" tab — see UserStore for
// why this lives in DeploymentAPI itself rather than a separate origin.
[ApiController]
[Route("api/admin/users")]
public class AdminUsersController : ControllerBase
{
    private readonly UserStore _users;

    public AdminUsersController(UserStore users)
    {
        _users = users;
    }

    [HttpGet]
    public IActionResult GetAll()
    {
        return Ok(_users.GetAll());
    }

    [HttpGet("{id}")]
    public IActionResult GetById(int id)
    {
        var user = _users.GetById(id);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpPost]
    public IActionResult Create(CreateUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username))
            return BadRequest(new { message = "A username is required." });

        var created = _users.Add(request);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id}")]
    public IActionResult Update(int id, UpdateUserRequest request)
    {
        var updated = _users.Update(id, request);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(int id)
    {
        return _users.Remove(id) ? NoContent() : NotFound();
    }
}

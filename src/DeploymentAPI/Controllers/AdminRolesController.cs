using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Fixed set, not stored/editable — this sample panel doesn't need custom
// roles, just enough for AdminUsersController's Role field to mean
// something.
[ApiController]
[Route("api/admin/roles")]
public class AdminRolesController : ControllerBase
{
    private static readonly string[] Roles = { "Admin", "Manager", "Viewer" };

    [HttpGet]
    public IActionResult GetAll()
    {
        return Ok(Roles);
    }
}

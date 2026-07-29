using Microsoft.AspNetCore.Mvc;

#
namespace AdminAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new
        {
            Service = "AdminAPI",
            Status = "Running"
        });
    }
}

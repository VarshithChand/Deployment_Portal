using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Services -> Application Support. Every action is admin-gated (the
// "services" pageKey matches AdminUsersController's own scoped-grant
// convention - an admin can be granted just this one page without the
// full allowlist). This is NOT the general-purpose Deployment Copilot
// (see AiController/DeploymentCopilot.jsx) - a separate, narrower,
// admin-only assistant scoped to version/deployment/health diagnostics
// only, reusing the same Gemini configuration but its own tool set
// (ApplicationSupportToolsService) and system instruction.
[ApiController]
[Route("api/admin/application-support")]
public class ApplicationSupportController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly ApplicationSupportToolsService _tools;
    private readonly IAiAssistantService _ai;
    private readonly ActivityLogService _log;

    public ApplicationSupportController(
        SettingsService settings,
        ApplicationSupportToolsService tools,
        IAiAssistantService ai,
        ActivityLogService log)
    {
        _settings = settings;
        _tools = tools;
        _ai = ai;
        _log = log;
    }

    private const string SystemInstruction =
        "You are Deployment Support Copilot, an admin-only diagnostic assistant inside the " +
        "Deployment Portal's Services -> Application Support page.\n\n" +
        "Your job is strictly limited to: application/frontend/backend version visibility, " +
        "deployment diagnostics, and helping the admin support users who report seeing an old " +
        "or mismatched version.\n\n" +
        "Use the provided tools to retrieve real version, deployment, health, and connected-user " +
        "data before answering. Never invent version numbers, commit SHAs, deployment status, " +
        "build numbers, or user version information under any circumstances. If a tool reports " +
        "something is unavailable, say so plainly: \"I cannot determine that from the available " +
        "application metadata.\"\n\n" +
        "When a frontend commit reported by a user differs from the current backend/deployment " +
        "commit, explain that as a likely stale browser cache, CDN cache, or an old open tab - " +
        "never claim certainty about the exact cause. Recommend a hard refresh as the standard " +
        "next step, and do not claim to have cleared anything yourself.\n\n" +
        "You are strictly read-only: you cannot restart services, deploy code, modify AWS " +
        "resources, modify database data, change credentials, or delete anything. Never claim an " +
        "action was performed. Never request or expose API keys, credentials, tokens, or database " +
        "connection details.\n\n" +
        "Keep answers concise and factual, clearly distinguishing what a tool actually reported " +
        "from your own analysis or recommendation.";

    [HttpGet("version")]
    public async Task<IActionResult> GetVersion()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view the application version", "services") is IActionResult denied)
            return denied;

        return Ok(_tools.GetVersion());
    }

    [HttpGet("health")]
    public async Task<IActionResult> GetHealth()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view application health", "services") is IActionResult denied)
            return denied;

        return Ok(await _tools.GetHealthAsync());
    }

    [HttpGet("latest-deployment")]
    public async Task<IActionResult> GetLatestDeployment()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view deployment information", "services") is IActionResult denied)
            return denied;

        return Ok(await _tools.GetLatestDeploymentAsync());
    }

    [HttpGet("user-versions")]
    public async Task<IActionResult> GetUserVersions()
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "view user versions", "services") is IActionResult denied)
            return denied;

        return Ok(await _tools.GetConnectedUserVersionsAsync());
    }

    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] AiChatRequestDto request)
    {
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "use Deployment Support Copilot", "services") is IActionResult denied)
            return denied;

        if (request.Messages == null || request.Messages.Count == 0)
            return BadRequest(new { message = "messages is required." });

        var creds = await _settings.GetAiAssistantCredentialsAsync();

        if (!creds.IsConfigured)
        {
            return Ok(new AiChatResponseDto
            {
                Success = false,
                Reply = "Deployment Support Copilot isn't configured yet. Add a Gemini API key and " +
                        "model in Settings → Credentials → AI Assistant."
            });
        }

        var history = request.Messages.TakeLast(20).ToList();

        var result = await _ai.ChatAsync(
            SystemInstruction,
            history,
            _tools.GetToolDefinitions(),
            (name, argsJson) => _tools.ExecuteToolAsync(name, argsJson),
            creds.ApiKey!,
            creds.Model);

        var key = PortalIdentity.GetOrCreateKey(HttpContext);
        var actor = await AdminGate.ResolveCallerLoginAsync(this) ?? $"session {key[..Math.Min(8, key.Length)]}";

        // Never the actual question/answer text - same reasoning as
        // AiController's own audit logging for Deployment Copilot.
        var toolsNote = result.ToolsUsed.Count > 0 ? $" — tools used: {string.Join(", ", result.ToolsUsed)}" : "";
        _log.LogInfo("Application Support", $"{actor} used Deployment Support Copilot{toolsNote}");

        if (!result.Success)
        {
            return Ok(new AiChatResponseDto
            {
                Success = false,
                Reply = result.Error ?? "Deployment Support Copilot couldn't answer that right now."
            });
        }

        return Ok(new AiChatResponseDto
        {
            Success = true,
            Reply = result.Reply,
            ToolsUsed = result.ToolsUsed
        });
    }
}

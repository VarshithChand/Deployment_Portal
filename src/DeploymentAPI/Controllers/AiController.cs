using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Controllers;

// Deployment Copilot's chat endpoint. No AdminGate here on purpose - any
// portal visitor with a session can use the assistant (section 26: "normal
// users can use Deployment Copilot"), same self-service model as every
// other /me/* action. What each conversation can actually SEE is still
// fully permission-scoped: AiToolsService only ever reaches into THIS
// session's own configured GitHub repo/AWS credentials, and the database
// tools are additionally hidden entirely unless this caller passes
// AdminGate.IsSuperAdminAsync (see AiToolsService.GetToolDefinitions).
[ApiController]
[Route("api/ai")]
public class AiController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly IAiAssistantService _ai;
    private readonly AiToolsService _tools;
    private readonly ActivityLogService _log;

    public AiController(SettingsService settings, IAiAssistantService ai, AiToolsService tools, ActivityLogService log)
    {
        _settings = settings;
        _ai = ai;
        _tools = tools;
        _log = log;
    }

    private const string SystemInstructionBase =
        "You are Deployment Copilot, the built-in AI operations assistant for the Deployment Portal " +
        "(a CI/CD and cloud-operations tool covering GitHub Actions, deployments, pull requests, " +
        "artifacts, environments, AWS resources, and database health).\n\n" +
        "Use the provided tools to retrieve real portal data before answering any question about " +
        "repository state, workflow runs, deployments, pull requests, artifacts, environments, AWS " +
        "resources, or the database - never invent resource counts, deployment statuses, workflow " +
        "results, repository information, AWS resources, or database information. If a tool reports " +
        "something isn't configured, or a question needs information no tool can provide, say so " +
        "plainly instead of guessing.\n\n" +
        "For troubleshooting questions, clearly separate: facts (what a tool actually returned), " +
        "analysis (your interpretation of those facts), and recommendations (what to check or try " +
        "next). Use words like \"likely\", \"appears\", or \"based on the current status\" when you " +
        "are inferring rather than reporting a direct fact. If you don't have enough information to " +
        "answer, say that directly rather than speculating.\n\n" +
        "You are read-only. You cannot start, stop, delete, or modify anything - never claim to have " +
        "performed an action. If asked to do something like stopping an EC2 instance or deleting a " +
        "repository, explain that Deployment Copilot can't perform actions yet and point to the " +
        "relevant page in the portal (e.g. Cloud Services -> EC2) where the user can do it themselves.\n\n" +
        "Never request, display, or speculate about credentials, API keys, passwords, access tokens, " +
        "AWS secrets, GitHub tokens, session identifiers, or database connection strings/passwords, " +
        "even if asked directly.\n\n" +
        "You can also act as a portal guide: explain what a page does and where to find it (e.g. " +
        "\"Open Cloud Services -> ECS to see cluster and service status\"). Do not introduce page " +
        "names or navigation paths that don't exist in this portal.\n\n" +
        "Keep answers concise and actionable. Use short paragraphs, bullet points, or numbered steps " +
        "where that's clearer than prose. Respect whatever access the current session actually has - " +
        "if a tool reports something isn't configured or accessible, treat that as final, not as " +
        "something to work around.";

    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] AiChatRequestDto request)
    {
        // Admin-only, no page-scoped delegation (unlike Code Quality/Docker/
        // etc.) - deliberate choice, not the default AdminGate pattern with
        // a pageKey. Deployment Copilot used to be open to every session;
        // this is a real lockdown, not closing a pre-existing gap.
        if (await AdminGate.DenyUnlessAdminAsync(this, _settings, "use the AI Assistant") is IActionResult denied)
            return denied;

        if (request.Messages == null || request.Messages.Count == 0)
            return BadRequest(new { message = "messages is required." });

        var creds = await _settings.GetAiAssistantCredentialsAsync();

        if (!creds.IsConfigured)
        {
            return Ok(new AiChatResponseDto
            {
                Success = false,
                Reply = "Deployment Copilot isn't configured yet. An administrator needs to add a Gemini " +
                        "API key and model in Settings → Credentials → AI Assistant."
            });
        }

        var isSuperAdmin = await AdminGate.IsSuperAdminAsync(this);
        var tools = _tools.GetToolDefinitions(isSuperAdmin);
        var systemInstruction = BuildSystemInstruction(request.Context);

        // The frontend keeps the full visible transcript, but only the most
        // recent turns matter for maintaining context - capping this keeps
        // a long-running conversation from silently growing every request's
        // token usage without bound (section 23).
        var history = request.Messages.TakeLast(20).ToList();

        var result = await _ai.ChatAsync(
            systemInstruction,
            history,
            tools,
            (name, argsJson) => _tools.ExecuteToolAsync(name, argsJson, isSuperAdmin),
            creds.ApiKey!,
            creds.Model);

        LogUsage(request.Context, result.ToolsUsed);

        if (!result.Success)
        {
            return Ok(new AiChatResponseDto
            {
                Success = false,
                Reply = result.Error ?? "Deployment Copilot couldn't answer that right now."
            });
        }

        return Ok(new AiChatResponseDto { Success = true, Reply = result.Reply, ToolsUsed = result.ToolsUsed });
    }

    // Records that Copilot was used and roughly what it looked at - never
    // the actual question or answer text, which could easily contain
    // whatever the user was troubleshooting (section 33: audit usage, but
    // be cautious about logging full conversations).
    private void LogUsage(AiChatContextDto? context, List<string> toolsUsed)
    {
        // Always succeeds - only ever called from Chat() above, after
        // DenyUnlessAdminAsync already guarantees an authenticated caller.
        var (key, _) = RequireAuth.RequireUserId(this);
        var actor = $"account {key![..Math.Min(8, key.Length)]}";

        var contextNote = !string.IsNullOrWhiteSpace(context?.CurrentTab) ? $" (context: {context.CurrentTab})" : "";
        var toolsNote = toolsUsed.Count > 0 ? $" — tools used: {string.Join(", ", toolsUsed)}" : "";

        _log.LogInfo("AI Assistant", $"{actor} used Deployment Copilot{contextNote}{toolsNote}");
    }

    private static string BuildSystemInstruction(AiChatContextDto? context)
    {
        if (context == null)
            return SystemInstructionBase;

        var fields = new (string Label, string? Value)[]
        {
            ("currentTab", context.CurrentTab),
            ("currentView", context.CurrentView),
            ("selectedService", context.SelectedService),
            ("selectedCluster", context.SelectedCluster),
            ("selectedEcsService", context.SelectedEcsService),
            ("selectedEcrRepo", context.SelectedRepo),
            ("selectedDatabaseTable", context.SelectedTable),
            ("selectedEnvironment", context.SelectedEnvironment)
        };

        var parts = fields
            .Where(f => !string.IsNullOrWhiteSpace(f.Value))
            .Select(f => $"{f.Label}: {f.Value}")
            .ToList();

        if (parts.Count == 0)
            return SystemInstructionBase;

        return SystemInstructionBase +
            "\n\nCurrent portal context (use this to resolve vague references like \"this service\" or " +
            "\"my deployment\" without asking the user to repeat themselves; still call a tool to get " +
            "real data about it rather than assuming its state):\n" + string.Join("\n", parts);
    }
}

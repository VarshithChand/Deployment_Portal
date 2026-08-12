namespace DeploymentAPI.DTOs;

// One turn in the conversation, as the frontend holds it — "user" or
// "model" (Gemini's own role naming). The frontend sends the whole visible
// history back on every message (see section 8/23 of the Deployment
// Copilot spec: no server-side chat storage, minimal data sent) rather
// than the backend persisting conversations anywhere.
public class AiChatMessageDto
{
    public string Role { get; set; } = "user";

    public string Content { get; set; } = string.Empty;
}

// Safe, non-sensitive portal context (section 16/17) - read straight off
// the current URL by the frontend (tab/view/service/etc. are already
// synced to query params by NavigationContext/CloudServices/Settings/
// Database, so this needs no new plumbing). Never anything from
// localStorage/credentials/tokens.
public class AiChatContextDto
{
    public string? CurrentTab { get; set; }

    public string? CurrentView { get; set; }

    public string? SelectedService { get; set; }

    public string? SelectedCluster { get; set; }

    public string? SelectedEcsService { get; set; }

    public string? SelectedRepo { get; set; }

    public string? SelectedTable { get; set; }

    public string? SelectedEnvironment { get; set; }
}

public class AiChatRequestDto
{
    public List<AiChatMessageDto> Messages { get; set; } = new();

    public AiChatContextDto? Context { get; set; }
}

public class AiChatResponseDto
{
    public bool Success { get; set; }

    public string Reply { get; set; } = string.Empty;

    // Which portal data tools were actually called to answer this message
    // (e.g. "get_workflow_runs", "get_ec2_instances") - shown nowhere
    // critical, just lets the UI/audit log say "used live EC2 data" rather
    // than being opaque about whether an answer is grounded in real data.
    public List<string> ToolsUsed { get; set; } = new();
}

// One tool Gemini can call, in the shape GeminiService needs to build a
// Gemini "functionDeclarations" block - Name/Description/ParametersSchema
// are provider-agnostic (ParametersSchema is a plain JSON-Schema-shaped
// object), so a future non-Gemini IAiAssistantService implementation could
// consume the exact same list.
public record AiToolDefinition(string Name, string Description, object ParametersSchema);

public class AiTestConnectionResultDto
{
    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;
}

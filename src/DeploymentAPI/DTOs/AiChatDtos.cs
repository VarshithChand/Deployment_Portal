namespace DeploymentAPI.DTOs;

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

// The frontend still displays the full visible transcript client-side (no
// server-side chat storage - section 8/23), but no longer RESENDS it every
// turn. Instead each request carries just the new message plus the prior
// turn's InteractionId, and Gemini's own Interactions API resolves history
// server-side on Google's end (see GeminiService) - lighter, and it's the
// only chaining method the new API actually offers.
public class AiChatRequestDto
{
    public string Message { get; set; } = string.Empty;

    public string? PreviousInteractionId { get; set; }

    public AiChatContextDto? Context { get; set; }
}

public class AiChatResponseDto
{
    public bool Success { get; set; }

    public string Reply { get; set; } = string.Empty;

    // Echoed back so the frontend can chain the NEXT message off this one
    // via PreviousInteractionId above - null on failure (nothing to chain
    // off, and don't want a broken interaction poisoning the next turn).
    public string? InteractionId { get; set; }

    // Which portal data tools were actually called to answer this message
    // (e.g. "get_workflow_runs", "get_ec2_instances") - shown nowhere
    // critical, just lets the UI/audit log say "used live EC2 data" rather
    // than being opaque about whether an answer is grounded in real data.
    public List<string> ToolsUsed { get; set; } = new();
}

// One tool Gemini can call. Name/Description/ParametersSchema are
// provider-agnostic (ParametersSchema is a plain JSON-Schema-shaped
// object), so a future non-Gemini IAiAssistantService implementation could
// consume the exact same list.
public record AiToolDefinition(string Name, string Description, object ParametersSchema);

public class AiTestConnectionResultDto
{
    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;
}

using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Provider-agnostic AI assistant abstraction - GeminiService is the only
// implementation today (see section 2/24 of the Deployment Copilot spec:
// "start with Gemini, keep the provider replaceable"). Nothing outside
// this interface (AiController, AiToolsService) knows it's talking to
// Gemini specifically, or that Gemini's own REST surface (the Interactions
// API) works via ID-chained turns rather than a resent message array -
// that's an implementation detail of GeminiService alone.
public interface IAiAssistantService
{
    // A lightweight round-trip used only by the Credentials page's "Test
    // Connection" button - no tools, no conversation history, just "can
    // this API key talk to this model at all."
    Task<AiTestConnectionResultDto> TestConnectionAsync(string apiKey, string model);

    // One turn of the conversation. previousInteractionId chains onto the
    // prior turn (null starts a fresh conversation) - the provider itself
    // resolves history server-side from that ID, so the caller never needs
    // to resend earlier turns. The provider may ask to call one or more of
    // `tools` before giving a final answer, in which case `executeTool` is
    // invoked (name, raw JSON arguments) and its string result fed back in
    // - looped until a plain text reply comes back or a safety limit is
    // hit. `executeTool` is supplied by the caller (AiToolsService) so this
    // service never needs to know anything about GitHub/AWS/the database.
    Task<AiChatResultDto> ChatAsync(
        string systemInstruction,
        string message,
        string? previousInteractionId,
        List<AiToolDefinition> tools,
        Func<string, string, Task<string>> executeTool,
        string apiKey,
        string model);
}

public class AiChatResultDto
{
    public bool Success { get; set; }

    public string Reply { get; set; } = string.Empty;

    public string? Error { get; set; }

    public string? InteractionId { get; set; }

    public List<string> ToolsUsed { get; set; } = new();
}

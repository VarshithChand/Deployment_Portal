using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Provider-agnostic AI assistant abstraction - GeminiService is the only
// implementation today (see section 2/24 of the Deployment Copilot spec:
// "start with Gemini, keep the provider replaceable"). Nothing outside
// this interface (AiController, AiToolsService) knows it's talking to
// Gemini specifically - a future OpenAiService/ClaudeService could
// implement this same interface without either caller changing.
public interface IAiAssistantService
{
    // A lightweight round-trip used only by the Credentials page's "Test
    // Connection" button - no tools, no conversation history, just "can
    // this API key talk to this model at all."
    Task<AiTestConnectionResultDto> TestConnectionAsync(string apiKey, string model);

    // The real chat turn, with tool/function-calling support: the provider
    // may ask to call one or more of `tools` before giving a final answer,
    // in which case `executeTool` is invoked (name, raw JSON arguments) and
    // its string result fed back in — looped until the provider returns a
    // plain text reply or a safety limit is hit. `executeTool` is supplied
    // by the caller (AiToolsService) so this service never needs to know
    // anything about GitHub/AWS/the database itself.
    Task<AiChatResultDto> ChatAsync(
        string systemInstruction,
        List<AiChatMessageDto> history,
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

    public List<string> ToolsUsed { get; set; } = new();
}

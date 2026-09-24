using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Talks to Groq's OpenAI-compatible chat completions API
// (api.groq.com/openai/v1/chat/completions) - the second IAiAssistantService
// implementation alongside GeminiService, proving out the "provider-agnostic,
// one-line swap" design that interface was built for (see its own header
// comment). Same self-hosted-vs-cloud tradeoff discussion that led here:
// Groq is still a cloud API (not self-hosted), but has a genuinely free tier
// with no card required, unlike Gemini's models hitting repeated
// "no longer available to new users" retirements.
//
// Request/response shape is OpenAI's standard chat-completions format:
// messages have role "system"/"user"/"assistant"/"tool"; tool calls come
// back as message.tool_calls[] and are answered with role:"tool" messages
// carrying the matching tool_call_id - structurally different from
// Gemini's functionCall/functionResponse parts-based shape, but the same
// "loop until a plain-text reply" mechanics underneath.
public class GroqService : IAiAssistantService
{
    private const int MaxToolCallRounds = 5;
    private const int TimeoutSeconds = 30;
    private const string ChatCompletionsUrl = "https://api.groq.com/openai/v1/chat/completions";

    public async Task<AiTestConnectionResultDto> TestConnectionAsync(string apiKey, string model)
    {
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(model))
        {
            return new AiTestConnectionResultDto
            {
                Success = false,
                Message = "Enter both a Groq API key and a model name before testing."
            };
        }

        var requestBody = new JsonObject
        {
            ["model"] = model.Trim(),
            ["messages"] = new JsonArray
            {
                new JsonObject { ["role"] = "user", ["content"] = "Reply with only the single word: OK" }
            }
        };

        var (success, _, error, rawErrorDetail) = await SendRequestRawAsync(apiKey, requestBody);

        if (!success)
        {
            // Same "show the provider's own error text" reasoning as
            // GeminiService.TestConnectionAsync - this is the admin-only
            // diagnostic where the specific reason matters. Never includes
            // the API key itself (only ever in the Authorization header,
            // never echoed back by Groq).
            var message = !string.IsNullOrWhiteSpace(rawErrorDetail)
                ? $"Groq connection failed: {rawErrorDetail}"
                : error ?? "Groq connection failed.";

            return new AiTestConnectionResultDto { Success = false, Message = message };
        }

        return new AiTestConnectionResultDto { Success = true, Message = "Groq connection successful." };
    }

    public async Task<AiChatResultDto> ChatAsync(
        string systemInstruction,
        List<AiChatMessageDto> history,
        List<AiToolDefinition> tools,
        Func<string, string, Task<string>> executeTool,
        string apiKey,
        string model)
    {
        var result = new AiChatResultDto();

        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(model))
        {
            result.Error = "Deployment Copilot isn't configured yet. Add a Groq API key and model in Settings.";
            return result;
        }

        var messages = new JsonArray { new JsonObject { ["role"] = "system", ["content"] = systemInstruction } };

        foreach (var message in history)
        {
            // Groq/OpenAI's roles are "user"/"assistant", not Gemini's
            // "user"/"model" - AiChatMessageDto.Role is Gemini-named (see
            // that DTO's own comment) since Gemini was built first; this is
            // the one place that naming difference needs bridging.
            messages.Add(new JsonObject
            {
                ["role"] = message.Role == "model" ? "assistant" : "user",
                ["content"] = message.Content
            });
        }

        var toolsBlock = tools.Count == 0 ? null : new JsonArray(
            tools.Select(t => (JsonNode)new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"] = t.Name,
                    ["description"] = t.Description,
                    ["parameters"] = JsonNode.Parse(JsonSerializer.Serialize(t.ParametersSchema))
                }
            }).ToArray());

        for (var round = 0; round < MaxToolCallRounds; round++)
        {
            var requestBody = new JsonObject
            {
                ["model"] = model.Trim(),
                ["messages"] = messages.DeepClone(),
                ["temperature"] = 0.2
            };

            if (toolsBlock != null)
                requestBody["tools"] = toolsBlock.DeepClone();

            var (success, responseJson, error, _) = await SendRequestRawAsync(apiKey, requestBody);

            if (!success)
            {
                result.Error = error;
                return result;
            }

            var message = responseJson?["choices"]?[0]?["message"];

            if (message == null)
            {
                result.Error = "Deployment Copilot didn't return a response. Try rephrasing your question.";
                return result;
            }

            var toolCalls = message["tool_calls"]?.AsArray();

            if (toolCalls == null || toolCalls.Count == 0)
            {
                var text = message["content"]?.GetValue<string>()?.Trim() ?? string.Empty;

                result.Success = !string.IsNullOrWhiteSpace(text);
                result.Reply = text;

                if (!result.Success)
                    result.Error = "Deployment Copilot didn't return a response. Try rephrasing your question.";

                return result;
            }

            // Echo the assistant's own tool-call turn back into the
            // conversation before appending results - same reason
            // GeminiService does this for its functionCall parts: the
            // provider needs to see its own prior call to make sense of
            // what follows.
            messages.Add(message.DeepClone());

            foreach (var call in toolCalls)
            {
                var toolCallId = call!["id"]!.GetValue<string>();
                var name = call["function"]!["name"]!.GetValue<string>();
                var argsJson = call["function"]!["arguments"]?.GetValue<string>() ?? "{}";

                string toolResult;

                try
                {
                    toolResult = await executeTool(name, argsJson);
                }
                catch (Exception ex)
                {
                    // Same "no raw exception text fed back to the model"
                    // rule as GeminiService.ChatAsync's identical catch.
                    Console.Error.WriteLine($"[Copilot tool:{name}] {ex}");
                    toolResult = JsonSerializer.Serialize(new { error = "That tool call failed - unable to complete the request." });
                }

                result.ToolsUsed.Add(name);

                messages.Add(new JsonObject
                {
                    ["role"] = "tool",
                    ["tool_call_id"] = toolCallId,
                    ["content"] = toolResult
                });
            }
        }

        result.Error = "Deployment Copilot needed too many steps to answer that — try asking a more specific question.";
        return result;
    }

    private async Task<(bool Success, JsonNode? Json, string? Error, string? RawErrorDetail)> SendRequestRawAsync(string apiKey, JsonObject body)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(TimeoutSeconds) };
        client.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

        try
        {
            var content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
            var response = await client.PostAsync(ChatCompletionsUrl, content);
            var responseText = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                return (false, null, MapErrorResponse(response.StatusCode, responseText), ExtractProviderErrorMessage(responseText));

            var json = JsonNode.Parse(responseText);

            if (json?["choices"] == null)
                return (false, null, "Deployment Copilot didn't return a response. Try again.", null);

            return (true, json, null, null);
        }
        catch (TaskCanceledException)
        {
            return (false, null, "Deployment Copilot couldn't reach the AI provider in time. Please try again.", null);
        }
        catch (HttpRequestException)
        {
            return (false, null, "Deployment Copilot couldn't reach the AI provider right now. Please try again.", null);
        }
        catch (JsonException)
        {
            return (false, null, "Deployment Copilot received an unexpected response from the AI provider.", null);
        }
    }

    // Groq's error body is OpenAI-shaped: {"error": {"message": "...",
    // "type": "...", "code": "..."}}. Never includes the API key.
    private static string? ExtractProviderErrorMessage(string rawBody)
    {
        try
        {
            var message = JsonNode.Parse(rawBody)?["error"]?["message"]?.GetValue<string>();
            return string.IsNullOrWhiteSpace(message) ? null : message;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // Same "never surface the raw provider body to end users, only a
    // friendly per-status-code message" rule as GeminiService.MapErrorResponse.
    private static string MapErrorResponse(HttpStatusCode statusCode, string rawBody)
    {
        if (statusCode == HttpStatusCode.TooManyRequests)
            return "Deployment Copilot is temporarily unavailable because the AI provider rate limit was reached. Please try again later.";

        if (statusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            return "Deployment Copilot isn't configured correctly — check the Groq API key in Settings.";

        if (statusCode == HttpStatusCode.NotFound)
            return "Deployment Copilot isn't configured correctly — check the Groq model name in Settings.";

        if (statusCode == HttpStatusCode.BadRequest)
        {
            if (rawBody.Contains("model", StringComparison.OrdinalIgnoreCase)
                && (rawBody.Contains("does not exist", StringComparison.OrdinalIgnoreCase)
                    || rawBody.Contains("not found", StringComparison.OrdinalIgnoreCase)
                    || rawBody.Contains("decommissioned", StringComparison.OrdinalIgnoreCase)))
            {
                return "Deployment Copilot isn't configured correctly — check the Groq model name in Settings.";
            }

            return "Deployment Copilot couldn't process that request. Check the Groq API key and model in Settings.";
        }

        if ((int)statusCode >= 500)
            return "The AI provider is currently unavailable. Please try again shortly.";

        return "Deployment Copilot couldn't complete that request right now.";
    }
}

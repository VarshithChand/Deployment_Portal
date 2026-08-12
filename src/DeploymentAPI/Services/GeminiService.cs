using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Talks to Google's Gemini Interactions API - the REST surface Google made
// the default/primary interface in June 2026, replacing the older
// "generateContent" method (which now rejects newer API keys/projects
// outright with a "no longer available to new users" error). Reference:
// https://ai.google.dev/gemini-api/docs/migrate-to-interactions
//
// Every turn is a POST to /v1beta2/interactions. A brand-new conversation
// omits previous_interaction_id; continuing one (either the user's next
// message, or feeding a tool's result back after a function_call) sets it
// to the prior response's own "id" - Google resolves the actual history
// server-side from that ID, so this service never needs to resend earlier
// turns itself (see IAiAssistantService.ChatAsync's previousInteractionId
// parameter). Stateless and provider-specific on purpose: nothing here
// knows about GitHub/AWS/deployments, and nothing outside
// IAiAssistantService knows this is Gemini specifically.
public class GeminiService : IAiAssistantService
{
    private const string BaseUrl = "https://generativelanguage.googleapis.com/v1beta2/interactions";

    // A runaway "call a tool, get a result, decide to call another tool"
    // loop still needs a hard stop so one confused exchange can't hang a
    // request or burn unbounded quota against the configured API key.
    private const int MaxToolCallRounds = 6;

    private const int TimeoutSeconds = 30;

    public async Task<AiTestConnectionResultDto> TestConnectionAsync(string apiKey, string model)
    {
        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(model))
        {
            return new AiTestConnectionResultDto
            {
                Success = false,
                Message = "Enter both a Gemini API key and a model name before testing."
            };
        }

        var requestBody = new JsonObject
        {
            ["model"] = NormalizeModel(model),
            ["input"] = "Reply with only the single word: OK"
        };

        var (success, json, error, rawErrorDetail) = await SendRequestAsync(apiKey, requestBody);

        if (!success)
        {
            // Test Connection is the admin-only diagnostic tool (section 6)
            // - unlike the Chat path, showing Gemini's own error text here
            // is exactly the point, since it's what actually says WHY (e.g.
            // "no longer available to new users" or "not found"), not just
            // a generic bucketed message. Never includes the API key -
            // Gemini's error bodies don't echo it back, it only ever
            // appears in the outbound request header.
            var message = !string.IsNullOrWhiteSpace(rawErrorDetail)
                ? $"Gemini connection failed: {rawErrorDetail}"
                : error ?? "Gemini connection failed.";

            return new AiTestConnectionResultDto { Success = false, Message = message };
        }

        var text = ExtractModelOutputText(json);

        if (string.IsNullOrWhiteSpace(text))
        {
            return new AiTestConnectionResultDto
            {
                Success = false,
                Message = "Gemini connection failed: the model returned an empty response."
            };
        }

        return new AiTestConnectionResultDto { Success = true, Message = "Gemini connection successful." };
    }

    public async Task<AiChatResultDto> ChatAsync(
        string systemInstruction,
        string message,
        string? previousInteractionId,
        List<AiToolDefinition> tools,
        Func<string, string, Task<string>> executeTool,
        string apiKey,
        string model)
    {
        var result = new AiChatResultDto();

        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(model))
        {
            result.Error = "Deployment Copilot isn't configured yet. Add a Gemini API key and model in Settings.";
            return result;
        }

        var normalizedModel = NormalizeModel(model);
        var toolsBlock = BuildToolsBlock(tools);

        // The current request's "input" - starts as the user's message
        // (a plain string), then becomes a function_result object for
        // however many continuation round-trips a tool-calling exchange
        // needs. One function call is resolved per round: if Gemini's
        // response to a function_result asks for ANOTHER tool, the loop
        // just goes around again chained off the newest interaction id -
        // this matches how the API's own docs show it chaining (one
        // function_call step per response), rather than assuming several
        // simultaneous calls need to be submitted together.
        JsonNode currentInput = message;
        var chainId = previousInteractionId;

        for (var round = 0; round < MaxToolCallRounds; round++)
        {
            var requestBody = new JsonObject
            {
                ["model"] = normalizedModel,
                ["input"] = currentInput.DeepClone(),
                ["system_instruction"] = systemInstruction
            };

            if (!string.IsNullOrWhiteSpace(chainId))
                requestBody["previous_interaction_id"] = chainId;

            if (toolsBlock != null)
                requestBody["tools"] = toolsBlock.DeepClone();

            var (success, json, error, _) = await SendRequestAsync(apiKey, requestBody);

            if (!success)
            {
                result.Error = error;
                return result;
            }

            var interactionId = json?["id"]?.GetValue<string>();
            var status = json?["status"]?.GetValue<string>();
            var steps = json?["steps"]?.AsArray();

            if (steps == null)
            {
                result.Error = "Deployment Copilot didn't return a response. Try rephrasing your question.";
                return result;
            }

            var functionCall = steps.FirstOrDefault(s => s?["type"]?.GetValue<string>() == "function_call");

            if (string.Equals(status, "requires_action", StringComparison.OrdinalIgnoreCase) && functionCall != null)
            {
                var callId = functionCall["id"]?.GetValue<string>() ?? string.Empty;
                var name = functionCall["name"]?.GetValue<string>() ?? string.Empty;
                var argsJson = functionCall["arguments"]?.ToJsonString() ?? "{}";

                string toolResult;

                try
                {
                    toolResult = await executeTool(name, argsJson);
                }
                catch (Exception ex)
                {
                    toolResult = JsonSerializer.Serialize(new { error = $"Tool failed: {ex.Message}" });
                }

                result.ToolsUsed.Add(name);

                currentInput = new JsonObject
                {
                    ["type"] = "function_result",
                    ["call_id"] = callId,
                    ["name"] = name,
                    ["result"] = new JsonArray(new JsonObject { ["type"] = "text", ["text"] = toolResult })
                };

                chainId = interactionId;
                continue;
            }

            var text = ExtractModelOutputText(json);

            result.InteractionId = interactionId;

            if (string.IsNullOrWhiteSpace(text))
            {
                result.Error = "Deployment Copilot didn't return a response. Try rephrasing your question.";
                return result;
            }

            result.Success = true;
            result.Reply = text.Trim();
            return result;
        }

        result.Error = "Deployment Copilot needed too many steps to answer that — try asking a more specific question.";
        return result;
    }

    private static string? ExtractModelOutputText(JsonNode? json)
    {
        var steps = json?["steps"]?.AsArray();

        if (steps == null) return null;

        var textParts = steps
            .Where(s => s?["type"]?.GetValue<string>() == "model_output")
            .SelectMany(s => s!["content"]?.AsArray() ?? new JsonArray())
            .Where(c => c?["type"]?.GetValue<string>() == "text")
            .Select(c => c!["text"]?.GetValue<string>() ?? string.Empty);

        return string.Join("\n", textParts);
    }

    private static JsonArray? BuildToolsBlock(List<AiToolDefinition> tools)
    {
        if (tools.Count == 0) return null;

        return new JsonArray(tools.Select(t => (JsonNode)new JsonObject
        {
            ["type"] = "function",
            ["name"] = t.Name,
            ["description"] = t.Description,
            ["parameters"] = JsonNode.Parse(JsonSerializer.Serialize(t.ParametersSchema))
        }).ToArray());
    }

    // Accepts either a bare model ID ("gemini-2.5-flash") or the full
    // resource name as Google's own docs/AI Studio often display it
    // ("models/gemini-2.5-flash") - the Interactions API's "model" field
    // wants the bare ID.
    private static string NormalizeModel(string model)
    {
        var trimmed = model.Trim().Trim('/');

        return trimmed.StartsWith("models/", StringComparison.OrdinalIgnoreCase)
            ? trimmed["models/".Length..]
            : trimmed;
    }

    private async Task<(bool Success, JsonNode? Json, string? Error, string? RawErrorDetail)> SendRequestAsync(string apiKey, JsonObject body)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(TimeoutSeconds) };
        client.DefaultRequestHeaders.Add("x-goog-api-key", apiKey);

        try
        {
            var content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
            var response = await client.PostAsync(BaseUrl, content);
            var responseText = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                return (false, null, MapErrorResponse(response.StatusCode, responseText), ExtractProviderErrorMessage(responseText));

            var json = JsonNode.Parse(responseText);

            if (json?["steps"] == null && json?["status"] == null)
                return (false, null, "Deployment Copilot received an unexpected response from the AI provider.", null);

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

    // Gemini's own error.message text (e.g. "This model models/gemini-x is
    // no longer available to new users...") - never includes the API key
    // (that only ever appears in the outbound request header, not
    // anything Gemini echoes back), so it's safe to show directly on the
    // admin-only Test Connection diagnostic.
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

    // Never surfaces the raw Gemini error body on the Chat path (it can
    // echo back request details, and 4xx bodies aren't meant for end
    // users) - only a friendly, specific-enough-to-act-on message per
    // status code (section 28 of the spec). Test Connection uses
    // ExtractProviderErrorMessage above instead, deliberately.
    private static string MapErrorResponse(HttpStatusCode statusCode, string rawBody)
    {
        if (statusCode == HttpStatusCode.TooManyRequests)
            return "Deployment Copilot is temporarily unavailable because the AI provider rate limit was reached. Please try again later.";

        if (statusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            return "Deployment Copilot isn't configured correctly — check the Gemini API key in Settings.";

        if (statusCode == HttpStatusCode.NotFound)
            return "Deployment Copilot isn't configured correctly — check the Gemini model name in Settings.";

        if (statusCode == HttpStatusCode.BadRequest)
        {
            if (rawBody.Contains("model", StringComparison.OrdinalIgnoreCase)
                && (rawBody.Contains("not found", StringComparison.OrdinalIgnoreCase)
                    || rawBody.Contains("no longer available", StringComparison.OrdinalIgnoreCase)))
            {
                return "Deployment Copilot isn't configured correctly — check the Gemini model name in Settings.";
            }

            return "Deployment Copilot couldn't process that request. Check the Gemini API key and model in Settings.";
        }

        if ((int)statusCode >= 500)
            return "The AI provider is currently unavailable. Please try again shortly.";

        return "Deployment Copilot couldn't complete that request right now.";
    }
}

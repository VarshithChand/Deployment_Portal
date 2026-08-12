using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Talks to Google Gemini's REST "generateContent" API, including its
// function-calling ("tools") support - the mechanism that lets Deployment
// Copilot call back into AiToolsService for real portal data instead of
// the whole prompt just being handed raw portal state (see section 10 of
// the spec). Stateless and provider-specific on purpose: nothing here
// knows about GitHub/AWS/deployments, and nothing outside IAiAssistantService
// knows this is Gemini specifically.
public class GeminiService : IAiAssistantService
{
    // Gemini's own conversational-turn cap most callers use; a runaway
    // "call a tool, get a result, decide to call another tool" loop still
    // needs a hard stop so one confused exchange can't hang a request or
    // burn unbounded quota against the configured API key.
    private const int MaxToolCallRounds = 5;

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
            ["contents"] = new JsonArray
            {
                new JsonObject
                {
                    ["role"] = "user",
                    ["parts"] = new JsonArray { new JsonObject { ["text"] = "Reply with only the single word: OK" } }
                }
            }
        };

        var (success, _, error, rawErrorDetail) = await SendRequestRawAsync(apiKey, model, requestBody);

        if (!success)
        {
            // Test Connection is the admin-only diagnostic tool (section 6)
            // - unlike the Chat path, showing Gemini's own error text here
            // is exactly the point, since it's what actually says WHY (e.g.
            // "models/gemini-x is not found for API version v1beta..."),
            // not just a generic bucketed message. Never includes the API
            // key itself - Gemini's error bodies don't echo it back, it
            // only ever appears in the outbound request URL.
            var message = !string.IsNullOrWhiteSpace(rawErrorDetail)
                ? $"Gemini connection failed: {rawErrorDetail}"
                : error ?? "Gemini connection failed.";

            return new AiTestConnectionResultDto { Success = false, Message = message };
        }

        return new AiTestConnectionResultDto
        {
            Success = true,
            Message = "Gemini connection successful."
        };
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
            result.Error = "Deployment Copilot isn't configured yet. Add a Gemini API key and model in Settings.";
            return result;
        }

        var contents = new JsonArray();

        foreach (var message in history)
        {
            contents.Add(new JsonObject
            {
                ["role"] = message.Role == "model" ? "model" : "user",
                ["parts"] = new JsonArray { new JsonObject { ["text"] = message.Content } }
            });
        }

        var toolsBlock = tools.Count == 0 ? null : new JsonArray
        {
            new JsonObject
            {
                ["functionDeclarations"] = new JsonArray(
                    tools.Select(t => (JsonNode)new JsonObject
                    {
                        ["name"] = t.Name,
                        ["description"] = t.Description,
                        ["parameters"] = JsonNode.Parse(JsonSerializer.Serialize(t.ParametersSchema))
                    }).ToArray())
            }
        };

        for (var round = 0; round < MaxToolCallRounds; round++)
        {
            var requestBody = new JsonObject
            {
                ["system_instruction"] = new JsonObject
                {
                    ["parts"] = new JsonArray { new JsonObject { ["text"] = systemInstruction } }
                },
                ["contents"] = contents.DeepClone(),
                ["generationConfig"] = new JsonObject { ["temperature"] = 0.2 }
            };

            if (toolsBlock != null)
                requestBody["tools"] = toolsBlock.DeepClone();

            var (success, responseJson, error, _) = await SendRequestRawAsync(apiKey, model, requestBody);

            if (!success)
            {
                result.Error = error;
                return result;
            }

            var candidate = responseJson?["candidates"]?[0]?["content"];
            var parts = candidate?["parts"]?.AsArray();

            if (parts == null || parts.Count == 0)
            {
                result.Error = "Deployment Copilot didn't return a response. Try rephrasing your question.";
                return result;
            }

            var functionCalls = parts
                .Where(p => p?["functionCall"] != null)
                .ToList();

            if (functionCalls.Count == 0)
            {
                // A plain text answer - done. Concatenate every text part
                // (Gemini can return more than one) in order.
                var text = string.Join(
                    "\n",
                    parts.Where(p => p?["text"] != null).Select(p => p!["text"]!.GetValue<string>()));

                result.Success = true;
                result.Reply = text.Trim();

                if (string.IsNullOrWhiteSpace(result.Reply))
                {
                    result.Success = false;
                    result.Error = "Deployment Copilot didn't return a response. Try rephrasing your question.";
                }

                return result;
            }

            // Echo the model's own function-call turn back into the
            // conversation before appending the results - Gemini requires
            // seeing its own prior call to make sense of the response that
            // follows it.
            contents.Add(new JsonObject { ["role"] = "model", ["parts"] = parts.DeepClone() });

            var responseParts = new JsonArray();

            foreach (var call in functionCalls)
            {
                var name = call!["functionCall"]!["name"]!.GetValue<string>();
                var args = call["functionCall"]!["args"];
                var argsJson = args?.ToJsonString() ?? "{}";

                string toolResult;

                try
                {
                    toolResult = await executeTool(name, argsJson);
                }
                catch (Exception ex)
                {
                    // This result is fed straight back into the model's own
                    // context as the tool's answer, and the model can freely
                    // relay it back to the user in chat - so it gets the same
                    // "no raw exception text" treatment as a direct API
                    // response, not just a server-side log message.
                    Console.Error.WriteLine($"[Copilot tool:{name}] {ex}");
                    toolResult = JsonSerializer.Serialize(new { error = "That tool call failed - unable to complete the request." });
                }

                result.ToolsUsed.Add(name);

                responseParts.Add(new JsonObject
                {
                    ["functionResponse"] = new JsonObject
                    {
                        ["name"] = name,
                        ["response"] = new JsonObject { ["result"] = JsonNode.Parse(toolResult) }
                    }
                });
            }

            contents.Add(new JsonObject { ["role"] = "function", ["parts"] = responseParts });
        }

        result.Error = "Deployment Copilot needed too many steps to answer that — try asking a more specific question.";
        return result;
    }

    // Accepts either a bare model ID ("gemini-2.0-flash") or the full
    // resource name as Google's own docs/AI Studio often display it
    // ("models/gemini-2.0-flash") - without this, pasting the latter built
    // a "models/models/..." URL that 404s, which is the single most common
    // way this configuration gets entered wrong.
    private static string NormalizeModel(string model)
    {
        var trimmed = model.Trim().Trim('/');

        return trimmed.StartsWith("models/", StringComparison.OrdinalIgnoreCase)
            ? trimmed["models/".Length..]
            : trimmed;
    }

    private async Task<(bool Success, JsonNode? Json, string? Error, string? RawErrorDetail)> SendRequestRawAsync(string apiKey, string model, JsonObject body)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(TimeoutSeconds) };

        var normalizedModel = NormalizeModel(model);
        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(normalizedModel)}:generateContent?key={Uri.EscapeDataString(apiKey)}";

        try
        {
            var content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
            var response = await client.PostAsync(url, content);
            var responseText = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                return (false, null, MapErrorResponse(response.StatusCode, responseText), ExtractProviderErrorMessage(responseText));

            var json = JsonNode.Parse(responseText);

            if (json?["candidates"] == null)
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

    // Gemini's own error.message text (e.g. "models/gemini-x is not found
    // for API version v1beta, or is not supported for generateContent...")
    // - never includes the API key (that only ever appears in the outbound
    // request URL, not anything Gemini echoes back), so it's safe to show
    // directly on the admin-only Test Connection diagnostic.
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

    // Never surfaces the raw Gemini error body (it can echo back request
    // details, and 4xx bodies from Google's API aren't meant for end
    // users) - only a friendly, specific-enough-to-act-on message per
    // status code (section 28 of the spec).
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
            // The one case worth distinguishing from a generic 400: an
            // unrecognized model name gives a clearer fix than "bad
            // request" would.
            if (rawBody.Contains("model", StringComparison.OrdinalIgnoreCase)
                && rawBody.Contains("not found", StringComparison.OrdinalIgnoreCase))
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

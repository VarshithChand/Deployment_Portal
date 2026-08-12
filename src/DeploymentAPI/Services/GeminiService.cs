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

        var (success, text, error) = await SendRequestAsync(apiKey, model, requestBody);

        if (!success)
        {
            return new AiTestConnectionResultDto { Success = false, Message = error ?? "Gemini connection failed." };
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

            var (success, responseJson, error) = await SendRequestRawAsync(apiKey, model, requestBody);

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
                    toolResult = JsonSerializer.Serialize(new { error = $"Tool failed: {ex.Message}" });
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

    private async Task<(bool Success, string? Text, string? Error)> SendRequestAsync(string apiKey, string model, JsonObject body)
    {
        var (success, json, error) = await SendRequestRawAsync(apiKey, model, body);

        if (!success)
            return (false, null, error);

        var text = json?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]?.GetValue<string>();

        return (true, text, null);
    }

    private async Task<(bool Success, JsonNode? Json, string? Error)> SendRequestRawAsync(string apiKey, string model, JsonObject body)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(TimeoutSeconds) };

        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(model)}:generateContent?key={Uri.EscapeDataString(apiKey)}";

        try
        {
            var content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
            var response = await client.PostAsync(url, content);
            var responseText = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                return (false, null, MapErrorResponse(response.StatusCode, responseText));

            var json = JsonNode.Parse(responseText);

            if (json?["candidates"] == null)
                return (false, null, "Deployment Copilot didn't return a response. Try again.");

            return (true, json, null);
        }
        catch (TaskCanceledException)
        {
            return (false, null, "Deployment Copilot couldn't reach the AI provider in time. Please try again.");
        }
        catch (HttpRequestException)
        {
            return (false, null, "Deployment Copilot couldn't reach the AI provider right now. Please try again.");
        }
        catch (JsonException)
        {
            return (false, null, "Deployment Copilot received an unexpected response from the AI provider.");
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

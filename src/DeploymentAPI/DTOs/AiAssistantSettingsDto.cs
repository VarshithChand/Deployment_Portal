namespace DeploymentAPI.DTOs;

// Portal-wide (shared), same storage/admin model as Docker/OAuth/Sonar —
// see SettingsService.SaveAiAssistantAsync/GetAiAssistantCredentialsAsync.
// There's one Gemini API key/model for the whole portal, not one per user.
public class AiAssistantSettingsUpdateDto
{
    public string? ApiKey { get; set; }

    public string Model { get; set; } = string.Empty;

    // "gemini" (default when omitted, for backward compatibility with
    // every save made before this field existed) | "groq" - see
    // AiAssistantServiceResolver. Each provider keeps its OWN saved API
    // key (SettingsService.SaveAiAssistantAsync stores GeminiApiKey/
    // GroqApiKey separately) so switching providers never silently
    // discards the other one's key.
    public string? Provider { get; set; }
}

// Never sent to the frontend as-is — GeminiService/GroqService/AiController
// read the real ApiKey server-side only. SettingsViewDto (what the
// frontend gets) only ever exposes AiApiKeyConfigured (bool) + AiModel
// (the model NAME, not a secret) — see SettingsService.BuildView.
public record AiAssistantCredentials(string? ApiKey, string Model, string Provider)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(Model);
}

namespace DeploymentAPI.DTOs;

// Portal-wide (shared), same storage/admin model as Docker/OAuth/Sonar —
// see SettingsService.SaveAiAssistantAsync/GetAiAssistantCredentialsAsync.
// There's one Gemini API key/model for the whole portal, not one per user.
public class AiAssistantSettingsUpdateDto
{
    public string? ApiKey { get; set; }

    public string Model { get; set; } = string.Empty;
}

// Never sent to the frontend as-is — GeminiService/AiController read the
// real ApiKey server-side only. SettingsViewDto (what the frontend gets)
// only ever exposes AiApiKeyConfigured (bool) + AiModel (the model NAME,
// not a secret) — see SettingsService.BuildView.
public record AiAssistantCredentials(string? ApiKey, string Model)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(Model);
}

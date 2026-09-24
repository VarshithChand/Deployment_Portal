namespace DeploymentAPI.Services;

// Picks the right IAiAssistantService implementation for the CURRENTLY
// SAVED provider (see SettingsService.GetAiAssistantCredentialsAsync's
// AiAssistantCredentials.Provider) - this exists because DI can no longer
// wire one fixed IAiAssistantService at startup once the provider became a
// runtime setting instead of a compile-time choice (previously
// `AddSingleton<IAiAssistantService, GeminiService>()` was enough; adding
// Groq meant every caller needs to resolve per-request instead). Both
// concrete services are still Singletons (both are stateless, same
// reasoning as before) - this just picks between two already-constructed
// instances rather than constructing anything itself.
public class AiAssistantServiceResolver
{
    private readonly GeminiService _gemini;
    private readonly GroqService _groq;

    public AiAssistantServiceResolver(GeminiService gemini, GroqService groq)
    {
        _gemini = gemini;
        _groq = groq;
    }

    // Defaults to Gemini for null/empty/unrecognized values - matches
    // GetAiAssistantCredentialsAsync's own default, so an existing saved
    // config with no Provider field yet (every install before this
    // feature) keeps behaving exactly as it did before.
    public IAiAssistantService Resolve(string? provider) =>
        string.Equals(provider, "groq", StringComparison.OrdinalIgnoreCase) ? _groq : _gemini;
}

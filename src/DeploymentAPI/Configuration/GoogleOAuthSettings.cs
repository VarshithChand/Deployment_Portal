namespace DeploymentAPI.Configuration;

// Mirrors GitHubOAuthSettings exactly - see Google Cloud Console setup
// steps in GoogleAuthController's own header comment.
public class GoogleOAuthSettings
{
    public string ClientId { get; set; } = string.Empty;

    public string ClientSecret { get; set; } = string.Empty;

    public string CallbackUrl { get; set; } = "http://localhost:5279/api/auth/google/callback";

    public string FrontendUrl { get; set; } = "http://localhost:5173";
}

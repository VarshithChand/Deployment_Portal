using DeploymentAPI.Services;
using Microsoft.AspNetCore.Http;

namespace DeploymentAPI.Helpers;

// Called once per login attempt by both JWT-issuing code paths -
// AccountAuthController.IssueSessionAsync (password/MFA/email-verify) and
// OAuthLoginFinisher.FinishAsync (GitHub/Google OAuth callback) - so
// Settings > Account's Active Sessions and Login History stay populated
// regardless of which of the two ways someone actually signed in. Pulled
// into its own helper for the same reason OAuthLoginFinisher itself was
// originally extracted (see that file's own comment): so this isn't
// duplicated (and doesn't drift) across every login method.
public static class SessionRecorder
{
    public static async Task RecordSuccessfulLoginAsync(
        SettingsService settings, HttpRequest request, string userId, string jti)
    {
        var userAgent = request.Headers.UserAgent.ToString();
        var ipAddress = request.HttpContext.Connection.RemoteIpAddress?.ToString();

        await settings.RecordSessionAsync(userId, jti, userAgent, ipAddress);
        await settings.RecordLoginHistoryAsync(userId, ipAddress, userAgent, success: true);
    }
}

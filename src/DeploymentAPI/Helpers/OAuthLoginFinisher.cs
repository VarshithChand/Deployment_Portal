using DeploymentAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace DeploymentAPI.Helpers;

// Shared tail of every OAuth callback (GitHub, Google) once identity+role
// has been resolved - same MFA-pending shape AccountAuthController uses for
// password login (see SessionActivityService.SetPendingAccountLogin), just
// redirect-shaped instead of JSON-shaped since an OAuth callback is a full
// page navigation, not a fetch() the frontend awaits directly. Pulled out
// once here so "does this login need an MFA code before it's real" isn't
// duplicated (and doesn't drift) across every login method.
public static class OAuthLoginFinisher
{
    private static readonly TimeSpan PendingLoginTtl = TimeSpan.FromMinutes(10);

    public static async Task<IActionResult> FinishAsync(
        ControllerBase controller,
        SettingsService settings,
        SessionActivityService activity,
        AuthService auth,
        IEmailService email,
        string userId,
        string role,
        string? userEmail,
        string frontendUrl)
    {
        if (await settings.IsMfaEnabledAsync(userId))
        {
            var key = PortalIdentity.GetOrCreateKey(controller.HttpContext);
            activity.SetPendingAccountLogin(key, userId, role, userEmail, PendingLoginTtl);

            // The frontend's MFA page (Phase D) reads this query param to
            // land straight on the code-entry form instead of polling
            // login-mfa/pending cold on every page load - same signal
            // shape as the existing authError param.
            return controller.Redirect($"{frontendUrl}?mfaPending=1");
        }

        var jwt = auth.IssueJwt(userId, role, userEmail);

        controller.Response.Cookies.Append(
            "portal_token", jwt, AuthCookie.CrossSiteOptions(controller.Request, DateTimeOffset.UtcNow.AddHours(8)));

        if (!string.IsNullOrWhiteSpace(userEmail))
        {
            try
            {
                await email.SendLoginNotificationAsync(userEmail, userId, DateTime.UtcNow);
            }
            catch (Exception)
            {
                // See AuthController.Callback's identical comment - a bug
                // in IEmailService's "never throws" contract must never
                // surface as a broken login here either.
            }
        }

        return controller.Redirect(frontendUrl);
    }
}

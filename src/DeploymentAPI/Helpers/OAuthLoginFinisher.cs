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
        string frontendUrl,
        // Only ever true from GoogleAuthController's own call site today
        // (see GoogleAuthService.ExchangeCodeForUserAsync) - defaults false
        // so AuthController's GitHub OAuth call site, which doesn't
        // distinguish new-vs-existing, keeps its exact existing behavior
        // (a login notification every time, no welcome email) unchanged.
        bool isNewAccount = false)
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
                var displayLogin = await RequireAuth.ResolveDisplayLoginAsync(userId, userEmail, settings);

                // Welcome, not a login notification, exactly once - the
                // very first time this identity is ever seen. Every login
                // after that (including this same account's next one) is
                // the ordinary notification below.
                if (isNewAccount)
                    await email.SendWelcomeEmailAsync(userEmail, displayLogin, frontendUrl);
                else
                    await email.SendLoginNotificationAsync(userEmail, displayLogin, DateTime.UtcNow);
            }
            catch (Exception)
            {
                // See AuthController.Callback's identical comment - a bug
                // in IEmailService's "never throws" contract must never
                // surface as a broken login here either.
            }
        }

        // The cookie above is still set (harmless, and what local dev and
        // any same-site deployment rely on), but this redirect is the
        // browser navigating cross-site from the OAuth provider back to
        // THIS backend, then on to a separately-hosted frontend - the same
        // third-party-cookie situation AccountAuthController.IssueSessionAsync
        // already works around for the plain fetch()-based login paths (see
        // its own comment). A redirect can't return JSON for the frontend
        // to read the token from, so it's appended here instead - AuthContext
        // picks it up on mount, stores it via setAuthToken, and strips it
        // from the URL before anyone sees a raw JWT sitting in the address
        // bar for more than an instant.
        return controller.Redirect($"{frontendUrl}?token={Uri.EscapeDataString(jwt)}");
    }
}

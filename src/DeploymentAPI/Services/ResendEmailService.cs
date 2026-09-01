using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Talks to Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
// Stateless and provider-specific on purpose, same reasoning as GeminiService
// behind IAiAssistantService - nothing outside IEmailService knows this is
// Resend specifically.
//
// Scoped (not Singleton) because it depends on SettingsService, which is
// itself Scoped (one instance per request, see SettingsService's own
// comment on why) - a Singleton holding a reference to a Scoped service
// would capture a single request's settings forever.
public class ResendEmailService : IEmailService
{
    private const int TimeoutSeconds = 15;
    private const string ResendApiUrl = "https://api.resend.com/emails";

    private readonly SettingsService _settings;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ActivityLogService _log;

    public ResendEmailService(SettingsService settings, IHttpClientFactory httpClientFactory, ActivityLogService log)
    {
        _settings = settings;
        _httpClientFactory = httpClientFactory;
        _log = log;
    }

    public async Task<EmailSendResultDto> SendLoginNotificationAsync(string toEmail, string toLogin, DateTime loginTimeUtc)
    {
        var subject = "Deployment Portal — Successful Login";
        var html = BuildLoginNotificationHtml(toLogin, loginTimeUtc);

        return await SendAsync(toEmail, subject, html, logContext: $"login notification for '{toLogin}'");
    }

    public async Task<EmailSendResultDto> SendTestEmailAsync(string toEmail)
    {
        var subject = "Deployment Portal — Test Email";
        var html = BuildLoginNotificationHtml("Test User", DateTime.UtcNow, isTest: true);

        return await SendAsync(toEmail, subject, html, logContext: "test email");
    }

    public async Task<EmailSendResultDto> SendWelcomeVerificationEmailAsync(string toEmail, string username, string verifyUrl)
    {
        var subject = "Welcome to Deployment Portal — Verify your email";
        var html = BuildWelcomeVerificationHtml(username, toEmail, verifyUrl);

        return await SendAsync(toEmail, subject, html, logContext: $"welcome/verification email for '{username}'");
    }

    public async Task<EmailSendResultDto> SendPasswordResetEmailAsync(string toEmail, string username, string resetUrl)
    {
        var subject = "Deployment Portal — Reset your password";
        var html = BuildPasswordResetHtml(username, resetUrl);

        return await SendAsync(toEmail, subject, html, logContext: $"password reset email for '{username}'");
    }

    private async Task<EmailSendResultDto> SendAsync(string toEmail, string subject, string html, string logContext)
    {
        if (string.IsNullOrWhiteSpace(toEmail))
            return new EmailSendResultDto { Success = false, Message = "No recipient email address was available." };

        try
        {
            var creds = await _settings.GetNotificationCredentialsAsync();

            if (!creds.IsConfigured)
            {
                return new EmailSendResultDto
                {
                    Success = false,
                    Message = "Resend isn't configured yet - add an API key and From address in Settings."
                };
            }

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(TimeoutSeconds);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", creds.ApiKey);

            var fromDisplay = string.IsNullOrWhiteSpace(creds.FromName)
                ? creds.FromEmail
                : $"{creds.FromName} <{creds.FromEmail}>";

            var body = new JsonObject
            {
                ["from"] = fromDisplay,
                ["to"] = new JsonArray { toEmail },
                ["subject"] = subject,
                ["html"] = html
            };

            var content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
            var response = await client.PostAsync(ResendApiUrl, content);
            var responseText = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                var providerMessage = ExtractProviderErrorMessage(responseText);
                var message = MapErrorResponse(response.StatusCode, providerMessage);

                // Never logs the API key itself - it only ever appears in
                // the outbound Authorization header, never in Resend's
                // response body, so there's nothing to redact here.
                _log.LogError("Email", $"Failed to send {logContext} to '{MaskEmail(toEmail)}': {message}");

                return new EmailSendResultDto { Success = false, Message = message };
            }

            _log.LogInfo("Email", $"Sent {logContext} to '{MaskEmail(toEmail)}'.");

            return new EmailSendResultDto { Success = true, Message = "Email sent." };
        }
        catch (TaskCanceledException)
        {
            _log.LogError("Email", $"Timed out sending {logContext} to '{MaskEmail(toEmail)}'.");
            return new EmailSendResultDto { Success = false, Message = "Resend didn't respond in time. Please try again." };
        }
        catch (HttpRequestException ex)
        {
            _log.LogError("Email", $"Network error sending {logContext} to '{MaskEmail(toEmail)}': {ex.Message}");
            return new EmailSendResultDto { Success = false, Message = "Couldn't reach Resend right now. Please try again shortly." };
        }
        catch (Exception ex)
        {
            // Catch-all is deliberate here (see IEmailService's own
            // comment) - a login notification failing must never bubble
            // up as an unhandled exception into the login flow that
            // triggered it.
            _log.LogError("Email", $"Unexpected error sending {logContext} to '{MaskEmail(toEmail)}': {ex.Message}");
            return new EmailSendResultDto { Success = false, Message = "An unexpected error occurred while sending the email." };
        }
    }

    // user@example.com -> u***@example.com - enough to recognize the
    // account in Activity Log without writing a full email address (a
    // real, personally-identifiable value) into a log every admin can read.
    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');

        if (at <= 1)
            return "***";

        return $"{email[0]}***{email[at..]}";
    }

    private static string? ExtractProviderErrorMessage(string rawBody)
    {
        try
        {
            var message = JsonNode.Parse(rawBody)?["message"]?.GetValue<string>();
            return string.IsNullOrWhiteSpace(message) ? null : message;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // Same "friendly, specific-enough-to-act-on message per status code"
    // treatment GeminiService.MapErrorResponse gives Gemini's errors.
    private static string MapErrorResponse(HttpStatusCode statusCode, string? providerMessage)
    {
        if (statusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            return "Resend rejected the request - check the API key in Settings.";

        if (statusCode == HttpStatusCode.UnprocessableEntity)
        {
            return !string.IsNullOrWhiteSpace(providerMessage)
                ? $"Resend rejected the request: {providerMessage}"
                : "Resend rejected the request - check the From address in Settings (it must be on a domain verified with Resend).";
        }

        if (statusCode == HttpStatusCode.TooManyRequests)
            return "Resend's rate limit was reached. Please try again shortly.";

        if ((int)statusCode >= 500)
            return "Resend is currently unavailable. Please try again shortly.";

        return !string.IsNullOrWhiteSpace(providerMessage)
            ? $"Resend couldn't send the email: {providerMessage}"
            : "Resend couldn't send the email right now.";
    }

    // Same table-based/inline-CSS constraint as BuildLoginNotificationHtml
    // below. verifyUrl already points at AccountAuthController.VerifyEmail
    // (a GET, so a plain link works with no JS/form needed) - clicking it
    // is what actually activates the account; nothing here does that itself.
    private static string BuildWelcomeVerificationHtml(string username, string email, string verifyUrl)
    {
        var encodedVerifyUrl = WebUtility.HtmlEncode(verifyUrl);

        return $$"""
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
        <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#4f46e5;padding:24px 32px;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;">Deployment Portal</span>
        </td></tr>
        <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Welcome to Deployment Portal</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">
        Thanks for creating an account. Confirm it's really you by verifying your email address below.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;margin-bottom:24px;">
        <tr>
        <td style="padding:16px 20px;font-size:13px;color:#6b7280;width:110px;">Username</td>
        <td style="padding:16px 20px 16px 0;font-size:13px;color:#111827;font-weight:600;">{{WebUtility.HtmlEncode(username)}}</td>
        </tr>
        <tr>
        <td style="padding:0 20px 16px;font-size:13px;color:#6b7280;">Email</td>
        <td style="padding:0 20px 16px 0;font-size:13px;color:#111827;font-weight:600;">{{WebUtility.HtmlEncode(email)}}</td>
        </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="border-radius:6px;background:#4f46e5;">
        <a href="{{encodedVerifyUrl}}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Verify Your Email</a>
        </td></tr>
        </table>
        <p style="margin:0 0 20px;font-size:12px;line-height:1.6;color:#9ca3af;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="{{encodedVerifyUrl}}" style="color:#4f46e5;">{{encodedVerifyUrl}}</a>
        </p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
        Questions or need help? Contact us at
        <a href="mailto:support@deploymentportal.in" style="color:#4f46e5;">support@deploymentportal.in</a>.
        </p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:11px;color:#9ca3af;">This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.</p>
        </td></tr>
        </table>
        </td></tr>
        </table>
        </body>
        </html>
        """;
    }

    // Same table-based/inline-CSS constraint as BuildWelcomeVerificationHtml
    // above. resetUrl points at a frontend page with a "set new password"
    // form (see AccountAuthController.ForgotPassword) - unlike the
    // verification link, clicking this alone doesn't finish anything.
    private static string BuildPasswordResetHtml(string username, string resetUrl)
    {
        var encodedResetUrl = WebUtility.HtmlEncode(resetUrl);

        return $$"""
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
        <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#4f46e5;padding:24px 32px;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;">Deployment Portal</span>
        </td></tr>
        <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Reset your password</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">
        Hi {{WebUtility.HtmlEncode(username)}}, we received a request to reset the password on your Deployment Portal account. Click below to choose a new one.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="border-radius:6px;background:#4f46e5;">
        <a href="{{encodedResetUrl}}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Reset Password</a>
        </td></tr>
        </table>
        <p style="margin:0 0 20px;font-size:12px;line-height:1.6;color:#9ca3af;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="{{encodedResetUrl}}" style="color:#4f46e5;">{{encodedResetUrl}}</a>
        </p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
        Didn't request this? You can safely ignore this email — your password won't change unless you click the link above and choose a new one.
        </p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:11px;color:#9ca3af;">This link expires in 1 hour.</p>
        </td></tr>
        </table>
        </td></tr>
        </table>
        </body>
        </html>
        """;
    }

    // Simple, clean, table-based layout (inline CSS only) so it renders
    // consistently across email clients that strip <style> blocks (Outlook
    // desktop chief among them) - the same constraint every transactional
    // email template has to design around.
    private static string BuildLoginNotificationHtml(string userLabel, DateTime loginTimeUtc, bool isTest = false)
    {
        var formattedTime = loginTimeUtc.ToString("dddd, dd MMMM yyyy 'at' HH:mm 'UTC'");
        var testBanner = isTest
            ? "<tr><td style=\"background:#fef3c7;color:#92400e;padding:12px 32px;font-size:13px;font-weight:600;\">" +
              "This is a TEST email sent from Settings &rarr; Credentials &rarr; Notifications. No real login occurred." +
              "</td></tr>"
            : string.Empty;

        return $$"""
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
        <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        {{testBanner}}
        <tr><td style="background:#4f46e5;padding:24px 32px;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;">Deployment Portal</span>
        </td></tr>
        <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Successful Login</h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">
        Your account was successfully logged in to the Deployment Portal.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;margin-bottom:20px;">
        <tr>
        <td style="padding:16px 20px;font-size:13px;color:#6b7280;width:110px;">Account</td>
        <td style="padding:16px 20px 16px 0;font-size:13px;color:#111827;font-weight:600;">{{WebUtility.HtmlEncode(userLabel)}}</td>
        </tr>
        <tr>
        <td style="padding:0 20px 16px;font-size:13px;color:#6b7280;">Login time</td>
        <td style="padding:0 20px 16px 0;font-size:13px;color:#111827;font-weight:600;">{{WebUtility.HtmlEncode(formattedTime)}}</td>
        </tr>
        </table>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;padding:16px;background:#fff7ed;border-left:3px solid #f97316;border-radius:4px;">
        <strong style="color:#9a3412;">Security notice:</strong> If you did not perform this login, contact your
        portal administrator immediately.
        </p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:11px;color:#9ca3af;">This is an automated message from Deployment Portal. Please do not reply to this email.</p>
        </td></tr>
        </table>
        </td></tr>
        </table>
        </body>
        </html>
        """;
    }
}

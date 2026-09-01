using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Provider-agnostic transactional-email abstraction - ResendEmailService is
// the only implementation today, same "keep the provider replaceable"
// reasoning as IAiAssistantService/GeminiService. Nothing outside this
// interface (AuthController, SettingsController) knows it's Resend
// specifically.
//
// Neither method throws - both catch everything internally and return
// Success=false with a Message instead. That's deliberate: a login must
// never fail just because the notification email couldn't be sent (see
// AuthController.Callback), so the "never throws" contract lives here
// rather than requiring every caller to remember its own try/catch.
public interface IEmailService
{
    // Fire-and-check, not fire-and-forget - the caller still awaits this
    // and can inspect/log the result, it just never lets a failure here
    // propagate as an exception into the login flow.
    Task<EmailSendResultDto> SendLoginNotificationAsync(string toEmail, string toLogin, DateTime loginTimeUtc);

    // Backs the Credentials page's "Send Test Email" button - same
    // template, sent on demand to whatever address the admin types in,
    // so the Resend configuration can be verified without waiting for a
    // real login.
    Task<EmailSendResultDto> SendTestEmailAsync(string toEmail);

    // Sent once, right after signup - welcome message plus the link that
    // actually activates the account (see AccountAuthService.SignUpAsync/
    // AccountAuthController.VerifyEmail). Login-time notifications are a
    // completely separate email (SendLoginNotificationAsync above) - this
    // one only ever fires for the one-time registration flow.
    Task<EmailSendResultDto> SendWelcomeVerificationEmailAsync(string toEmail, string username, string verifyUrl);

    // Sent when RequestPasswordResetAsync issues a fresh reset token -
    // resetUrl points at a FRONTEND page (unlike verifyUrl above, which
    // points straight at a backend GET route with nothing left to submit),
    // since setting a new password needs a form, not just a click.
    Task<EmailSendResultDto> SendPasswordResetEmailAsync(string toEmail, string username, string resetUrl);
}

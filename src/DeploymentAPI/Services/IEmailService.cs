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

    // Google/GitHub OAuth's own welcome email - unlike the verification
    // one above, there's no link to click: the provider already verified
    // this email, so the account is immediately usable. Sent exactly once,
    // the first time a given Google identity is ever seen (see
    // OAuthLoginFinisher.FinishAsync's isNewAccount) - portalUrl is just
    // the frontend's own URL, for a "open Deployment Portal" button.
    Task<EmailSendResultDto> SendWelcomeEmailAsync(string toEmail, string username, string portalUrl);

    // The MFA challenge screen's "Send OTP to Email" alternate verification
    // path (SettingsService.IssueOtpAsync, purpose "MFA") - security-
    // critical, unlike the other methods here: a caller sending this one
    // does NOT swallow a failure the way SendWelcomeVerificationEmailAsync's
    // caller does, since a user must never be told a code is on its way
    // when it isn't (see AccountAuthController's login-mfa/send-otp).
    Task<EmailSendResultDto> SendMfaOtpEmailAsync(string toEmail, string username, string otp);

    // The forgot-password flow's first email (SettingsService.IssueOtpAsync,
    // purpose "PASSWORD_RESET") - same security-critical/non-swallowed
    // reasoning as SendMfaOtpEmailAsync, but the CALLER still always
    // returns the same generic "if this account exists..." response to
    // the browser regardless of send success, to avoid revealing whether
    // the email matched an account (see AccountAuthController.ForgotPassword).
    Task<EmailSendResultDto> SendPasswordResetOtpEmailAsync(string toEmail, string username, string otp);

    // Sent once the password has actually been changed (AccountAuthService.
    // ResetPasswordAsync succeeding) - an FYI, not gating anything, so a
    // failure here is swallowed the same way SendWelcomeVerificationEmailAsync's
    // caller does. Never includes the new password.
    Task<EmailSendResultDto> SendPasswordResetConfirmationAsync(string toEmail, string username);
}

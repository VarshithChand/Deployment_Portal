namespace DeploymentAPI.DTOs;

// Portal-wide (shared), same storage/admin model as Docker/OAuth/AI
// Assistant above - one Resend API key/from-address for the whole portal,
// not one per user. See SettingsService.SaveNotificationSettingsAsync/
// GetNotificationCredentialsAsync.
public class NotificationSettingsUpdateDto
{
    public string? ApiKey { get; set; }

    public string FromEmail { get; set; } = string.Empty;

    public string FromName { get; set; } = string.Empty;
}

// Never sent to the frontend as-is - ResendEmailService/SettingsController
// read the real ApiKey server-side only. SettingsViewDto (what the frontend
// gets) only ever exposes NotificationsApiKeyConfigured (bool) plus the
// non-secret FromEmail/FromName - see SettingsService.BuildView.
public record NotificationCredentials(string? ApiKey, string FromEmail, string FromName)
{
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(FromEmail);
}

// Body for POST api/settings/notifications/test - who to send the test
// login-notification email to. Deliberately not auto-resolved from the
// caller's own session (a PAT-based admin session has no reliable email to
// resolve), so the admin testing this just types where to send it.
public class EmailTestRequestDto
{
    public string ToEmail { get; set; } = string.Empty;
}

// Mirrors AiTestConnectionResultDto's shape - IEmailService never throws
// (see ResendEmailService), it always returns one of these, so a caller
// (the login flow, the Test Email button) never needs its own try/catch
// just to stay safe.
public class EmailSendResultDto
{
    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;
}

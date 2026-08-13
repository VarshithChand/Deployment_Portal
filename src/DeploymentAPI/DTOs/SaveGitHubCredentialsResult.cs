namespace DeploymentAPI.DTOs;

// SaveUserGitHubCredentialsAsync's own return - Success is false only
// when the resolved token's real GitHub identity is already active on a
// different device (see SettingsService.ActiveDeviceWindow); ConflictMessage
// is the safe, ready-to-show explanation for that case, and Credentials
// is null then too, since nothing was written. Every other outcome
// (first connection, reconnecting the same device, taking over an
// abandoned session) succeeds and returns the saved credentials as before.
public record SaveGitHubCredentialsResult(bool Success, string? ConflictMessage, UserGitHubCredentials? Credentials);

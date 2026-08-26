using System.Security.Cryptography;
using DeploymentAPI.Configuration;
using DeploymentAPI.Models;
using Microsoft.Extensions.Options;

namespace DeploymentAPI.Services;

// Resolves identity/role for the email/password login path - the
// "signup"/"login" half of what replaces PAT-login. Deliberately narrow:
// this only validates credentials and figures out Admin/Viewer/rejected,
// it doesn't touch HTTP/session/cookie concerns (see AccountAuthController,
// which owns the MFA-pending orchestration and JWT-cookie issuance, mirroring
// how AuthController already keeps that same split for GitHub OAuth).
public class AccountAuthService
{
    private const int MinPasswordLength = 8;

    private readonly SettingsService _settings;
    private readonly IOptionsMonitor<AuthorizationSettings> _authzOptions;

    public AccountAuthService(SettingsService settings, IOptionsMonitor<AuthorizationSettings> authzOptions)
    {
        _settings = settings;
        _authzOptions = authzOptions;
    }

    public async Task<AccountAuthResult> SignUpAsync(string email, string password, string? displayName)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();

        if (string.IsNullOrWhiteSpace(normalizedEmail) || !normalizedEmail.Contains('@'))
            return AccountAuthResult.Fail("Enter a valid email address.");

        if (string.IsNullOrWhiteSpace(password) || password.Length < MinPasswordLength)
            return AccountAuthResult.Fail($"Password must be at least {MinPasswordLength} characters.");

        if (await _settings.FindUserByEmailAsync(normalizedEmail) != null)
            return AccountAuthResult.Fail("An account with this email already exists.");

        var id = "usr_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(12)).ToLowerInvariant();
        var user = await _settings.CreateUserAsync(id, normalizedEmail, password, "password", displayName);

        return await ResolveRoleAsync(user);
    }

    public async Task<AccountAuthResult> LoginWithPasswordAsync(string email, string password)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await _settings.FindUserByEmailAsync(normalizedEmail);

        // Same message whether the email doesn't exist or the password is
        // wrong - distinguishing the two would let an attacker enumerate
        // which emails have accounts.
        if (user == null || !await _settings.VerifyUserPasswordAsync(user.Id, password))
            return AccountAuthResult.Fail("Invalid email or password.");

        // LastLoginAtUtc is updated once the login actually completes (see
        // AccountAuthController.IssueSessionAsync), not here - for an
        // account with MFA enabled, the password alone hasn't finished a
        // login yet.
        return await ResolveRoleAsync(user);
    }

    // Shared by SignUpAsync/LoginWithPasswordAsync and (Phase B) Google
    // login - given an already-authenticated PortalUserAccount, decides
    // Admin/Viewer/rejected the same way AuthService.ExchangeCodeForUserAsync
    // does for GitHub OAuth, just checked by email instead of username.
    public AccountAuthResult ResolveRoleSync(PortalUserAccount user)
    {
        var authz = _authzOptions.CurrentValue;

        var isAdmin = authz.AdminEmails.Any(e => string.Equals(e, user.Email, StringComparison.OrdinalIgnoreCase));
        var isViewer = authz.ViewerEmails.Any(e => string.Equals(e, user.Email, StringComparison.OrdinalIgnoreCase));

        var allowlistConfigured = authz.AdminGitHubUsernames.Count > 0 || authz.ViewerGitHubUsernames.Count > 0
            || authz.AdminEmails.Count > 0 || authz.ViewerEmails.Count > 0;

        if (allowlistConfigured && !isAdmin && !isViewer)
        {
            return AccountAuthResult.Fail(
                "Your account isn't authorized to access this portal yet. Ask an admin to add your email to the allowlist.");
        }

        return AccountAuthResult.Ok(user, isAdmin ? "Admin" : "Viewer");
    }

    private Task<AccountAuthResult> ResolveRoleAsync(PortalUserAccount user) => Task.FromResult(ResolveRoleSync(user));
}

public class AccountAuthResult
{
    public bool Success { get; private init; }

    public string? Error { get; private init; }

    public PortalUserAccount? User { get; private init; }

    public string? Role { get; private init; }

    public static AccountAuthResult Fail(string error) => new() { Success = false, Error = error };

    public static AccountAuthResult Ok(PortalUserAccount user, string role) =>
        new() { Success = true, User = user, Role = role };
}

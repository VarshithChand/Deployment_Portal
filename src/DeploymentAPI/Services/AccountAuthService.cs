using System.Security.Cryptography;
using System.Text.RegularExpressions;
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
    private static readonly TimeSpan EmailVerificationTtl = TimeSpan.FromHours(24);
    private static readonly TimeSpan PasswordResetTtl = TimeSpan.FromHours(1);

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
        var username = await DeriveUniqueUsernameAsync(normalizedEmail);
        var user = await _settings.CreateUserAsync(id, normalizedEmail, password, "password", displayName, username, emailVerified: false, mustSetUpMfa: true);

        // A fresh password account can't log in - let alone get a role
        // resolved or an MFA decision made - until the link in the
        // welcome email is clicked (see AccountAuthController.VerifyEmail).
        // The token is generated and stored here, then handed back on the
        // User object itself so the controller (which owns building URLs
        // and sending mail) can send it without a second round-trip to
        // fetch it back.
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var expiresAt = DateTime.UtcNow.Add(EmailVerificationTtl);

        await _settings.SetEmailVerificationTokenAsync(id, token, expiresAt);

        user.EmailVerificationToken = token;
        user.EmailVerificationTokenExpiresAtUtc = expiresAt;

        return AccountAuthResult.RequireVerification(user);
    }

    // identifier is whatever was typed into the single login field -
    // an email (contains '@') resolves against FindUserByEmailAsync same
    // as always; anything else is tried as a username instead (see
    // DeriveUniqueUsernameAsync below for where that comes from).
    public async Task<AccountAuthResult> LoginWithPasswordAsync(string identifier, string password)
    {
        var normalized = identifier.Trim().ToLowerInvariant();

        var user = normalized.Contains('@')
            ? await _settings.FindUserByEmailAsync(normalized)
            : await _settings.FindUserByUsernameAsync(normalized);

        // Same message whether the identifier doesn't exist or the
        // password is wrong - distinguishing the two would let an
        // attacker enumerate which emails/usernames have accounts.
        if (user == null || !await _settings.VerifyUserPasswordAsync(user.Id, password))
            return AccountAuthResult.Fail("Invalid email/username or password.");

        // Registration-only gate, not a login-time one otherwise - once
        // verified this never blocks a login again. Correct credentials
        // for a still-unverified account means they know the password but
        // never finished signup, so re-pointing them at their inbox is
        // more useful than a generic rejection.
        if (!user.EmailVerified)
        {
            return AccountAuthResult.Fail(
                "Verify your email before logging in - check your inbox for the link we sent when you signed up.");
        }

        // LastLoginAtUtc is updated once the login actually completes (see
        // AccountAuthController.IssueSessionAsync), not here - for an
        // account with MFA enabled, the password alone hasn't finished a
        // login yet.
        return await ResolveRoleAsync(user);
    }

    // Always returns null-or-user with no distinction visible to the
    // caller beyond that - an unknown email and a Google/GitHub-only
    // account (nothing to reset) both come back null, the same "don't let
    // this response reveal which emails have accounts" reasoning
    // LoginWithPasswordAsync's shared failure message already follows.
    // The controller sends an identical "check your email" response
    // either way (see AccountAuthController.ForgotPassword).
    public async Task<PortalUserAccount?> RequestPasswordResetAsync(string email)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await _settings.FindUserByEmailAsync(normalizedEmail);

        if (user == null || !user.HasPassword)
            return null;

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var expiresAt = DateTime.UtcNow.Add(PasswordResetTtl);

        await _settings.SetPasswordResetTokenAsync(user.Id, token, expiresAt);

        user.PasswordResetToken = token;

        return user;
    }

    // Proving control of the reset link is comparable trust to proving
    // control of the password itself, so this goes through the exact same
    // role-resolution the normal password login does - and, critically,
    // the SAME MFA gate. Auto-issuing a session straight from here for an
    // MFA-enabled account would let anyone who only compromised the email
    // inbox (a much lower bar than password+MFA together) fully take over
    // the account without ever passing MFA - so this only ever resolves a
    // role, it never itself decides whether a session is safe to hand out.
    // AccountAuthController.FinishPrimaryFactorAsync (the same shared tail
    // signup/login already use) is what makes that call, exactly as it
    // would for a normal login.
    public async Task<AccountAuthResult> ResetPasswordAsync(string token, string newPassword)
    {
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < MinPasswordLength)
            return AccountAuthResult.Fail($"Password must be at least {MinPasswordLength} characters.");

        var user = await _settings.ConsumePasswordResetTokenAsync(token, newPassword);

        if (user == null)
            return AccountAuthResult.Fail("This reset link is invalid or has expired. Request a new one.");

        return await ResolveRoleAsync(user);
    }

    // Derived from the email's local part (e.g. "jane.doe" from
    // "jane.doe@example.com"), stripped down to what a username actually
    // allows and de-duplicated against existing accounts - lets every
    // password account log in by username without adding a separate,
    // user-chosen field to the signup form. Falls back to a short random
    // suffix on collision; if it somehow still can't find a free one
    // after a few tries, the account is created without a username (email
    // login still works - see CreateUserAsync's own null-is-fine handling).
    private async Task<string?> DeriveUniqueUsernameAsync(string normalizedEmail)
    {
        var localPart = normalizedEmail.Split('@')[0];
        var baseUsername = Regex.Replace(localPart, "[^a-z0-9._-]", "", RegexOptions.None, TimeSpan.FromSeconds(1));

        if (string.IsNullOrWhiteSpace(baseUsername))
            baseUsername = "user";

        if (await _settings.FindUserByUsernameAsync(baseUsername) == null)
            return baseUsername;

        for (var attempt = 0; attempt < 5; attempt++)
        {
            var candidate = $"{baseUsername}-{Convert.ToHexString(RandomNumberGenerator.GetBytes(2)).ToLowerInvariant()}";

            if (await _settings.FindUserByUsernameAsync(candidate) == null)
                return candidate;
        }

        return null;
    }

    // Shared by SignUpAsync/LoginWithPasswordAsync and Google login - given
    // an already-authenticated PortalUserAccount, decides Admin vs Viewer
    // the same way AuthService.ExchangeCodeForUserAsync does for GitHub
    // OAuth, just checked by email instead of username. No allowlist gate
    // here anymore - anyone who successfully authenticates gets in as a
    // Viewer by default; AdminEmails only decides who additionally gets
    // Admin. Promoting/demoting is the super-admin's own call afterward,
    // from Settings > Admin Access - not something the login flow itself
    // pre-approves.
    public AccountAuthResult ResolveRoleSync(PortalUserAccount user)
    {
        var authz = _authzOptions.CurrentValue;

        var isAdmin = authz.AdminEmails.Any(e => string.Equals(e, user.Email, StringComparison.OrdinalIgnoreCase));

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

    // True only for a just-created password account (see
    // AccountAuthService.SignUpAsync) - the controller checks this BEFORE
    // the usual MFA-required check, since role/MFA don't matter yet for an
    // account that hasn't proven its email at all. User.EmailVerificationToken
    // is what the controller needs to build the verify link and send it.
    public bool EmailVerificationRequired { get; private init; }

    public static AccountAuthResult Fail(string error) => new() { Success = false, Error = error };

    public static AccountAuthResult Ok(PortalUserAccount user, string role) =>
        new() { Success = true, User = user, Role = role };

    public static AccountAuthResult RequireVerification(PortalUserAccount user) =>
        new() { Success = true, User = user, EmailVerificationRequired = true };
}

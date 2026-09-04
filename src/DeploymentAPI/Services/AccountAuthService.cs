using System.Security.Cryptography;
using System.Text.RegularExpressions;
using DeploymentAPI.Configuration;
using DeploymentAPI.Helpers;
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

    // Short - this now only covers the gap between "OTP verified" and
    // "new password actually submitted" (a form on the same page load),
    // not "time to notice and click an email link" the way it did before
    // the reset flow switched to OTP entry.
    private static readonly TimeSpan PasswordResetTtl = TimeSpan.FromMinutes(15);

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
        // attacker enumerate which emails/usernames have accounts. The
        // resolved user (when there is one) still rides along on User
        // even though Success is false - AccountAuthController.Login uses
        // it to record a failed attempt to THAT account's own Login
        // History, which leaks nothing new to the caller (the HTTP
        // response is identical either way, still just the generic
        // message) but gives the real owner visibility into wrong-
        // password attempts against their account. user is null here
        // when the identifier itself didn't match anything - nothing to
        // record a failure against in that case.
        if (user == null || !await _settings.VerifyUserPasswordAsync(user.Id, password))
            return AccountAuthResult.Fail("Invalid email/username or password.", user);

        // Registration-only gate, not a login-time one otherwise - once
        // verified this never blocks a login again. Correct credentials
        // for a still-unverified account means they know the password but
        // never finished signup, so re-pointing them at their inbox is
        // more useful than a generic rejection.
        if (!user.EmailVerified)
        {
            return AccountAuthResult.Fail(
                "Verify your email before logging in - check your inbox for the link we sent when you signed up.", user);
        }

        // LastLoginAtUtc is updated once the login actually completes (see
        // AccountAuthController.IssueSessionAsync), not here - for an
        // account with MFA enabled, the password alone hasn't finished a
        // login yet.
        return await ResolveRoleAsync(user);
    }

    // Always returns User=null with no distinction visible to the caller
    // beyond that - an unknown email, a Google/GitHub-only account
    // (nothing to reset), and a rate-limited/cooldown request all look
    // the same from here on, the same "don't let this response reveal
    // which emails have accounts" reasoning LoginWithPasswordAsync's
    // shared failure message already follows. The controller sends an
    // identical "if this account exists..." response in every case (see
    // AccountAuthController.ForgotPassword) - Outcome is exposed only for
    // that controller's own logging, never surfaced to the caller.
    public async Task<ForgotPasswordResult> RequestPasswordResetAsync(string email)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await _settings.FindUserByEmailAsync(normalizedEmail);

        if (user == null || !user.HasPassword)
            return new ForgotPasswordResult();

        var otpResult = await _settings.IssueOtpAsync(user.Id, OtpPurpose.PasswordReset);

        return new ForgotPasswordResult
        {
            User = otpResult.Outcome == SettingsService.OtpRequestOutcome.Issued ? user : null,
            Otp = otpResult.Code
        };
    }

    // Proving control of the emailed code is comparable trust to proving
    // control of the password itself - once verified, this issues a
    // short-lived, single-use token (the exact same SetPasswordResetTokenAsync/
    // ConsumePasswordResetTokenAsync mechanism this reset flow already
    // had) authorizing the ACTUAL password change in a separate follow-up
    // call, rather than changing the password directly from here. That
    // keeps the OTP itself single-use and fully consumed the moment it's
    // verified, regardless of whether the user goes on to actually submit
    // a new password.
    public async Task<OtpVerifyResult> VerifyPasswordResetOtpAsync(string email, string otp)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await _settings.FindUserByEmailAsync(normalizedEmail);

        // Same generic message an unknown email gets as a genuinely wrong/
        // expired code - this step is already past the point where the
        // forgot-password request revealed nothing, but there's no reason
        // to start revealing it now either.
        if (user == null)
            return OtpVerifyResult.Fail("Invalid or expired verification code.");

        var outcome = await _settings.VerifyOtpAsync(user.Id, OtpPurpose.PasswordReset, otp);

        if (outcome != SettingsService.OtpVerifyOutcome.Success)
        {
            return OtpVerifyResult.Fail(outcome switch
            {
                SettingsService.OtpVerifyOutcome.Expired => "This code has expired. Request a new one.",
                SettingsService.OtpVerifyOutcome.TooManyAttempts => "Too many incorrect attempts. Request a new code.",
                _ => "Invalid or expired verification code."
            });
        }

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        var expiresAt = DateTime.UtcNow.Add(PasswordResetTtl);

        await _settings.SetPasswordResetTokenAsync(user.Id, token, expiresAt);

        return OtpVerifyResult.Ok(token);
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

    // Lets an existing Google/GitHub-only account (no PasswordHash at all)
    // add password login for the first time, without creating a second
    // account - see PortalUserAccount.HasPassword's own comment for why
    // RequestPasswordResetAsync refuses to touch such an account; this is
    // the deliberate, explicit "yes, add one" action a reset request isn't.
    // Requires the caller to already be authenticated (see
    // AccountAuthController.SetPassword) - there's no separate proof needed
    // beyond that, since an account with no existing password has nothing
    // to verify first. Deliberately refuses to touch an account that
    // already has a password - this is "add a password," not "change your
    // password," which would need the current one re-proven first and
    // isn't what this endpoint is for.
    public async Task<SetPasswordResult> SetPasswordAsync(string userId, string newPassword)
    {
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < MinPasswordLength)
            return SetPasswordResult.Fail($"Password must be at least {MinPasswordLength} characters.");

        var user = await _settings.GetUserByIdAsync(userId);

        if (user == null)
            return SetPasswordResult.Fail("Unable to verify your identity right now.");

        if (user.HasPassword)
            return SetPasswordResult.Fail("This account already has a password.");

        var username = await DeriveUniqueUsernameAsync(user.Email);

        await _settings.SetUserPasswordAsync(userId, newPassword, username);

        return SetPasswordResult.Ok();
    }

    // The opposite guard from SetPasswordAsync above - that one is "add a
    // password to an account that has none," this is "prove the current
    // one, then replace it," for Settings > Account's Change Password
    // section. Re-verifying CurrentPassword here (rather than trusting the
    // active session alone, the way SetPasswordAsync does) matters because
    // this is changing a secret that already exists - a hijacked but not-
    // yet-expired session shouldn't be able to lock the real owner out by
    // silently swapping it.
    public async Task<SetPasswordResult> ChangePasswordAsync(string userId, string currentPassword, string newPassword)
    {
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < MinPasswordLength)
            return SetPasswordResult.Fail($"Password must be at least {MinPasswordLength} characters.");

        var user = await _settings.GetUserByIdAsync(userId);

        if (user == null)
            return SetPasswordResult.Fail("Unable to verify your identity right now.");

        if (!user.HasPassword)
            return SetPasswordResult.Fail("This account doesn't have a password yet - use \"Set Password\" instead.");

        if (!await _settings.VerifyUserPasswordAsync(userId, currentPassword))
            return SetPasswordResult.Fail("Current password is incorrect.");

        await _settings.SetUserPasswordAsync(userId, newPassword, username: null);

        return SetPasswordResult.Ok();
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

    // user is optional and ONLY ever meaningful for a login-attempt
    // failure (see LoginWithPasswordAsync) - every other Fail() call site
    // in this file passes nothing, matching their existing behavior
    // exactly. Setting User here doesn't change how a Fail result is
    // handled anywhere else (every caller already checks Success first),
    // so this is purely additive.
    public static AccountAuthResult Fail(string error, PortalUserAccount? user = null) =>
        new() { Success = false, Error = error, User = user };

    public static AccountAuthResult Ok(PortalUserAccount user, string role) =>
        new() { Success = true, User = user, Role = role };

    public static AccountAuthResult RequireVerification(PortalUserAccount user) =>
        new() { Success = true, User = user, EmailVerificationRequired = true };
}

// User/Otp are both null when nothing should be emailed (unknown email, no
// password on the account, or rate-limited/cooldown) - the controller
// always sends the same generic response regardless, this just tells it
// whether there's actually anything to send.
public class ForgotPasswordResult
{
    public PortalUserAccount? User { get; init; }
    public string? Otp { get; init; }
}

public class OtpVerifyResult
{
    public bool Success { get; private init; }
    public string? Error { get; private init; }
    public string? ResetToken { get; private init; }

    public static OtpVerifyResult Fail(string error) => new() { Success = false, Error = error };
    public static OtpVerifyResult Ok(string resetToken) => new() { Success = true, ResetToken = resetToken };
}

public class SetPasswordResult
{
    public bool Success { get; private init; }
    public string? Error { get; private init; }

    public static SetPasswordResult Fail(string error) => new() { Success = false, Error = error };
    public static SetPasswordResult Ok() => new() { Success = true };
}

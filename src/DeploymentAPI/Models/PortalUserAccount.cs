namespace DeploymentAPI.Models;

// A real, persisted account - the thing "logging in" actually means now,
// replacing the old PAT-login flow where "logged in" just meant a GitHub
// PAT was saved against an anonymous browser session (see PortalIdentity.cs).
// Stored as root["Users"][Id] in SettingsService's single settings blob,
// same pattern as every other section there - see SettingsService's own
// Users region (CreateUserAsync/GetUserByIdAsync/FindUserByEmailAsync/
// UpdateUserAsync).
//
// Id is deliberately an opaque string, not a uniform GUID/int, so existing
// data tied to a GitHub username needs no migration:
//   - GitHub OAuth accounts: Id = the raw GitHub username (unchanged from
//     today - this is what already keys root["Mfa"][login], so an existing
//     admin's MFA enrollment keeps working with zero data migration).
//   - Google accounts: Id = "google:" + the Google "sub" claim.
//   - Email/password accounts: Id = a freshly generated "usr_" + random hex.
public class PortalUserAccount
{
    public string Id { get; set; } = string.Empty;

    // Always lowercased before being stored/compared - see
    // SettingsService.FindUserByEmailAsync.
    public string Email { get; set; } = string.Empty;

    // Null for an account that has only ever signed in via Google/GitHub -
    // hashed with Microsoft.AspNetCore.Identity's PasswordHasher<TUser>,
    // never the plaintext password, never returned in any API response.
    public string? PasswordHash { get; set; }

    public string? DisplayName { get; set; }

    // Derived from the email's local part at signup time (e.g.
    // "jane.doe" from "jane.doe@example.com"), deduplicated against
    // existing accounts - see AccountAuthService.SignUpAsync. Lets a
    // password account log in with either this or its email
    // (LoginWithPasswordAsync), without requiring a separate field on the
    // signup form. Null for Google/GitHub-only accounts - they never go
    // through the password login form this exists for.
    public string? Username { get; set; }

    // Set once an account has also signed in via that provider - lets one
    // account be reached through more than one login method without
    // creating a duplicate (see AccountAuthService's linking logic).
    public string? LinkedGitHubLogin { get; set; }

    public string? LinkedGoogleSub { get; set; }

    // "password" | "google" | "github" - which method created this account;
    // informational only (Services > Users display), not itself a security
    // boundary - LinkedGitHubLogin/LinkedGoogleSub being set is what actually
    // allows signing in through those providers regardless of this value.
    public string Provider { get; set; } = "password";

    public DateTime CreatedAtUtc { get; set; }

    public DateTime? LastLoginAtUtc { get; set; }

    // A fresh password signup can't log in until this flips true (see
    // AccountAuthService.LoginWithPasswordAsync/AccountAuthController.
    // VerifyEmail) - proven by clicking the link in the welcome email,
    // which is the one-time registration-only step this exists for.
    // Google/GitHub accounts are created with this already true - the
    // provider already verified that email, so there's nothing left to
    // prove here (and no separate password login path to gate anyway).
    public bool EmailVerified { get; set; }

    // Null once verified/consumed - see SettingsService.
    // SetEmailVerificationTokenAsync/VerifyEmailAsync. A fresh token
    // (re-sent on request) simply overwrites whatever was here before, so
    // only the most recently issued link ever works.
    public string? EmailVerificationToken { get; set; }

    public DateTime? EmailVerificationTokenExpiresAtUtc { get; set; }

    // True from the moment this account first becomes real (email verified
    // for a password account, or first login for Google) until MFA is
    // actually enrolled - see MfaPolicy.EvaluateAsync, which folds this
    // into Blocked unconditionally (no 2-skip grace period the way an
    // existing account's cloud-credential/admin-required nudge gets). That
    // makes the "register -> verify -> MFA -> dashboard" sequence a real
    // server-enforced gate instead of a one-time frontend redirect signal
    // that a refresh could silently drop. Cleared for good the moment
    // VerifyMfaEnrollmentAsync succeeds - never re-armed just because MFA
    // is later disabled.
    public bool MustSetUpMfa { get; set; }

    // Whether a password hash actually exists in storage - the hash
    // itself is never mapped onto this model at all (see SettingsService.
    // ParseUser), so this is the only way a caller can tell "has a
    // password" apart from "Google/GitHub-only account" without touching
    // the hash. Used by AccountAuthService.RequestPasswordResetAsync to
    // silently no-op a reset request for an account that has nothing to
    // reset, rather than emailing a link that would otherwise just bolt a
    // brand new password onto an account nobody asked to add one to.
    public bool HasPassword { get; set; }

    // Null once consumed/expired - mirrors EmailVerificationToken exactly
    // (see that field's own comment): only AccountAuthService.
    // RequestPasswordResetAsync's in-memory copy, set right after
    // generating it, is ever populated - a general read (GetUserByIdAsync/
    // FindUserByEmailAsync) never returns this.
    public string? PasswordResetToken { get; set; }
}

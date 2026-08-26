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
}

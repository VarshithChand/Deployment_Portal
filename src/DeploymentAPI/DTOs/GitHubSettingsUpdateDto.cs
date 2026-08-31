namespace DeploymentAPI.DTOs;

public class GitHubSettingsUpdateDto
{
    // Nullable, not string.Empty-defaulted - a repo-less save (just a
    // token, picked later - see GitHubAccessSection.jsx) sends these as
    // JSON null. A non-nullable string here made ASP.NET Core's implicit
    // model validation reject that null before SaveMyGitHub's own
    // "blank is explicitly allowed" handling ever ran.
    public string? Owner { get; set; }

    public string? Repository { get; set; }

    // Left blank/null keeps the previously saved token instead of clearing it.
    public string? PersonalAccessToken { get; set; }

    // A value here sets/replaces the stored expiry date. A caller that
    // doesn't know this field exists (RequireGitHubSetup's reconnect-after-
    // sign-out flow, for one) simply omits it, which correctly leaves an
    // already-saved expiry untouched - null alone is NOT treated as "clear
    // it", since there'd be no way to tell that apart from "this caller
    // never heard of this field." Explicit clearing goes through
    // ClearPatExpiry below instead.
    public DateTime? PatExpiresAt { get; set; }

    // The only way to actually remove a saved expiry - see PatExpiresAt's
    // comment for why plain null can't mean this.
    public bool ClearPatExpiry { get; set; }

    // Only meaningful when PersonalAccessToken is also provided and its
    // resolved owner has MFA enabled - see MfaGate. Exactly one of these
    // two is expected when required; RecoveryCode is the "lost my phone"
    // fallback, single-use.
    public string? MfaCode { get; set; }

    public string? RecoveryCode { get; set; }
}

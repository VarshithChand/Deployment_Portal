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

    // Only meaningful when PersonalAccessToken is also provided and its
    // resolved owner has MFA enabled - see MfaGate. Exactly one of these
    // two is expected when required; RecoveryCode is the "lost my phone"
    // fallback, single-use.
    public string? MfaCode { get; set; }

    public string? RecoveryCode { get; set; }
}

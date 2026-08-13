namespace DeploymentAPI.DTOs;

// GET /api/bootstrap's response - everything the app shell needs to
// render before the user does anything, consolidated from what used to be
// up to 8 separate requests (GET /api/auth/me, /api/settings, three
// redundant copies of /api/settings/me/github, /api/settings/me/aws,
// /api/settings/me/pin, /api/github/token-owner - see BootstrapController
// for the full reasoning on what's included here and what deliberately
// isn't). Every field here is exactly what the corresponding standalone
// endpoint already returned - this is a composition of existing safe
// responses, not a new data-exposure surface.
public class BootstrapResponseDto
{
    public BootstrapAuthDto Auth { get; set; } = new();

    public SettingsViewDto Settings { get; set; } = new();

    public BootstrapGitHubDto GitHub { get; set; } = new();

    public BootstrapAwsDto Aws { get; set; } = new();

    public BootstrapPinDto Pin { get; set; } = new();

    // Null when no GitHub token is configured for this session - same
    // "don't call GitHub for nothing" guard GetMyGithub's caller
    // (AuthContext) used to apply itself before calling /token-owner.
    public TokenOwnerDto? TokenOwner { get; set; }
}

// Same shape AuthController.Me already returns ({login, role}), plus the
// authenticated flag so the frontend doesn't need a second round trip (or
// a null-check convention) to tell "checked, not logged in" apart from
// "hasn't checked yet".
public class BootstrapAuthDto
{
    public bool Authenticated { get; set; }

    public string? Login { get; set; }

    public string? Role { get; set; }
}

// Same fields SettingsController.GetMyGithub already returns.
public class BootstrapGitHubDto
{
    public string Owner { get; set; } = string.Empty;

    public string Repository { get; set; } = string.Empty;

    public bool TokenConfigured { get; set; }

    public bool IsConfigured { get; set; }

    public bool WasSignedOut { get; set; }
}

// Same fields SettingsController.GetMyAws already returns.
public class BootstrapAwsDto
{
    public bool Configured { get; set; }

    public string? Region { get; set; }

    public bool MfaEnrolled { get; set; }

    public bool MfaSessionActive { get; set; }

    public DateTime? MfaSessionExpiresAtUtc { get; set; }

    public bool IsSsoSession { get; set; }

    public string? SsoAccountName { get; set; }

    public string? SsoRoleName { get; set; }

    public bool RequiresSsoSignIn { get; set; }

    public string? IdentityLabel { get; set; }
}

public class BootstrapPinDto
{
    public bool Configured { get; set; }
}

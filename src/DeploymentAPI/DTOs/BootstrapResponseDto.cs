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

    public BootstrapMfaNudgeDto MfaNudge { get; set; } = new();
}

// Drives MfaEnforcementGate.jsx - whether to show a dismissible "set up
// MFA" nudge, whether that nudge is mandatory (this session has saved an
// AWS/Azure/GCP credential), and whether it's escalated into a full-screen
// block (mandatory + the 2-skip budget is spent). Computed server-side
// every bootstrap call - the frontend never decides any of this on its
// own, same "backend is the sole authority" principle Round 16/17's MFA
// login gate already established.
public class BootstrapMfaNudgeDto
{
    public bool Show { get; set; }

    public bool Mandatory { get; set; }

    public int SkipsUsed { get; set; }

    public bool Blocked { get; set; }
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

    // The repo/owner that was active right before the current one -
    // Dashboard's AllRepositoriesCard uses this for a "Previously used -
    // switch back" shortcut. Null until this session has switched repos at
    // least once (see SettingsService.SaveUserGitHubCredentialsAsync).
    public string? PreviousOwner { get; set; }

    public string? PreviousRepository { get; set; }
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

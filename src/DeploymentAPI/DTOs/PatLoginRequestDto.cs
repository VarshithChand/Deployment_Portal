namespace DeploymentAPI.DTOs;

// Body for POST api/auth/pat-login - the two-page login flow's first
// step. Deliberately just the one field - no username/email/password,
// per the login page's own design (the backend resolves the GitHub
// identity from the token itself).
public class PatLoginRequestDto
{
    public string PersonalAccessToken { get; set; } = string.Empty;
}

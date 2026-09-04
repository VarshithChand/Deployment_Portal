namespace DeploymentAPI.DTOs;

// Exactly one of these is actually checked, depending on whether the
// account has a password - see AccountAuthController.DeleteAccount.
// CurrentPassword re-proves identity the same way ChangePassword does for
// an account that has one; ConfirmPhrase (must equal "DELETE") is the
// fallback for a Google/GitHub-only account, which has no password to
// re-prove.
public class DeleteAccountRequestDto
{
    public string? CurrentPassword { get; set; }
    public string? ConfirmPhrase { get; set; }
}

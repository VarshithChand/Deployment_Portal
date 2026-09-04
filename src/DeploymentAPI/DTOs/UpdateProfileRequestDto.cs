namespace DeploymentAPI.DTOs;

// Each field null means "leave as-is" - see SettingsService.
// UpdateUserProfileAsync, which only writes the ones actually passed, so
// AccountView.jsx's single Edit Profile form can send exactly the fields it
// has inputs for without clobbering anything else.
public class UpdateProfileRequestDto
{
    public string? DisplayName { get; set; }
    public string? Username { get; set; }
    public string? PhoneNumber { get; set; }
}

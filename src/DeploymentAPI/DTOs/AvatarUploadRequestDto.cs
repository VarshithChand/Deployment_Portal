namespace DeploymentAPI.DTOs;

// Base64 (no data: prefix) of an already client-resized (<=256px) image -
// see AccountView.jsx's canvas resize step. The server also caps the
// decoded size defensively in AccountAuthController.UploadAvatar.
public class AvatarUploadRequestDto
{
    public string Base64 { get; set; } = string.Empty;
}

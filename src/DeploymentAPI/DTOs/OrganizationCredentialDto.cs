using System.Text.Json;

namespace DeploymentAPI.DTOs;

// Masked view of an organization_credentials row - NEVER includes the
// secret, decrypted or not (see OrgCredentialService). Config is arbitrary
// non-secret, provider-specific metadata (e.g. {"owner":"acme","repository":
// "app"} for provider "github") - a System.Text.Json JsonElement rather
// than the Newtonsoft JObject the rest of this codebase's JSON-blob code
// uses, since this DTO round-trips through ASP.NET Core's default
// System.Text.Json response serializer, which doesn't know how to
// serialize a Newtonsoft JObject's internal shape.
public class OrganizationCredentialDto
{
    public Guid Id { get; set; }

    public string Provider { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public JsonElement? Config { get; set; }

    public bool Configured { get; set; }

    public DateTime CreatedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }
}

public class SaveOrganizationCredentialRequestDto
{
    public string? Provider { get; set; }

    public string? Name { get; set; }

    public JsonElement? Config { get; set; }

    // Blank/omitted on an update keeps whatever secret was already saved -
    // same convention SettingsService.SaveUserGitHubCredentialsAsync's own
    // token field already follows.
    public string? Secret { get; set; }
}

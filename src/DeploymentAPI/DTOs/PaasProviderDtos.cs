namespace DeploymentAPI.DTOs;

// One visitor's own credential for ONE PaaS provider (Render, Cloudflare,
// Netlify, or Vercel) — session-scoped, same isolation model as
// UserAwsCredentials/UserAzureCredentials (see PortalIdentity): never
// shared portal-wide, never durable across devices, cleared on sign-out.
//
// A single generic shape for all four providers rather than four near-
// identical record types: three of the four (Render, Netlify, Vercel) are
// plain bearer-token APIs with nothing else to store. Cloudflare is the
// only one that needs a second field (an Account ID — its Pages/Workers
// endpoints are namespaced under /accounts/{account_id}/, unlike the other
// three which infer the account from the token itself). Folding that one
// extra field into this same record (simply unused/null for the other
// three providers) avoids either a fourth one-off DTO+SettingsService
// method set for Cloudflare, or a fully untyped Dictionary<string,string>
// bag with a "which keys are secret" side convention.
public record UserPaasCredentials(string? Token, string? AccountId)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(Token);
}

// What a Connect/Update form posts. AccountId is only required server-side
// for cloudflare — see PaasController.SaveCredentials.
public class PaasCredentialsUpdateDto
{
    public string Token { get; set; } = string.Empty;

    public string AccountId { get; set; } = string.Empty;
}

// One service/site/project under a connected account — deliberately as
// loose/generic as AwsResourceItemDto (see CloudCredentialsDto.cs) rather
// than a shape per provider, since Name/Type/Status/Url/UpdatedAt already
// covers a Render web service, a Cloudflare Pages project or Worker
// script, a Netlify site, and a Vercel project without four near-identical
// DTOs.
public class PaasServiceItemDto
{
    public string Name { get; set; } = string.Empty;

    // e.g. "web_service"/"static_site"/"background_worker" (Render),
    // "pages_project"/"worker" (Cloudflare), "site" (Netlify), "project"
    // (Vercel) — surfaced as-is so the frontend can show a small type
    // badge without the backend needing an enum every provider must fit.
    public string? Type { get; set; }

    // Provider's own status string, surfaced as-is rather than normalized
    // into one enum — the four providers' state machines don't line up
    // 1:1, and a forced normalization would either lose information or
    // invent states that don't exist.
    public string? Status { get; set; }

    public string? Url { get; set; }

    public DateTime? UpdatedAt { get; set; }
}

// One provider's connection status — same Configured/Found/Error contract
// as CloudStatusDto/AwsServiceStatusDto (CloudCredentialsDto.cs): Configured
// = "a token is saved for this session", Found = "the token actually works
// and the list below is real", Error = why it isn't — never throws, see
// PaasProviderService's per-provider try/catch contract.
public class PaasProviderStatusDto
{
    public string Provider { get; set; } = string.Empty;

    public bool Configured { get; set; }

    public bool Found { get; set; }

    public string? Error { get; set; }

    // "Which account am I actually looking at" — Render's owner name/
    // email, Cloudflare's account name, Netlify's full_name/email,
    // Vercel's name/username. Null whenever Found is false.
    public string? AccountLabel { get; set; }

    public List<PaasServiceItemDto> Services { get; set; } = new();
}

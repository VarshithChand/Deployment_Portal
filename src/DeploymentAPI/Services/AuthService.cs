using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using DeploymentAPI.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

public class AuthService
{
    private readonly IOptionsMonitor<GitHubOAuthSettings> _oauthOptions;
    private readonly IOptionsMonitor<JwtSettings> _jwtOptions;
    private readonly IOptionsMonitor<AuthorizationSettings> _authzOptions;
    private readonly IHttpClientFactory _httpClientFactory;

    public AuthService(
        IOptionsMonitor<GitHubOAuthSettings> oauthOptions,
        IOptionsMonitor<JwtSettings> jwtOptions,
        IOptionsMonitor<AuthorizationSettings> authzOptions,
        IHttpClientFactory httpClientFactory)
    {
        _oauthOptions = oauthOptions;
        _jwtOptions = jwtOptions;
        _authzOptions = authzOptions;
        _httpClientFactory = httpClientFactory;
    }

    public string BuildAuthorizeUrl(string state)
    {
        var settings = _oauthOptions.CurrentValue;

        // user:email (added alongside the pre-existing read:user) is what
        // lets ExchangeCodeForUserAsync below resolve a real, verified
        // email address via GitHub's /user/emails - without it, /user's own
        // "email" field is null for most accounts (only a public profile
        // email would ever show there), which would silently skip the
        // login-notification email for almost everyone. This does add one
        // more line to GitHub's OAuth consent screen ("Personal user email
        // addresses") - a necessary, minimal consequence of the email
        // feature itself, not a change to the login flow otherwise.
        return "https://github.com/login/oauth/authorize" +
               $"?client_id={Uri.EscapeDataString(settings.ClientId)}" +
               $"&redirect_uri={Uri.EscapeDataString(settings.CallbackUrl)}" +
               $"&scope={Uri.EscapeDataString("read:user user:email")}" +
               $"&state={Uri.EscapeDataString(state)}";
    }

    public async Task<(string Login, string Role, string? Email)> ExchangeCodeForUserAsync(string code)
    {
        var settings = _oauthOptions.CurrentValue;

        var tokenClient = _httpClientFactory.CreateClient();
        tokenClient.DefaultRequestHeaders.Add("Accept", "application/json");

        var tokenResponse = await tokenClient.PostAsync(
            "https://github.com/login/oauth/access_token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = settings.ClientId,
                ["client_secret"] = settings.ClientSecret,
                ["code"] = code,
                ["redirect_uri"] = settings.CallbackUrl
            }));

        tokenResponse.EnsureSuccessStatusCode();

        var tokenJson = JObject.Parse(await tokenResponse.Content.ReadAsStringAsync());
        var accessToken = tokenJson["access_token"]?.ToString();

        if (string.IsNullOrWhiteSpace(accessToken))
            throw new InvalidOperationException("GitHub did not return an access token.");

        var userClient = _httpClientFactory.CreateClient();
        userClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {accessToken}");
        userClient.DefaultRequestHeaders.Add("User-Agent", "DeploymentPortal");
        userClient.DefaultRequestHeaders.Add("Accept", "application/vnd.github+json");

        var userResponse = await userClient.GetAsync("https://api.github.com/user");
        userResponse.EnsureSuccessStatusCode();

        var userJson = JObject.Parse(await userResponse.Content.ReadAsStringAsync());
        var login = userJson["login"]?.ToString() ?? string.Empty;

        var email = await ResolvePrimaryEmailAsync(userClient, userJson);

        var authz = _authzOptions.CurrentValue;

        // Checked in parallel by username AND by email (when resolved) -
        // an existing GitHub-OAuth admin keeps working purely off their
        // username exactly as before, while the same email allowlist that
        // gates password and Google logins also recognizes a GitHub login
        // whose resolved email happens to be on it. No allowlist gate on
        // login itself anymore - anyone who authenticates with GitHub gets
        // in as a Viewer by default; these lists only decide who
        // additionally gets Admin (see AccountAuthService.ResolveRoleSync's
        // identical reasoning for the password/Google paths).
        var isAdmin = authz.AdminGitHubUsernames.Any(u => string.Equals(u, login, StringComparison.OrdinalIgnoreCase))
            || (email != null && authz.AdminEmails.Any(e => string.Equals(e, email, StringComparison.OrdinalIgnoreCase)));

        return (login, isAdmin ? "Admin" : "Viewer", email);
    }

    // GitHub's /user endpoint only ever returns a public profile email
    // (often null - most accounts don't set one public). /user/emails, only
    // reachable with the user:email scope, returns every address on the
    // account with primary/verified flags - the primary+verified one is
    // the actual "this person's real, working email" this app wants, not
    // whatever they happened to make public. Best-effort: any failure here
    // (scope not granted on an existing token, GitHub outage, etc.) falls
    // back to /user's own possibly-null field rather than failing the
    // login itself - a login must succeed even if it can't resolve email.
    private static async Task<string?> ResolvePrimaryEmailAsync(HttpClient userClient, JObject userJson)
    {
        try
        {
            var emailsResponse = await userClient.GetAsync("https://api.github.com/user/emails");

            if (emailsResponse.IsSuccessStatusCode)
            {
                var emails = JArray.Parse(await emailsResponse.Content.ReadAsStringAsync());

                var primary = emails.FirstOrDefault(e =>
                    e["primary"]?.Value<bool>() == true && e["verified"]?.Value<bool>() == true);

                var verified = primary ?? emails.FirstOrDefault(e => e["verified"]?.Value<bool>() == true);

                var resolved = (verified ?? emails.FirstOrDefault())?["email"]?.ToString();

                if (!string.IsNullOrWhiteSpace(resolved))
                    return resolved;
            }
        }
        catch (Exception)
        {
            // Swallowed deliberately - see this method's own comment above.
            // AuthController logs the downstream "no email to notify"
            // outcome itself; this call resolving nothing isn't its own
            // error to report.
        }

        var fallback = userJson["email"]?.ToString();
        return string.IsNullOrWhiteSpace(fallback) ? null : fallback;
    }

    // jti (a fresh GUID per token, never reused) is what Settings > Account's
    // Active Sessions / "sign out this device" is built on - see
    // SessionRecorder and Program.cs's OnTokenValidated event, which looks
    // this claim up against PortalUserAccount.Sessions on every request.
    // Callers get it back alongside the token string so they can record the
    // session right after issuing it.
    public (string Token, string Jti) IssueJwt(string login, string role, string? email = null)
    {
        var settings = _jwtOptions.CurrentValue;
        var jti = Guid.NewGuid().ToString();

        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, login),
            new(ClaimTypes.Role, role),
            new(JwtRegisteredClaimNames.Jti, jti)
        };

        if (!string.IsNullOrWhiteSpace(email))
            claims.Add(new Claim(ClaimTypes.Email, email));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.Secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: settings.Issuer,
            audience: settings.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(settings.ExpiryMinutes),
            signingCredentials: creds);

        return (new JwtSecurityTokenHandler().WriteToken(token), jti);
    }
}

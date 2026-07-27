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

        return "https://github.com/login/oauth/authorize" +
               $"?client_id={Uri.EscapeDataString(settings.ClientId)}" +
               $"&redirect_uri={Uri.EscapeDataString(settings.CallbackUrl)}" +
               "&scope=read:user" +
               $"&state={Uri.EscapeDataString(state)}";
    }

    public async Task<(string Login, string Role)> ExchangeCodeForUserAsync(string code)
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

        var authz = _authzOptions.CurrentValue;

        var isAdmin = authz.AdminGitHubUsernames
            .Any(u => string.Equals(u, login, StringComparison.OrdinalIgnoreCase));

        var isAllowedViewer = authz.ViewerGitHubUsernames
            .Any(u => string.Equals(u, login, StringComparison.OrdinalIgnoreCase));

        // Both lists empty means the portal hasn't been configured yet
        // (bootstrap mode) — let anyone finish the login so a first admin
        // can actually get in. Once either list has an entry, only the
        // usernames on them may proceed; everyone else is rejected here,
        // before a token is ever issued.
        var allowlistConfigured = authz.AdminGitHubUsernames.Count > 0 || authz.ViewerGitHubUsernames.Count > 0;

        if (allowlistConfigured && !isAdmin && !isAllowedViewer)
            throw new UnauthorizedAccessException($"GitHub user '{login}' is not on the allowlist for this portal.");

        return (login, isAdmin ? "Admin" : "Viewer");
    }

    public string IssueJwt(string login, string role)
    {
        var settings = _jwtOptions.CurrentValue;

        var claims = new[]
        {
            new Claim(ClaimTypes.Name, login),
            new Claim(ClaimTypes.Role, role)
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.Secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: settings.Issuer,
            audience: settings.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(settings.ExpiryMinutes),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

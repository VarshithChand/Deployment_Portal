using DeploymentAPI.Configuration;
using DeploymentAPI.Models;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Mirrors AuthService (GitHub OAuth) exactly, just against Google's own
// endpoints - see that file for the reasoning behind the overall shape.
// Unlike GitHub, Google's userinfo endpoint always includes a verified
// email directly (no separate /user/emails-style call needed) when the
// "email" scope is granted, and email_verified tells you outright whether
// to trust it - no best-effort fallback logic required here.
public class GoogleAuthService
{
    private readonly IOptionsMonitor<GoogleOAuthSettings> _oauthOptions;
    private readonly SettingsService _settings;
    private readonly IHttpClientFactory _httpClientFactory;

    public GoogleAuthService(IOptionsMonitor<GoogleOAuthSettings> oauthOptions, SettingsService settings, IHttpClientFactory httpClientFactory)
    {
        _oauthOptions = oauthOptions;
        _settings = settings;
        _httpClientFactory = httpClientFactory;
    }

    public string BuildAuthorizeUrl(string state)
    {
        var settings = _oauthOptions.CurrentValue;

        return "https://accounts.google.com/o/oauth2/v2/auth" +
               $"?client_id={Uri.EscapeDataString(settings.ClientId)}" +
               $"&redirect_uri={Uri.EscapeDataString(settings.CallbackUrl)}" +
               "&response_type=code" +
               $"&scope={Uri.EscapeDataString("openid email profile")}" +
               // Always shows the account picker instead of silently
               // re-using whichever Google account is already signed into
               // the browser - the deliberate, expected behavior for a
               // portal login button, not an accident to suppress.
               "&prompt=select_account" +
               $"&state={Uri.EscapeDataString(state)}";
    }

    // Returns the resolved PortalUserAccount (creating or linking to one -
    // see SettingsService.FindUserByEmailAsync/CreateUserAsync/
    // LinkProviderAsync) rather than a bare (login, role, email) tuple like
    // AuthService - Google/GitHub accounts key off email identity from the
    // start, so resolving the actual account record here (instead of in
    // AccountAuthController) keeps that logic in one place alongside the
    // OAuth exchange that produces the email in the first place.
    //
    // IsNewAccount is what lets GoogleAuthController/OAuthLoginFinisher
    // send a welcome email only the very first time this Google identity
    // is ever seen, never again on a later login - see CreateUserAsync
    // below vs. the LinkProviderAsync branch, the same new-vs-existing
    // distinction the DTOs/comments elsewhere already describe but that
    // wasn't previously surfaced past this method's return type.
    public async Task<(PortalUserAccount User, bool IsNewAccount)> ExchangeCodeForUserAsync(string code)
    {
        var settings = _oauthOptions.CurrentValue;

        var tokenClient = _httpClientFactory.CreateClient();

        var tokenResponse = await tokenClient.PostAsync(
            "https://oauth2.googleapis.com/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = settings.ClientId,
                ["client_secret"] = settings.ClientSecret,
                ["code"] = code,
                ["redirect_uri"] = settings.CallbackUrl,
                ["grant_type"] = "authorization_code"
            }));

        tokenResponse.EnsureSuccessStatusCode();

        var tokenJson = JObject.Parse(await tokenResponse.Content.ReadAsStringAsync());
        var accessToken = tokenJson["access_token"]?.ToString();

        if (string.IsNullOrWhiteSpace(accessToken))
            throw new InvalidOperationException("Google did not return an access token.");

        var userClient = _httpClientFactory.CreateClient();
        userClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {accessToken}");

        var userResponse = await userClient.GetAsync("https://openidconnect.googleapis.com/v1/userinfo");
        userResponse.EnsureSuccessStatusCode();

        var userJson = JObject.Parse(await userResponse.Content.ReadAsStringAsync());

        var sub = userJson["sub"]?.ToString();
        var email = userJson["email"]?.ToString();
        var emailVerified = userJson["email_verified"]?.Value<bool>() ?? false;
        var name = userJson["name"]?.ToString();

        if (string.IsNullOrWhiteSpace(sub))
            throw new InvalidOperationException("Google did not return an account identifier.");

        if (string.IsNullOrWhiteSpace(email) || !emailVerified)
            throw new UnauthorizedAccessException("Your Google account needs a verified email address to sign in here.");

        var normalizedEmail = email.Trim().ToLowerInvariant();
        var googleId = "google:" + sub;

        // Same "email is the unique key across all 3 providers" rule as
        // GitHub OAuth and password login - an existing account (password
        // or GitHub) that shares this email gets Google linked to it
        // rather than a second, duplicate account being created.
        var existing = await _settings.FindUserByEmailAsync(normalizedEmail);

        if (existing != null)
        {
            await _settings.LinkProviderAsync(existing.Id, gitHubLogin: null, googleSub: sub);
            return (existing, false);
        }

        var created = await _settings.CreateUserAsync(googleId, normalizedEmail, plaintextPassword: null, provider: "google", displayName: name, mustSetUpMfa: true);
        return (created, true);
    }
}

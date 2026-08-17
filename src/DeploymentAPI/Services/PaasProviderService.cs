using DeploymentAPI.DTOs;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Live Render/Cloudflare/Netlify/Vercel lookups for the Hosting Providers
// page — always against whatever token the current visitor typed into
// their own session (see UserPaasCredentials in SettingsService), never a
// portal-wide credential. Every call is wrapped so a bad/expired token, a
// wrong Cloudflare Account ID, or the provider simply hiccuping comes back
// as Found=false + a message instead of a 500 - same "never break the
// caller" contract CloudStatusService already uses for AWS/Azure
// (GetAzureWebAppStatusAsync's inline IsSuccessStatusCode checks are the
// direct template followed here, rather than a thrown/caught exception
// type, since none of these four providers have an SDK exception type the
// way AWS does).
public class PaasProviderService
{
    private readonly IHttpClientFactory _httpClientFactory;

    public PaasProviderService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public async Task<PaasProviderStatusDto> GetStatusAsync(string provider, UserPaasCredentials credentials)
    {
        var result = new PaasProviderStatusDto { Provider = provider, Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            return provider switch
            {
                "render" => await GetRenderStatusAsync(credentials, result),
                "cloudflare" => await GetCloudflareStatusAsync(credentials, result),
                "netlify" => await GetNetlifyStatusAsync(credentials, result),
                "vercel" => await GetVercelStatusAsync(credentials, result),
                _ => result
            };
        }
        catch (Exception ex)
        {
            // Same "log the real exception server-side, never leak it to
            // the caller" posture as CloudErrorSanitizer.Describe.
            Console.Error.WriteLine($"[{provider}:status] {ex}");
            result.Error = $"Unable to reach {Label(provider)} right now.";
            return result;
        }
    }

    private static string Label(string provider) => provider switch
    {
        "render" => "Render",
        "cloudflare" => "Cloudflare",
        "netlify" => "Netlify",
        "vercel" => "Vercel",
        _ => provider
    };

    private HttpClient CreateClient(string token)
    {
        var client = _httpClientFactory.CreateClient("PaasProviders");
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("DeploymentPortal");
        return client;
    }

    private static string FriendlyStatus(System.Net.HttpStatusCode status, string provider) => status switch
    {
        System.Net.HttpStatusCode.Unauthorized => $"{provider} rejected this token — it may be invalid or revoked.",
        System.Net.HttpStatusCode.Forbidden => $"{provider} denied this request — the token may be missing a required scope/permission.",
        System.Net.HttpStatusCode.NotFound => $"{provider} couldn't find that account — double-check the Account ID.",
        System.Net.HttpStatusCode.TooManyRequests => $"{provider} is rate-limiting these requests right now — try again shortly.",
        _ => $"Unable to reach {provider} ({(int)status})."
    };

    //===========================================================
    // Render — api.render.com/v1, Bearer <API key>
    //===========================================================
    private async Task<PaasProviderStatusDto> GetRenderStatusAsync(UserPaasCredentials credentials, PaasProviderStatusDto result)
    {
        var client = CreateClient(credentials.Token!);

        var ownersResponse = await client.GetAsync("https://api.render.com/v1/owners");

        if (!ownersResponse.IsSuccessStatusCode)
        {
            result.Error = FriendlyStatus(ownersResponse.StatusCode, "Render");
            return result;
        }

        var owners = JArray.Parse(await ownersResponse.Content.ReadAsStringAsync());
        var firstOwner = owners.FirstOrDefault()?["owner"];
        result.AccountLabel = firstOwner?["name"]?.ToString() ?? firstOwner?["email"]?.ToString();

        var servicesResponse = await client.GetAsync("https://api.render.com/v1/services?limit=100");

        if (!servicesResponse.IsSuccessStatusCode)
        {
            result.Error = FriendlyStatus(servicesResponse.StatusCode, "Render");
            return result;
        }

        var services = JArray.Parse(await servicesResponse.Content.ReadAsStringAsync());

        result.Services = services.Select(entry =>
        {
            var svc = entry["service"];
            var suspended = svc?["suspended"]?.ToString();

            return new PaasServiceItemDto
            {
                Name = svc?["name"]?.ToString() ?? string.Empty,
                Type = svc?["type"]?.ToString(),
                Status = suspended == "suspended" ? "suspended" : "live",
                Url = svc?["serviceDetails"]?["url"]?.ToString(),
                UpdatedAt = DateTime.TryParse(svc?["updatedAt"]?.ToString(), out var updated) ? updated : null
            };
        }).ToList();

        result.Found = true;
        return result;
    }

    //===========================================================
    // Cloudflare — api.cloudflare.com/client/v4, Bearer <API Token>
    // Needs an Account ID (2nd credential field) since Pages/Workers are
    // namespaced under /accounts/{account_id}/.
    //===========================================================
    private async Task<PaasProviderStatusDto> GetCloudflareStatusAsync(UserPaasCredentials credentials, PaasProviderStatusDto result)
    {
        if (string.IsNullOrWhiteSpace(credentials.AccountId))
        {
            result.Error = "An Account ID is required for Cloudflare.";
            return result;
        }

        var client = CreateClient(credentials.Token!);
        var accountId = Uri.EscapeDataString(credentials.AccountId);

        var verifyResponse = await client.GetAsync("https://api.cloudflare.com/client/v4/user/tokens/verify");

        if (!verifyResponse.IsSuccessStatusCode)
        {
            result.Error = FriendlyStatus(verifyResponse.StatusCode, "Cloudflare");
            return result;
        }

        var accountResponse = await client.GetAsync($"https://api.cloudflare.com/client/v4/accounts/{accountId}");

        if (!accountResponse.IsSuccessStatusCode)
        {
            result.Error = FriendlyStatus(accountResponse.StatusCode, "Cloudflare");
            return result;
        }

        var account = JObject.Parse(await accountResponse.Content.ReadAsStringAsync());
        result.AccountLabel = account["result"]?["name"]?.ToString();

        var items = new List<PaasServiceItemDto>();

        var pagesResponse = await client.GetAsync($"https://api.cloudflare.com/client/v4/accounts/{accountId}/pages/projects");

        if (pagesResponse.IsSuccessStatusCode)
        {
            var pages = JObject.Parse(await pagesResponse.Content.ReadAsStringAsync())["result"] as JArray ?? new JArray();

            items.AddRange(pages.Select(p =>
            {
                var deployment = p["latest_deployment"];
                var domains = p["domains"] as JArray;
                var subdomain = p["subdomain"]?.ToString();

                return new PaasServiceItemDto
                {
                    Name = p["name"]?.ToString() ?? string.Empty,
                    Type = "pages_project",
                    Status = deployment?["status"]?.ToString() ?? "no deployments",
                    Url = domains?.FirstOrDefault()?.ToString() ?? (subdomain != null ? $"{subdomain}.pages.dev" : null),
                    UpdatedAt = DateTime.TryParse(deployment?["modified_on"]?.ToString(), out var updated) ? updated : null
                };
            }));
        }

        var workersResponse = await client.GetAsync($"https://api.cloudflare.com/client/v4/accounts/{accountId}/workers/scripts");

        if (workersResponse.IsSuccessStatusCode)
        {
            var workers = JObject.Parse(await workersResponse.Content.ReadAsStringAsync())["result"] as JArray ?? new JArray();

            items.AddRange(workers.Select(w => new PaasServiceItemDto
            {
                Name = w["id"]?.ToString() ?? string.Empty,
                Type = "worker",
                Status = "deployed",
                Url = null,
                UpdatedAt = DateTime.TryParse(w["modified_on"]?.ToString(), out var updated) ? updated : null
            }));
        }

        result.Services = items;
        result.Found = true;
        return result;
    }

    //===========================================================
    // Netlify — api.netlify.com/api/v1, Bearer <Personal Access Token>
    //===========================================================
    private async Task<PaasProviderStatusDto> GetNetlifyStatusAsync(UserPaasCredentials credentials, PaasProviderStatusDto result)
    {
        var client = CreateClient(credentials.Token!);

        var userResponse = await client.GetAsync("https://api.netlify.com/api/v1/user");

        if (!userResponse.IsSuccessStatusCode)
        {
            result.Error = FriendlyStatus(userResponse.StatusCode, "Netlify");
            return result;
        }

        var user = JObject.Parse(await userResponse.Content.ReadAsStringAsync());
        result.AccountLabel = user["full_name"]?.ToString() ?? user["email"]?.ToString();

        var sitesResponse = await client.GetAsync("https://api.netlify.com/api/v1/sites?per_page=100");

        if (!sitesResponse.IsSuccessStatusCode)
        {
            result.Error = FriendlyStatus(sitesResponse.StatusCode, "Netlify");
            return result;
        }

        var sites = JArray.Parse(await sitesResponse.Content.ReadAsStringAsync());

        result.Services = sites.Select(site => new PaasServiceItemDto
        {
            Name = site["name"]?.ToString() ?? string.Empty,
            Type = "site",
            Status = site["published_deploy"]?["state"]?.ToString() ?? site["state"]?.ToString(),
            Url = site["ssl_url"]?.ToString() ?? site["url"]?.ToString(),
            UpdatedAt = DateTime.TryParse(site["updated_at"]?.ToString(), out var updated) ? updated : null
        }).ToList();

        result.Found = true;
        return result;
    }

    //===========================================================
    // Vercel — api.vercel.com, Bearer <Access Token>
    // Team-scoped tokens (which need a ?teamId= query param) are out of
    // scope for v1 - stated plainly rather than silently mishandled.
    //===========================================================
    private async Task<PaasProviderStatusDto> GetVercelStatusAsync(UserPaasCredentials credentials, PaasProviderStatusDto result)
    {
        var client = CreateClient(credentials.Token!);

        var userResponse = await client.GetAsync("https://api.vercel.com/v2/user");

        if (!userResponse.IsSuccessStatusCode)
        {
            result.Error = FriendlyStatus(userResponse.StatusCode, "Vercel");
            return result;
        }

        var userJson = JObject.Parse(await userResponse.Content.ReadAsStringAsync());
        var user = userJson["user"];
        result.AccountLabel = user?["name"]?.ToString() ?? user?["username"]?.ToString() ?? user?["email"]?.ToString();

        var projectsResponse = await client.GetAsync("https://api.vercel.com/v9/projects?limit=100");

        if (!projectsResponse.IsSuccessStatusCode)
        {
            result.Error = FriendlyStatus(projectsResponse.StatusCode, "Vercel");
            return result;
        }

        var projects = JObject.Parse(await projectsResponse.Content.ReadAsStringAsync())["projects"] as JArray ?? new JArray();

        result.Services = projects.Select(p =>
        {
            var production = p["targets"]?["production"];
            var alias = production?["alias"] as JArray;
            var latestDeployment = (p["latestDeployments"] as JArray)?.FirstOrDefault();

            // Vercel's updatedAt is epoch MILLISECONDS, not a date string
            // like every other provider here.
            var updatedMs = p["updatedAt"]?.Value<long?>();

            return new PaasServiceItemDto
            {
                Name = p["name"]?.ToString() ?? string.Empty,
                Type = "project",
                Status = production?["readyState"]?.ToString() ?? latestDeployment?["readyState"]?.ToString() ?? "no deployments",
                Url = alias?.FirstOrDefault()?.ToString() ?? production?["url"]?.ToString(),
                UpdatedAt = updatedMs.HasValue ? DateTimeOffset.FromUnixTimeMilliseconds(updatedMs.Value).UtcDateTime : null
            };
        }).ToList();

        result.Found = true;
        return result;
    }
}

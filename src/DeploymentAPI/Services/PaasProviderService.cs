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

    // Usage/load metrics for ONE already-identified service, used by
    // EnvironmentsController.GetCloudStatus once it has matched an
    // Environment's saved target against this session's connected
    // account. Only Render has a real per-resource "load" API among these
    // four - Cloudflare's equivalent needs its GraphQL Analytics API
    // (a materially different request shape than every plain GET call in
    // this file, and mostly Workers-oriented, not Pages-project-oriented,
    // so not worth the complexity jump for one metric on one provider
    // right now), and Netlify/Vercel are static/edge hosting with only
    // account-level build-minute/bandwidth usage, not a per-project "load"
    // concept at all. Cloudflare/Netlify/Vercel deliberately return an
    // empty series list here - not a gap, a scope decision.
    // range (optional): how far back to pull points - defaults to the last
    // hour, same as this call always did before the Hosting Observability
    // dashboard's 15m/1h/6h/24h/7d range selector needed to vary it (see
    // HostingObservabilityController). Optional/trailing so
    // PaasController.GetServiceMetrics's existing call site keeps compiling
    // unchanged.
    public async Task<PaasServiceMetricsDto> GetServiceMetricsAsync(string provider, UserPaasCredentials credentials, string serviceId, TimeSpan? range = null)
    {
        var result = new PaasServiceMetricsDto();

        if (!credentials.IsConfigured || string.IsNullOrWhiteSpace(serviceId))
            return result;

        try
        {
            return provider switch
            {
                "render" => await GetRenderMetricsAsync(credentials, serviceId, range, result),
                _ => result
            };
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[{provider}:metrics] {ex}");
            result.Error = $"Unable to load metrics from {Label(provider)} right now.";
            return result;
        }
    }

    // Render's Metrics API - GET /v1/metrics/{cpu|memory}?resource={id}.
    // Exact response field names here are the least-certain part of this
    // integration (this endpoint is far less central/documented than
    // Render's core Services API) - each of the two calls is independently
    // wrapped so a wrong field name or an unsupported plan tier degrades
    // that ONE series to "not shown" rather than failing the whole thing.
    // Longer windows (6h/24h/7d) are similarly unverified against a real
    // account - the same per-series try/catch degrades a rejected/empty
    // response the same way rather than crashing.
    private async Task<PaasServiceMetricsDto> GetRenderMetricsAsync(UserPaasCredentials credentials, string serviceId, TimeSpan? range, PaasServiceMetricsDto result)
    {
        var client = CreateClient(credentials.Token!);
        var since = Uri.EscapeDataString(DateTime.UtcNow.Subtract(range ?? TimeSpan.FromHours(1)).ToString("o"));
        var resource = Uri.EscapeDataString(serviceId);

        await TryAddRenderSeriesAsync(client, "cpu", "%", resource, since, result);
        await TryAddRenderSeriesAsync(client, "memory", "bytes", resource, since, result);

        result.Found = result.Series.Count > 0;

        if (!result.Found)
            result.Error ??= "No metrics available for this service right now.";

        return result;
    }

    private static async Task TryAddRenderSeriesAsync(HttpClient client, string metric, string unit, string resource, string since, PaasServiceMetricsDto result)
    {
        try
        {
            var response = await client.GetAsync($"https://api.render.com/v1/metrics/{metric}?resource={resource}&startTime={since}");

            if (!response.IsSuccessStatusCode)
                return;

            var body = await response.Content.ReadAsStringAsync();
            var points = JArray.Parse(body);

            var series = new PaasMetricSeriesDto { Name = metric, Unit = unit };

            foreach (var point in points)
            {
                var timestamp = point["timestamp"]?.ToString() ?? point["time"]?.ToString();
                var value = point["value"];

                if (timestamp != null && value != null && DateTime.TryParse(timestamp, out var parsedTime))
                    series.Points.Add(new PaasMetricPointDto { Timestamp = parsedTime, Value = value.Value<double>() });
            }

            if (series.Points.Count > 0)
                result.Series.Add(series);
        }
        catch (Exception ex)
        {
            // One series failing (unsupported plan tier, an unexpected
            // response shape) shouldn't blank the other - see this
            // method's own caller.
            Console.Error.WriteLine($"[render:metrics:{metric}] {ex}");
        }
    }

    // Render Postgres instances - see GetRenderStatusAsync's own note: that
    // call only ever lists /v1/services (web/worker/static-site), which
    // does NOT include Postgres databases - Render's Postgres offering is a
    // separate top-level resource with its own API. Used only by the
    // Hosting Observability Database tab's "connect via Render" flow (see
    // HostingObservabilityController), never the generic GetStatusAsync
    // contract, since a Postgres instance isn't a deployable "service" the
    // same way a web service is.
    public async Task<List<RenderDatabaseItemDto>> GetRenderDatabasesAsync(UserPaasCredentials credentials)
    {
        var result = new List<RenderDatabaseItemDto>();

        if (!credentials.IsConfigured) return result;

        try
        {
            var client = CreateClient(credentials.Token!);
            var response = await client.GetAsync("https://api.render.com/v1/postgres?limit=100");

            if (!response.IsSuccessStatusCode) return result;

            var items = JArray.Parse(await response.Content.ReadAsStringAsync());

            foreach (var entry in items)
            {
                // Same "{cursor, postgres:{...}}" wrapper shape as
                // GetRenderStatusAsync's /v1/services response - fall back
                // to the raw entry if Render ever returns it unwrapped.
                var pg = entry["postgres"] ?? entry;

                result.Add(new RenderDatabaseItemDto
                {
                    Id = pg["id"]?.ToString(),
                    Name = pg["name"]?.ToString(),
                    Status = pg["status"]?.ToString(),
                    Region = pg["region"]?.ToString(),
                    Plan = pg["plan"]?.ToString()
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[render:databases] {ex}");
        }

        return result;
    }

    // The actual connection string for one Render Postgres instance -
    // fetched and used SERVER-SIDE ONLY. HostingObservabilityController's
    // connect action saves this straight into the portal's database
    // connection settings and never returns it to the browser at all -
    // stronger than the manual paste path, which at least has to cross an
    // HTTPS request once when saving.
    public async Task<string?> GetRenderDatabaseConnectionStringAsync(UserPaasCredentials credentials, string databaseId)
    {
        if (!credentials.IsConfigured || string.IsNullOrWhiteSpace(databaseId)) return null;

        try
        {
            var client = CreateClient(credentials.Token!);
            var response = await client.GetAsync($"https://api.render.com/v1/postgres/{Uri.EscapeDataString(databaseId)}/connection-info");

            if (!response.IsSuccessStatusCode) return null;

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());

            return json["externalConnectionString"]?.ToString() ?? json["internalConnectionString"]?.ToString();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[render:database-connection:{databaseId}] {ex}");
            return null;
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
        var items = new List<PaasServiceItemDto>();

        foreach (var entry in services)
        {
            var svc = entry["service"];
            var suspended = svc?["suspended"]?.ToString();
            var id = svc?["id"]?.ToString();

            var item = new PaasServiceItemDto
            {
                Name = svc?["name"]?.ToString() ?? string.Empty,
                // The real "srv-..." id - GetServiceMetricsAsync's Render
                // call needs this, not the display name.
                Id = id,
                Type = svc?["type"]?.ToString(),
                Status = suspended == "suspended" ? "suspended" : "live",
                Url = svc?["serviceDetails"]?["url"]?.ToString(),
                UpdatedAt = DateTime.TryParse(svc?["updatedAt"]?.ToString(), out var updated) ? updated : null,
                Plan = svc?["serviceDetails"]?["plan"]?.ToString() ?? svc?["plan"]?.ToString()
            };

            if (!string.IsNullOrWhiteSpace(id))
                await TryAddRenderCommitAsync(client, id, item);

            items.Add(item);
        }

        result.Services = items;
        result.Found = true;
        return result;
    }

    // Best-effort, one extra call per service against Render's own Deploys
    // API for its latest commit - a separate endpoint from the services
    // list above, since Render's /v1/services response doesn't carry
    // commit info itself. A failure here (rate limit, a service with no
    // deploys yet) just means no commit shown for that one service, never
    // breaks the rest of the listing.
    private static async Task TryAddRenderCommitAsync(HttpClient client, string serviceId, PaasServiceItemDto item)
    {
        try
        {
            var response = await client.GetAsync($"https://api.render.com/v1/services/{Uri.EscapeDataString(serviceId)}/deploys?limit=1");

            if (!response.IsSuccessStatusCode)
                return;

            var deploys = JArray.Parse(await response.Content.ReadAsStringAsync());
            var commit = deploys.FirstOrDefault()?["deploy"]?["commit"];

            item.CommitSha = commit?["id"]?.ToString();
            item.CommitMessage = commit?["message"]?.ToString();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[render:commit:{serviceId}] {ex}");
        }
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

        // Best-effort only: GET /accounts/{id} needs the "Account Settings"
        // permission specifically, which a token minimally scoped to just
        // Pages Read + Workers Scripts Read (the least-privilege token this
        // feature actually needs - see PaasHosting's help text) won't have.
        // A 403 here only means no account name to show, never that the
        // listing calls below - which that same minimal token genuinely
        // CAN make - should be skipped too.
        var accountResponse = await client.GetAsync($"https://api.cloudflare.com/client/v4/accounts/{accountId}");

        if (accountResponse.IsSuccessStatusCode)
        {
            var account = JObject.Parse(await accountResponse.Content.ReadAsStringAsync());
            result.AccountLabel = account["result"]?["name"]?.ToString();
        }

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
                var commitMeta = deployment?["deployment_trigger"]?["metadata"];

                return new PaasServiceItemDto
                {
                    Name = p["name"]?.ToString() ?? string.Empty,
                    Type = "pages_project",
                    Status = deployment?["status"]?.ToString() ?? "no deployments",
                    Url = domains?.FirstOrDefault()?.ToString() ?? (subdomain != null ? $"{subdomain}.pages.dev" : null),
                    UpdatedAt = DateTime.TryParse(deployment?["modified_on"]?.ToString(), out var updated) ? updated : null,
                    CommitSha = commitMeta?["commit_hash"]?.ToString(),
                    CommitMessage = commitMeta?["commit_message"]?.ToString()
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
            UpdatedAt = DateTime.TryParse(site["updated_at"]?.ToString(), out var updated) ? updated : null,
            CommitSha = site["published_deploy"]?["commit_ref"]?.ToString(),
            CommitMessage = site["published_deploy"]?["title"]?.ToString()
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

            var commitMeta = latestDeployment?["meta"];

            return new PaasServiceItemDto
            {
                Name = p["name"]?.ToString() ?? string.Empty,
                Type = "project",
                Status = production?["readyState"]?.ToString() ?? latestDeployment?["readyState"]?.ToString() ?? "no deployments",
                Url = alias?.FirstOrDefault()?.ToString() ?? production?["url"]?.ToString(),
                UpdatedAt = updatedMs.HasValue ? DateTimeOffset.FromUnixTimeMilliseconds(updatedMs.Value).UtcDateTime : null,
                CommitSha = commitMeta?["githubCommitSha"]?.ToString(),
                CommitMessage = commitMeta?["githubCommitMessage"]?.ToString()
            };
        }).ToList();

        result.Found = true;
        return result;
    }
}

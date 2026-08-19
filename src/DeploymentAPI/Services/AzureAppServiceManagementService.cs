using System.Net.Http.Headers;
using System.Text;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Phase B of the PaaS/Microservices console - Azure App Service +
// Deployment Slots + Swap. Own file, same "PaaS provider gets its own
// service class" precedent as ElasticBeanstalkService.cs/
// ContainerServiceManagementService.cs. Raw ARM HttpClient calls, same
// convention every other Azure integration in this app already uses -
// no Azure SDK dependency anywhere in this project.
public class AzureAppServiceManagementService
{
    private static readonly HttpClient ArmHttpClient = new();

    private const string ApiVersion = "2023-12-01";

    private static async Task<(bool ok, string? token, string? error)> GetAzureTokenAsync(UserAzureCredentials credentials)
    {
        if (!credentials.IsConfigured)
            return (false, null, "Azure is not configured.");

        if (string.IsNullOrWhiteSpace(credentials.SubscriptionId))
            return (false, null, "No Subscription ID configured — set one in Settings → Credentials → Azure.");

        try
        {
            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);
            return token == null ? (false, null, "Azure sign-in failed — check the tenant, client ID, and client secret.") : (true, token, null);
        }
        catch (Exception ex)
        {
            return (false, null, CloudErrorSanitizer.Describe(ex, "Azure", "sign-in"));
        }
    }

    private static AzureAppServiceDto MapApp(JToken site)
    {
        var props = site["properties"];
        var resourceId = site["id"]?.ToString() ?? string.Empty;

        return new AzureAppServiceDto
        {
            Name = site["name"]?.ToString() ?? string.Empty,
            ResourceGroup = CloudStatusService.ExtractResourceGroup(resourceId) ?? string.Empty,
            Location = site["location"]?.ToString() ?? string.Empty,
            State = props?["state"]?.ToString(),
            DefaultHostName = props?["defaultHostName"]?.ToString(),
            Kind = site["kind"]?.ToString(),
            ServerFarmId = props?["serverFarmId"]?.ToString()
        };
    }

    public async Task<AzureAppServiceListDto> GetAppServicesAsync(UserAzureCredentials credentials)
    {
        var result = new AzureAppServiceListDto { Configured = credentials.IsConfigured };
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            // Subscription-wide listing (same "list-by-resource-type"
            // pattern already used for Azure VMs/Container Apps) - returns
            // production sites only, deployment slots are child resources
            // fetched separately per app on the detail page (avoiding an
            // N+1 slot-count fetch for every app on this list).
            var url = $"https://management.azure.com/subscriptions/{Uri.EscapeDataString(credentials.SubscriptionId!)}" +
                      $"/providers/Microsoft.Web/sites?api-version={ApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = await CloudStatusService.DescribeArmErrorAsync(response);
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var sites = json["value"] as JArray ?? new JArray();

            // Web Apps for Containers/Functions/Logic Apps also live under
            // Microsoft.Web/sites - filtered to "app"/"app,linux" kinds
            // (plain App Service) so Function Apps don't show up here
            // mislabeled as App Service applications.
            result.Apps = sites
                .Where(s => (s["kind"]?.ToString() ?? "").StartsWith("app", StringComparison.OrdinalIgnoreCase)
                    && !(s["kind"]?.ToString() ?? "").Contains("functionapp", StringComparison.OrdinalIgnoreCase))
                .Select(MapApp)
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "App Service list");
        }

        return result;
    }

    public async Task<AzureAppServiceDetailDto> GetAppServiceDetailAsync(UserAzureCredentials credentials, string resourceGroup, string name)
    {
        var result = new AzureAppServiceDetailDto { Configured = credentials.IsConfigured };
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            var sub = Uri.EscapeDataString(credentials.SubscriptionId!);
            var rg = Uri.EscapeDataString(resourceGroup);
            var baseUrl = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{Uri.EscapeDataString(name)}";

            using var siteRequest = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}?api-version={ApiVersion}");
            siteRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var siteResponse = await ArmHttpClient.SendAsync(siteRequest);

            if (!siteResponse.IsSuccessStatusCode)
            {
                result.Error = await CloudStatusService.DescribeArmErrorAsync(siteResponse);
                return result;
            }

            var siteJson = JObject.Parse(await siteResponse.Content.ReadAsStringAsync());
            result.App = MapApp(siteJson);

            using var configRequest = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/config/web?api-version={ApiVersion}");
            configRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var configResponse = await ArmHttpClient.SendAsync(configRequest);

            if (configResponse.IsSuccessStatusCode)
            {
                var configJson = JObject.Parse(await configResponse.Content.ReadAsStringAsync());
                var configProps = configJson["properties"];

                result.Runtime = configProps?["linuxFxVersion"]?.ToString();

                if (string.IsNullOrWhiteSpace(result.Runtime))
                    result.Runtime = configProps?["netFrameworkVersion"]?.ToString();

                result.AlwaysOn = configProps?["alwaysOn"]?.Value<bool?>();
            }

            using var slotsRequest = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/slots?api-version={ApiVersion}");
            slotsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var slotsResponse = await ArmHttpClient.SendAsync(slotsRequest);

            var slots = new List<AzureAppServiceSlotDto>
            {
                new()
                {
                    Name = "production",
                    State = result.App.State,
                    DefaultHostName = result.App.DefaultHostName,
                    IsProductionSlot = true
                }
            };

            if (slotsResponse.IsSuccessStatusCode)
            {
                var slotsJson = JObject.Parse(await slotsResponse.Content.ReadAsStringAsync());
                var slotSites = slotsJson["value"] as JArray ?? new JArray();

                slots.AddRange(slotSites.Select(s =>
                {
                    var fullName = s["name"]?.ToString() ?? string.Empty;
                    var slotName = fullName.Contains('/') ? fullName[(fullName.LastIndexOf('/') + 1)..] : fullName;

                    return new AzureAppServiceSlotDto
                    {
                        Name = slotName,
                        State = s["properties"]?["state"]?.ToString(),
                        DefaultHostName = s["properties"]?["defaultHostName"]?.ToString(),
                        IsProductionSlot = false
                    };
                }));
            }

            result.Slots = slots;
            result.App.SlotCount = slots.Count(s => !s.IsProductionSlot);
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "App Service detail");
        }

        return result;
    }

    private static string SlotSegment(string? slot) =>
        string.IsNullOrWhiteSpace(slot) || slot.Equals("production", StringComparison.OrdinalIgnoreCase) ? "" : $"/slots/{Uri.EscapeDataString(slot)}";

    private async Task<CloudServiceActionResultDto> RunLifecycleActionAsync(UserAzureCredentials credentials, string resourceGroup, string name, string? slot, string action, string verbFriendly)
    {
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        try
        {
            var sub = Uri.EscapeDataString(credentials.SubscriptionId!);
            var rg = Uri.EscapeDataString(resourceGroup);
            var url = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{Uri.EscapeDataString(name)}{SlotSegment(slot)}/{action}?api-version={ApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(response) };

            return new CloudServiceActionResultDto { Success = true, Message = $"{verbFriendly} requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", $"App Service {verbFriendly.ToLowerInvariant()}") };
        }
    }

    public Task<CloudServiceActionResultDto> StartAsync(UserAzureCredentials credentials, string resourceGroup, string name, string? slot) =>
        RunLifecycleActionAsync(credentials, resourceGroup, name, slot, "start", "Start");

    public Task<CloudServiceActionResultDto> StopAsync(UserAzureCredentials credentials, string resourceGroup, string name, string? slot) =>
        RunLifecycleActionAsync(credentials, resourceGroup, name, slot, "stop", "Stop");

    public Task<CloudServiceActionResultDto> RestartAsync(UserAzureCredentials credentials, string resourceGroup, string name, string? slot) =>
        RunLifecycleActionAsync(credentials, resourceGroup, name, slot, "restart", "Restart");

    // Azure's real swap operations: swapping INTO production is
    // documented as POST .../sites/{name}/slotsswap with body
    // {targetSlot: "<slot being swapped in>"}; swapping two non-
    // production slots is POST .../sites/{name}/slots/{source}/slotsswap
    // with body {targetSlot: "<other slot>"}. The production-target case
    // (section 12/13's own worked example - Staging -> Production) is
    // the well-documented, high-confidence path; the slot-to-slot case
    // is this round's least-certain piece, flagged plainly.
    public async Task<CloudServiceActionResultDto> SwapSlotAsync(UserAzureCredentials credentials, string resourceGroup, string appName, string sourceSlot, string targetSlot)
    {
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        try
        {
            var sub = Uri.EscapeDataString(credentials.SubscriptionId!);
            var rg = Uri.EscapeDataString(resourceGroup);
            var baseUrl = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{Uri.EscapeDataString(appName)}";

            var isTargetProduction = targetSlot.Equals("production", StringComparison.OrdinalIgnoreCase);

            var url = isTargetProduction
                ? $"{baseUrl}/slotsswap?api-version={ApiVersion}"
                : $"{baseUrl}/slots/{Uri.EscapeDataString(sourceSlot)}/slotsswap?api-version={ApiVersion}";

            var body = new JObject { ["targetSlot"] = isTargetProduction ? sourceSlot : targetSlot };

            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(body.ToString(), Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(response) };

            return new CloudServiceActionResultDto { Success = true, Message = $"Swapping \"{sourceSlot}\" with \"{targetSlot}\" — this takes a moment to complete." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", "slot swap") };
        }
    }

    // Section 13's bulk swap - each item swapped independently, its own
    // success/error recorded, never collapsed into one pass/fail.
    public async Task<AzureBulkActionResultDto> BulkSwapAsync(UserAzureCredentials credentials, List<AzureBulkSwapItemDto> items)
    {
        var result = new AzureBulkActionResultDto();

        foreach (var item in items)
        {
            var swapResult = await SwapSlotAsync(credentials, item.ResourceGroup, item.AppName, item.SourceSlot, item.TargetSlot);

            result.Results.Add(new AzureBulkActionItemResultDto
            {
                AppName = item.AppName,
                Slot = $"{item.SourceSlot} → {item.TargetSlot}",
                Success = swapResult.Success,
                Error = swapResult.Error
            });
        }

        return result;
    }

    public async Task<AzureAppServiceEnvVarListDto> GetEnvVarsAsync(UserAzureCredentials credentials, string resourceGroup, string name, string? slot)
    {
        var result = new AzureAppServiceEnvVarListDto { Configured = credentials.IsConfigured };
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            var sub = Uri.EscapeDataString(credentials.SubscriptionId!);
            var rg = Uri.EscapeDataString(resourceGroup);
            var url = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{Uri.EscapeDataString(name)}{SlotSegment(slot)}/config/appsettings/list?api-version={ApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = await CloudStatusService.DescribeArmErrorAsync(response);
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var properties = json["properties"] as JObject ?? new JObject();

            // Azure's own appsettings API returns plaintext values for
            // anything not stored as a Key Vault reference - this app
            // applies its own redaction layer on top regardless (section
            // 16's "never return secret values unnecessarily"), same
            // SecretRedaction helper Elastic Beanstalk already uses.
            result.Variables = properties.Properties()
                .Select(p => new AzureAppServiceEnvVarDto
                {
                    Name = p.Name,
                    IsSecret = SecretRedaction.LooksLikeSecretKey(p.Name),
                    Value = SecretRedaction.LooksLikeSecretKey(p.Name) ? null : p.Value?.ToString()
                })
                .OrderBy(v => v.Name)
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "App Service settings list");
        }

        return result;
    }

    // Azure's appsettings PUT replaces the whole set - real read-modify-
    // write against the current settings, same shape as Elastic
    // Beanstalk's environment-variable update.
    public async Task<CloudServiceActionResultDto> UpdateEnvVarAsync(UserAzureCredentials credentials, string resourceGroup, string name, string? slot, string variableName, string? value)
    {
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        try
        {
            var sub = Uri.EscapeDataString(credentials.SubscriptionId!);
            var rg = Uri.EscapeDataString(resourceGroup);
            var slotSegment = SlotSegment(slot);
            var baseUrl = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{Uri.EscapeDataString(name)}{slotSegment}";

            using var listRequest = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/config/appsettings/list?api-version={ApiVersion}");
            listRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var listResponse = await ArmHttpClient.SendAsync(listRequest);

            if (!listResponse.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(listResponse) };

            var listJson = JObject.Parse(await listResponse.Content.ReadAsStringAsync());
            var existing = (listJson["properties"] as JObject)?.Properties().ToDictionary(p => p.Name, p => p.Value?.ToString() ?? "")
                ?? new Dictionary<string, string>();

            if (value == null)
                existing.Remove(variableName);
            else
                existing[variableName] = value;

            var body = new JObject { ["properties"] = JObject.FromObject(existing) };

            using var putRequest = new HttpRequestMessage(HttpMethod.Put, $"{baseUrl}/config/appsettings?api-version={ApiVersion}")
            {
                Content = new StringContent(body.ToString(), Encoding.UTF8, "application/json")
            };
            putRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var putResponse = await ArmHttpClient.SendAsync(putRequest);

            if (!putResponse.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(putResponse) };

            return new CloudServiceActionResultDto { Success = true, Message = value == null ? "Setting removed." : "Setting saved." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", "App Service setting update") };
        }
    }

    // Scales the whole App Service PLAN this app runs on (Azure's real
    // model - instance count is a plan property, not a per-app one) -
    // every other app sharing that plan is affected too, surfaced
    // honestly in the frontend rather than implying per-app isolation
    // that doesn't exist.
    public async Task<CloudServiceActionResultDto> ScalePlanAsync(UserAzureCredentials credentials, string serverFarmId, int capacity)
    {
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        if (string.IsNullOrWhiteSpace(serverFarmId))
            return new CloudServiceActionResultDto { Success = false, Error = "This app has no App Service Plan to scale." };

        try
        {
            var url = $"https://management.azure.com{serverFarmId}?api-version={ApiVersion}";
            var body = new JObject { ["sku"] = new JObject { ["capacity"] = capacity } };

            using var request = new HttpRequestMessage(new HttpMethod("PATCH"), url)
            {
                Content = new StringContent(body.ToString(), Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(response) };

            return new CloudServiceActionResultDto { Success = true, Message = "Scale requested — this affects every app on the same App Service Plan." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", "App Service Plan scale") };
        }
    }

    public async Task<CloudServiceActionResultDto> DeleteAppAsync(UserAzureCredentials credentials, string resourceGroup, string name)
    {
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        try
        {
            var sub = Uri.EscapeDataString(credentials.SubscriptionId!);
            var rg = Uri.EscapeDataString(resourceGroup);
            var url = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{Uri.EscapeDataString(name)}?api-version={ApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Delete, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(response) };

            return new CloudServiceActionResultDto { Success = true, Message = "Delete requested — this removes every deployment slot too." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", "App Service deletion") };
        }
    }

    public async Task<CloudServiceActionResultDto> DeleteSlotAsync(UserAzureCredentials credentials, string resourceGroup, string name, string slot)
    {
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        try
        {
            var sub = Uri.EscapeDataString(credentials.SubscriptionId!);
            var rg = Uri.EscapeDataString(resourceGroup);
            var url = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{Uri.EscapeDataString(name)}/slots/{Uri.EscapeDataString(slot)}?api-version={ApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Delete, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(response) };

            return new CloudServiceActionResultDto { Success = true, Message = "Delete requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", "slot deletion") };
        }
    }

    public async Task<ResourceMetricsDto> GetMetricsAsync(UserAzureCredentials credentials, string resourceGroup, string name, string? slot, int rangeMinutes)
    {
        var result = new ResourceMetricsDto { Configured = credentials.IsConfigured };
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            var sub = Uri.EscapeDataString(credentials.SubscriptionId!);
            var rg = Uri.EscapeDataString(resourceGroup);
            var resourceId = $"/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{Uri.EscapeDataString(name)}{SlotSegment(slot)}";

            var end = DateTimeOffset.UtcNow;
            var start = end.AddMinutes(-Math.Max(15, rangeMinutes));
            var timespan = $"{start:O}/{end:O}";
            var interval = rangeMinutes <= 60 ? "PT1M" : rangeMinutes <= 360 ? "PT5M" : rangeMinutes <= 1440 ? "PT15M" : "PT1H";

            var url = $"https://management.azure.com{resourceId}/providers/microsoft.insights/metrics" +
                      "?api-version=2019-07-01&metricnames=CpuPercentage,MemoryPercentage,Requests" +
                      $"&timespan={Uri.EscapeDataString(timespan)}&interval={interval}&aggregation=Average";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = await CloudStatusService.DescribeArmErrorAsync(response);
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var values = json["value"] as JArray ?? new JArray();

            foreach (var metric in values)
            {
                var metricName = metric["name"]?["value"]?.ToString() ?? "metric";
                var unit = metric["unit"]?.ToString() ?? "";
                var timeseries = (metric["timeseries"] as JArray)?.FirstOrDefault();
                var data = timeseries?["data"] as JArray ?? new JArray();

                result.Series.Add(new MetricSeriesDto
                {
                    Label = metricName,
                    Unit = unit,
                    Points = data
                        .Where(d => d["average"] != null)
                        .Select(d => new MetricPointDto
                        {
                            Timestamp = DateTime.Parse(d["timeStamp"]!.ToString()),
                            Value = d["average"]!.Value<double>()
                        })
                        .ToList()
                });
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "App Service metrics");
        }

        return result;
    }
}

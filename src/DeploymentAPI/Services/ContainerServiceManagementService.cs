using System.Net.Http.Headers;
using System.Text;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// Phase 3 of the multi-cloud infrastructure console - Azure Container
// Apps and GCP Cloud Run. Kept as its own service (not folded into the
// already-large CloudServiceManagementService) the same way
// ContainerRegistryService is already split out from it - "container
// services" is its own bounded concern, distinct from VM/EC2-style
// compute management. Reuses CloudStatusService.GetAzureAccessTokenAsync/
// DescribeArmErrorAsync and CloudServiceManagementService.
// GetGcpAccessTokenAsync unchanged - zero new auth code, same as every
// prior phase.
public class ContainerServiceManagementService
{
    private static readonly HttpClient ArmHttpClient = new();
    private static readonly HttpClient GcpHttpClient = new();

    private const string ContainerAppsApiVersion = "2024-03-01";
    private const string CloudRunApiVersion = "v2";

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

    private static async Task<(bool ok, string? token, string? error)> GetGcpTokenAsync(UserGcpCredentials credentials)
    {
        if (!credentials.IsConfigured)
            return (false, null, "GCP is not configured.");

        var token = await CloudServiceManagementService.GetGcpAccessTokenAsync(credentials.ServiceAccountKeyJson!);
        return token == null ? (false, null, "Unable to authenticate with GCP.") : (true, token, null);
    }

    // ================= Azure Container Apps =================

    private static AzureContainerAppDto MapContainerApp(JToken app)
    {
        var props = app["properties"];
        var scale = props?["template"]?["scale"];
        var containers = props?["template"]?["containers"] as JArray;
        var resourceId = app["id"]?.ToString() ?? string.Empty;

        return new AzureContainerAppDto
        {
            Name = app["name"]?.ToString() ?? string.Empty,
            ResourceGroup = CloudStatusService.ExtractResourceGroup(resourceId) ?? string.Empty,
            Location = app["location"]?.ToString() ?? string.Empty,
            EnvironmentId = props?["environmentId"]?.ToString() ?? props?["managedEnvironmentId"]?.ToString(),
            Image = containers?.FirstOrDefault()?["image"]?.ToString(),
            FqdnUrl = props?["configuration"]?["ingress"]?["fqdn"]?.ToString(),
            ProvisioningState = props?["provisioningState"]?.ToString(),
            RunningStatus = props?["runningStatus"]?.ToString(),
            MinReplicas = scale?["minReplicas"]?.Value<int?>() ?? 0,
            MaxReplicas = scale?["maxReplicas"]?.Value<int?>() ?? 0
        };
    }

    public async Task<AzureContainerAppListDto> GetAzureContainerAppsAsync(UserAzureCredentials credentials)
    {
        var result = new AzureContainerAppListDto { Configured = credentials.IsConfigured };
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
            var url = $"https://management.azure.com/subscriptions/{Uri.EscapeDataString(credentials.SubscriptionId!)}" +
                      $"/providers/Microsoft.App/containerApps?api-version={ContainerAppsApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = await CloudStatusService.DescribeArmErrorAsync(response);
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var apps = json["value"] as JArray ?? new JArray();

            result.Apps = apps.Select(MapContainerApp).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "Container Apps list");
        }

        return result;
    }

    public async Task<AzureContainerAppDetailDto> GetAzureContainerAppDetailAsync(UserAzureCredentials credentials, string resourceGroup, string name)
    {
        var result = new AzureContainerAppDetailDto { Configured = credentials.IsConfigured };
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
            var baseUrl = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.App/containerApps/{Uri.EscapeDataString(name)}";

            using var appRequest = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}?api-version={ContainerAppsApiVersion}");
            appRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var appResponse = await ArmHttpClient.SendAsync(appRequest);

            if (!appResponse.IsSuccessStatusCode)
            {
                result.Error = await CloudStatusService.DescribeArmErrorAsync(appResponse);
                return result;
            }

            var appJson = JObject.Parse(await appResponse.Content.ReadAsStringAsync());
            result.App = MapContainerApp(appJson);

            using var revRequest = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/revisions?api-version={ContainerAppsApiVersion}");
            revRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var revResponse = await ArmHttpClient.SendAsync(revRequest);

            if (revResponse.IsSuccessStatusCode)
            {
                var revJson = JObject.Parse(await revResponse.Content.ReadAsStringAsync());
                var revisions = revJson["value"] as JArray ?? new JArray();

                result.Revisions = revisions.Select(r =>
                {
                    var rProps = r["properties"];

                    return new AzureContainerAppRevisionDto
                    {
                        Name = r["name"]?.ToString() ?? string.Empty,
                        Active = rProps?["active"]?.Value<bool?>() ?? false,
                        Replicas = rProps?["replicas"]?.Value<int?>() ?? 0,
                        TrafficWeight = rProps?["trafficWeight"]?.Value<int?>() ?? 0,
                        CreatedTime = DateTime.TryParse(rProps?["createdTime"]?.ToString(), out var created) ? created : null,
                        ProvisioningState = rProps?["provisioningState"]?.ToString()
                    };
                })
                .OrderByDescending(r => r.CreatedTime)
                .ToList();
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "Container App detail");
        }

        return result;
    }

    public async Task<CloudServiceActionResultDto> ScaleAzureContainerAppAsync(UserAzureCredentials credentials, string resourceGroup, string name, int minReplicas, int maxReplicas)
    {
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        try
        {
            var sub = Uri.EscapeDataString(credentials.SubscriptionId!);
            var rg = Uri.EscapeDataString(resourceGroup);
            var url = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.App/containerApps/{Uri.EscapeDataString(name)}?api-version={ContainerAppsApiVersion}";

            var body = new JObject
            {
                ["properties"] = new JObject
                {
                    ["template"] = new JObject
                    {
                        ["scale"] = new JObject { ["minReplicas"] = minReplicas, ["maxReplicas"] = maxReplicas }
                    }
                }
            };

            using var request = new HttpRequestMessage(new HttpMethod("PATCH"), url)
            {
                Content = new StringContent(body.ToString(), Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(response) };

            return new CloudServiceActionResultDto { Success = true, Message = "Scale requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", "Container App scale") };
        }
    }

    private async Task<CloudServiceActionResultDto> RunContainerAppActionAsync(UserAzureCredentials credentials, string resourceGroup, string name, string action, string verbFriendly)
    {
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        try
        {
            var sub = Uri.EscapeDataString(credentials.SubscriptionId!);
            var rg = Uri.EscapeDataString(resourceGroup);
            var url = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.App/containerApps/{Uri.EscapeDataString(name)}/{action}?api-version={ContainerAppsApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(response) };

            return new CloudServiceActionResultDto { Success = true, Message = $"{verbFriendly} requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", $"Container App {verbFriendly.ToLowerInvariant()}") };
        }
    }

    public Task<CloudServiceActionResultDto> StartAzureContainerAppAsync(UserAzureCredentials credentials, string resourceGroup, string name) =>
        RunContainerAppActionAsync(credentials, resourceGroup, name, "start", "Start");

    public Task<CloudServiceActionResultDto> StopAzureContainerAppAsync(UserAzureCredentials credentials, string resourceGroup, string name) =>
        RunContainerAppActionAsync(credentials, resourceGroup, name, "stop", "Stop");

    public Task<CloudServiceActionResultDto> RestartAzureContainerAppRevisionAsync(UserAzureCredentials credentials, string resourceGroup, string name, string revisionName) =>
        RunContainerAppActionAsync(credentials, resourceGroup, name, $"revisions/{Uri.EscapeDataString(revisionName)}/restart", "Restart");

    public async Task<CloudServiceActionResultDto> DeleteAzureContainerAppAsync(UserAzureCredentials credentials, string resourceGroup, string name)
    {
        var (ok, token, error) = await GetAzureTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        try
        {
            var sub = Uri.EscapeDataString(credentials.SubscriptionId!);
            var rg = Uri.EscapeDataString(resourceGroup);
            var url = $"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.App/containerApps/{Uri.EscapeDataString(name)}?api-version={ContainerAppsApiVersion}";

            using var request = new HttpRequestMessage(HttpMethod.Delete, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await ArmHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = await CloudStatusService.DescribeArmErrorAsync(response) };

            return new CloudServiceActionResultDto { Success = true, Message = "Delete requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "Azure", "Container App deletion") };
        }
    }

    // "Requests"/"RestartCount" are Container Apps' own documented system
    // metrics - CPU/Memory percentages aren't exposed the same
    // straightforward way Azure VM's are, so this round doesn't guess at
    // a metric name for them rather than risk silently charting nothing.
    public async Task<ResourceMetricsDto> GetAzureContainerAppMetricsAsync(UserAzureCredentials credentials, string resourceGroup, string name, int rangeMinutes)
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
            var resourceId = $"/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.App/containerApps/{Uri.EscapeDataString(name)}";

            var end = DateTimeOffset.UtcNow;
            var start = end.AddMinutes(-Math.Max(15, rangeMinutes));
            var timespan = $"{start:O}/{end:O}";
            var interval = rangeMinutes <= 60 ? "PT1M" : rangeMinutes <= 360 ? "PT5M" : rangeMinutes <= 1440 ? "PT15M" : "PT1H";

            var url = $"https://management.azure.com{resourceId}/providers/microsoft.insights/metrics" +
                      "?api-version=2019-07-01&metricnames=Requests,RestartCount" +
                      $"&timespan={Uri.EscapeDataString(timespan)}&interval={interval}&aggregation=Total";

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
                var timeseries = (metric["timeseries"] as JArray)?.FirstOrDefault();
                var data = timeseries?["data"] as JArray ?? new JArray();

                result.Series.Add(new MetricSeriesDto
                {
                    Label = metricName,
                    Unit = "count",
                    Points = data
                        .Where(d => d["total"] != null)
                        .Select(d => new MetricPointDto
                        {
                            Timestamp = DateTime.Parse(d["timeStamp"]!.ToString()),
                            Value = d["total"]!.Value<double>()
                        })
                        .ToList()
                });
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "Container App metrics");
        }

        return result;
    }

    // ================= GCP Cloud Run =================

    private static GcpCloudRunServiceDto MapCloudRunService(JToken svc)
    {
        var template = svc["template"];
        var scaling = template?["scaling"];
        var containers = template?["containers"] as JArray;
        var conditions = svc["conditions"] as JArray;
        var readyCondition = conditions?.FirstOrDefault(c => c["type"]?.ToString() == "Ready");

        return new GcpCloudRunServiceDto
        {
            Name = svc["name"]?.ToString()?.Split('/').LastOrDefault() ?? string.Empty,
            Location = svc["name"]?.ToString()?.Split('/') is { Length: > 3 } parts ? parts[3] : string.Empty,
            Url = svc["uri"]?.ToString(),
            Image = containers?.FirstOrDefault()?["image"]?.ToString(),
            LatestReadyRevision = svc["latestReadyRevision"]?.ToString()?.Split('/').LastOrDefault(),
            Condition = readyCondition?["state"]?.ToString(),
            MinInstances = scaling?["minInstanceCount"]?.Value<int?>() ?? 0,
            MaxInstances = scaling?["maxInstanceCount"]?.Value<int?>() ?? 0
        };
    }

    public async Task<GcpCloudRunServiceListDto> GetCloudRunServicesAsync(UserGcpCredentials credentials)
    {
        var result = new GcpCloudRunServiceListDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        if (string.IsNullOrWhiteSpace(credentials.Location))
        {
            result.Error = "No location configured — set one in Settings → Credentials → GCP.";
            return result;
        }

        var (ok, token, error) = await GetGcpTokenAsync(credentials);

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            var url = $"https://run.googleapis.com/{CloudRunApiVersion}/projects/{Uri.EscapeDataString(credentials.ProjectId!)}" +
                      $"/locations/{Uri.EscapeDataString(credentials.Location)}/services";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await GcpHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                result.Error = $"Unable to reach GCP for Cloud Run's service list ({(int)response.StatusCode}).";
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var services = json["services"] as JArray ?? new JArray();

            result.Services = services.Select(MapCloudRunService).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GCP", "Cloud Run service list");
        }

        return result;
    }

    private static string CloudRunServiceUrl(UserGcpCredentials credentials, string serviceName) =>
        $"https://run.googleapis.com/{CloudRunApiVersion}/projects/{Uri.EscapeDataString(credentials.ProjectId!)}" +
        $"/locations/{Uri.EscapeDataString(credentials.Location!)}/services/{Uri.EscapeDataString(serviceName)}";

    public async Task<CloudServiceActionResultDto> ScaleCloudRunServiceAsync(UserGcpCredentials credentials, string serviceName, int minInstances, int maxInstances)
    {
        var (ok, token, error) = await GetGcpTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        try
        {
            var url = $"{CloudRunServiceUrl(credentials, serviceName)}?updateMask=template.scaling.minInstanceCount,template.scaling.maxInstanceCount";

            var body = new JObject
            {
                ["template"] = new JObject
                {
                    ["scaling"] = new JObject { ["minInstanceCount"] = minInstances, ["maxInstanceCount"] = maxInstances }
                }
            };

            using var request = new HttpRequestMessage(new HttpMethod("PATCH"), url)
            {
                Content = new StringContent(body.ToString(), Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await GcpHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                string? message = null;

                try { message = JObject.Parse(errorBody)["error"]?["message"]?.ToString(); }
                catch { /* fall through to the generic message below */ }

                return new CloudServiceActionResultDto { Success = false, Error = message ?? $"GCP returned {(int)response.StatusCode}." };
            }

            return new CloudServiceActionResultDto { Success = true, Message = "Scale requested — a new revision will roll out shortly." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "GCP", "Cloud Run scale") };
        }
    }

    // Cloud Run has no restart operation - the real-world equivalent is
    // forcing a new revision without changing the image, done here by
    // touching an annotation (a standard, documented Cloud Run pattern for
    // exactly this, not a workaround invented for this app).
    public async Task<CloudServiceActionResultDto> RedeployCloudRunServiceAsync(UserGcpCredentials credentials, string serviceName)
    {
        var (ok, token, error) = await GetGcpTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        try
        {
            var url = $"{CloudRunServiceUrl(credentials, serviceName)}?updateMask=template.annotations";

            var body = new JObject
            {
                ["template"] = new JObject
                {
                    ["annotations"] = new JObject { ["deployment-portal/restarted-at"] = DateTimeOffset.UtcNow.ToString("O") }
                }
            };

            using var request = new HttpRequestMessage(new HttpMethod("PATCH"), url)
            {
                Content = new StringContent(body.ToString(), Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await GcpHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync();
                string? message = null;

                try { message = JObject.Parse(errorBody)["error"]?["message"]?.ToString(); }
                catch { /* fall through to the generic message below */ }

                return new CloudServiceActionResultDto { Success = false, Error = message ?? $"GCP returned {(int)response.StatusCode}." };
            }

            return new CloudServiceActionResultDto { Success = true, Message = "Redeploy requested — a fresh revision is rolling out." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "GCP", "Cloud Run redeploy") };
        }
    }

    public async Task<CloudServiceActionResultDto> DeleteCloudRunServiceAsync(UserGcpCredentials credentials, string serviceName)
    {
        var (ok, token, error) = await GetGcpTokenAsync(credentials);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error };

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Delete, CloudRunServiceUrl(credentials, serviceName));
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var response = await GcpHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
                return new CloudServiceActionResultDto { Success = false, Error = $"GCP returned {(int)response.StatusCode}." };

            return new CloudServiceActionResultDto { Success = true, Message = "Delete requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "GCP", "Cloud Run deletion") };
        }
    }

    // request_count and instance_count are both simple GAUGE/DELTA Cloud
    // Run metrics - latency/error-rate/CPU/memory are DISTRIBUTION-typed
    // in Cloud Monitoring (percentile buckets, not a single number per
    // point) and are deliberately left out of this round rather than
    // guess at a reduction that might misrepresent them.
    public async Task<ResourceMetricsDto> GetCloudRunMetricsAsync(UserGcpCredentials credentials, string serviceName, int rangeMinutes)
    {
        var result = new ResourceMetricsDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        var (ok, token, error) = await GetGcpTokenAsync(credentials);

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            var end = DateTimeOffset.UtcNow;
            var start = end.AddMinutes(-Math.Max(15, rangeMinutes));

            var metrics = new (string Type, string Label, string Unit)[]
            {
                ("run.googleapis.com/request_count", "Requests", "count"),
                ("run.googleapis.com/container/instance_count", "Instance Count", "count")
            };

            foreach (var m in metrics)
            {
                var filter = $"metric.type=\"{m.Type}\" AND resource.labels.service_name=\"{serviceName}\"";
                var url = $"https://monitoring.googleapis.com/v3/projects/{Uri.EscapeDataString(credentials.ProjectId!)}/timeSeries" +
                          $"?filter={Uri.EscapeDataString(filter)}" +
                          $"&interval.startTime={Uri.EscapeDataString(start.ToString("O"))}" +
                          $"&interval.endTime={Uri.EscapeDataString(end.ToString("O"))}";

                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var response = await GcpHttpClient.SendAsync(request);

                var series = new MetricSeriesDto { Label = m.Label, Unit = m.Unit };

                if (response.IsSuccessStatusCode)
                {
                    var json = JObject.Parse(await response.Content.ReadAsStringAsync());
                    var timeSeriesList = json["timeSeries"] as JArray ?? new JArray();
                    var points = new List<MetricPointDto>();

                    foreach (var ts in timeSeriesList)
                    {
                        foreach (var p in ts["points"] as JArray ?? new JArray())
                        {
                            points.Add(new MetricPointDto
                            {
                                Timestamp = DateTime.Parse(p["interval"]?["endTime"]?.ToString() ?? DateTime.UtcNow.ToString("O")),
                                Value = p["value"]?["doubleValue"]?.Value<double?>() ?? p["value"]?["int64Value"]?.Value<double?>() ?? 0
                            });
                        }
                    }

                    series.Points = points.OrderBy(p => p.Timestamp).ToList();
                }

                result.Series.Add(series);
            }
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GCP", "Cloud Run metrics");
        }

        return result;
    }
}

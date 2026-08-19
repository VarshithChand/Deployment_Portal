using System.Net.Http.Headers;
using Amazon;
using Amazon.CloudWatch;
using Amazon.CloudWatch.Model;
using Amazon.CloudWatchLogs;
using Amazon.CloudWatchLogs.Model;
using Amazon.XRay;
using Amazon.XRay.Model;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Newtonsoft.Json.Linq;

namespace DeploymentAPI.Services;

// The Observability sidebar group's 4 CSP-native tools (CloudWatch, AWS
// X-Ray, Azure Monitor, GCP Cloud Monitoring) - each a real, live
// integration against this session's EXISTING AWS/Azure/GCP credential,
// no new credential type. Its own dedicated file (not folded into
// CloudStatusService/CloudServiceManagementService, both already large)
// - same "each cross-cutting feature area gets its own service" reasoning
// as ContainerRegistryService.cs.
public class ObservabilityService
{
    private readonly CloudStatusService _cloudStatus;

    public ObservabilityService(CloudStatusService cloudStatus)
    {
        _cloudStatus = cloudStatus;
    }

    private static (bool Ok, RegionEndpoint? Endpoint, string? Error) ResolveAwsRegion(UserAwsCredentials credentials, string? region)
    {
        var effectiveRegion = string.IsNullOrWhiteSpace(region) ? credentials.Region : region;

        return string.IsNullOrWhiteSpace(effectiveRegion)
            ? (false, null, "No AWS region configured — set one in Settings → Credentials → AWS.")
            : (true, RegionEndpoint.GetBySystemName(effectiveRegion), null);
    }

    // ================= AWS CloudWatch =================

    public async Task<CloudWatchOverviewDto> GetCloudWatchOverviewAsync(UserAwsCredentials credentials, string? region)
    {
        var result = new CloudWatchOverviewDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        if (credentials.RequiresMfaRefresh)
        {
            result.Error = "MFA session expired — re-enter your 6-digit code in Settings → Credentials → AWS.";
            return result;
        }

        var (ok, endpoint, regionError) = ResolveAwsRegion(credentials, region);

        if (!ok)
        {
            result.Error = regionError;
            return result;
        }

        result.Region = endpoint!.SystemName;

        try
        {
            var awsCredentials = CloudStatusService.BuildCredentials(credentials);

            using var alarmsClient = new AmazonCloudWatchClient(awsCredentials, endpoint);
            var alarmsResponse = await alarmsClient.DescribeAlarmsAsync(new DescribeAlarmsRequest { MaxRecords = 100 });

            result.Alarms = alarmsResponse.MetricAlarms.Select(a => new CloudWatchAlarmDto
            {
                Name = a.AlarmName,
                State = a.StateValue?.Value,
                MetricName = a.MetricName,
                Namespace = a.Namespace,
                Reason = a.StateReason,
                UpdatedAt = a.StateUpdatedTimestamp
            }).ToList();

            using var logsClient = new AmazonCloudWatchLogsClient(awsCredentials, endpoint);
            var logGroupsResponse = await logsClient.DescribeLogGroupsAsync(new DescribeLogGroupsRequest { Limit = 50 });

            result.LogGroups = logGroupsResponse.LogGroups.Select(g => new CloudWatchLogGroupDto
            {
                Name = g.LogGroupName,
                StoredBytes = g.StoredBytes,
                RetentionDays = g.RetentionInDays,
                CreatedAt = g.CreationTime
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "CloudWatch overview");
        }

        return result;
    }

    // ================= AWS X-Ray =================

    public async Task<XRayOverviewDto> GetXRayOverviewAsync(UserAwsCredentials credentials, string? region)
    {
        var result = new XRayOverviewDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        if (credentials.RequiresMfaRefresh)
        {
            result.Error = "MFA session expired — re-enter your 6-digit code in Settings → Credentials → AWS.";
            return result;
        }

        var (ok, endpoint, regionError) = ResolveAwsRegion(credentials, region);

        if (!ok)
        {
            result.Error = regionError;
            return result;
        }

        result.Region = endpoint!.SystemName;

        try
        {
            using var client = new AmazonXRayClient(CloudStatusService.BuildCredentials(credentials), endpoint);

            var end = DateTime.UtcNow;
            var start = end.AddHours(-6);

            var response = await client.GetTraceSummariesAsync(new GetTraceSummariesRequest
            {
                StartTime = start,
                EndTime = end,
                TimeRangeType = TimeRangeType.Event
            });

            result.Traces = response.TraceSummaries.Select(t => new XRayTraceDto
            {
                Id = t.Id,
                Duration = t.Duration,
                ResponseTime = t.ResponseTime,
                HasError = t.HasError ?? false,
                HasFault = t.HasFault ?? false,
                HasThrottle = t.HasThrottle ?? false,
                Url = t.Http?.HttpURL,
                StartTime = t.StartTime
            })
            .OrderByDescending(t => t.StartTime)
            .Take(100)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "X-Ray overview");
        }

        return result;
    }

    // ================= Azure Monitor =================
    //
    // Log Analytics Workspaces and Application Insights components are
    // both already captured by the account-wide Azure resource inventory
    // (see CloudStatusService.GetAzureResourceInventoryAsync) - reused
    // here rather than re-scanned, so this doesn't cost a second full ARM
    // resource list. Recent activity comes from a separate call to ARM's
    // own Activity Log API, which the generic resource list doesn't cover
    // at all (it's an event stream, not a resource).

    private static readonly HttpClient AzureMonitorHttpClient = new();

    public async Task<AzureMonitorOverviewDto> GetAzureMonitorOverviewAsync(UserAzureCredentials credentials)
    {
        var result = new AzureMonitorOverviewDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        if (string.IsNullOrWhiteSpace(credentials.SubscriptionId))
        {
            result.Error = "No Subscription ID configured — set one in Settings → Credentials → Azure.";
            return result;
        }

        try
        {
            var inventory = await _cloudStatus.GetAzureResourceInventoryAsync(credentials);

            if (inventory.Error != null)
            {
                result.Error = inventory.Error;
                return result;
            }

            result.LogAnalyticsWorkspaces = inventory.Groups
                .FirstOrDefault(g => string.Equals(g.Key, "microsoft.operationalinsights/workspaces", StringComparison.OrdinalIgnoreCase))
                ?.Items ?? new();

            result.ApplicationInsights = inventory.Groups
                .FirstOrDefault(g => string.Equals(g.Key, "microsoft.insights/components", StringComparison.OrdinalIgnoreCase))
                ?.Items ?? new();

            var token = await CloudStatusService.GetAzureAccessTokenAsync(credentials.TenantId!, credentials.ClientId!, credentials.ClientSecret!);

            if (token == null)
            {
                result.Error = "Azure sign-in failed — check the tenant, client ID, and client secret.";
                return result;
            }

            var since = Uri.EscapeDataString(DateTime.UtcNow.AddHours(-24).ToString("o"));
            var url = $"https://management.azure.com/subscriptions/{Uri.EscapeDataString(credentials.SubscriptionId)}" +
                      $"/providers/Microsoft.Insights/eventtypes/management/values?api-version=2015-04-01" +
                      $"&$filter=eventTimestamp ge '{since}'&$select=eventName,operationName,status,eventTimestamp,resourceId";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await AzureMonitorHttpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                // The inventory + workspace/component data above already
                // loaded successfully - a failed Activity Log call
                // specifically (a separate ARM provider/permission) is
                // surfaced without discarding what did load.
                result.Error = $"Loaded, but recent activity couldn't be fetched: {await CloudStatusService.DescribeArmErrorAsync(response)}";
                return result;
            }

            var json = JObject.Parse(await response.Content.ReadAsStringAsync());
            var events = json["value"] as JArray ?? new JArray();

            result.RecentActivity = events.Select(e => new AzureActivityLogEntryDto
            {
                EventName = e["eventName"]?["localizedValue"]?.ToString() ?? e["eventName"]?["value"]?.ToString(),
                OperationName = e["operationName"]?["localizedValue"]?.ToString() ?? e["operationName"]?["value"]?.ToString(),
                Status = e["status"]?["localizedValue"]?.ToString() ?? e["status"]?["value"]?.ToString(),
                ResourceId = e["resourceId"]?.ToString(),
                Timestamp = DateTime.TryParse(e["eventTimestamp"]?.ToString(), out var ts) ? ts : null
            })
            .OrderByDescending(a => a.Timestamp)
            .Take(50)
            .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "Azure", "Monitor overview");
        }

        return result;
    }

    // ================= GCP Cloud Monitoring =================
    //
    // Same service-account JWT-bearer exchange as Artifact Registry (see
    // CloudServiceManagementService.GetGcpAccessTokenAsync) - the same
    // broad cloud-platform scope that one already requests covers
    // Cloud Monitoring's read APIs too, no separate scope needed.

    private static readonly HttpClient GcpMonitoringHttpClient = new();

    public async Task<CloudMonitoringOverviewDto> GetCloudMonitoringOverviewAsync(UserGcpCredentials credentials)
    {
        var result = new CloudMonitoringOverviewDto { Configured = credentials.IsConfigured };

        if (!credentials.IsConfigured)
            return result;

        try
        {
            var token = await CloudServiceManagementService.GetGcpAccessTokenAsync(credentials.ServiceAccountKeyJson!);

            if (token == null)
            {
                result.Error = "Unable to authenticate with GCP — check the service account key JSON.";
                return result;
            }

            var project = Uri.EscapeDataString(credentials.ProjectId!);

            var alertsUrl = $"https://monitoring.googleapis.com/v3/projects/{project}/alertPolicies";
            using var alertsRequest = new HttpRequestMessage(HttpMethod.Get, alertsUrl);
            alertsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var alertsResponse = await GcpMonitoringHttpClient.SendAsync(alertsRequest);

            if (!alertsResponse.IsSuccessStatusCode)
            {
                result.Error = await DescribeGcpErrorAsync(alertsResponse);
                return result;
            }

            var alertsJson = JObject.Parse(await alertsResponse.Content.ReadAsStringAsync());
            var alertPolicies = alertsJson["alertPolicies"] as JArray ?? new JArray();

            result.AlertPolicies = alertPolicies.Select(p => new GcpAlertPolicyDto
            {
                Name = p["name"]?.ToString() ?? string.Empty,
                DisplayName = p["displayName"]?.ToString(),
                Enabled = p["enabled"]?.ToObject<bool?>() ?? false,
                CombinerCondition = p["combiner"]?.ToString()
            }).ToList();

            var uptimeUrl = $"https://monitoring.googleapis.com/v3/projects/{project}/uptimeCheckConfigs";
            using var uptimeRequest = new HttpRequestMessage(HttpMethod.Get, uptimeUrl);
            uptimeRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var uptimeResponse = await GcpMonitoringHttpClient.SendAsync(uptimeRequest);

            if (!uptimeResponse.IsSuccessStatusCode)
            {
                result.Error = $"Alert policies loaded, but uptime checks couldn't be fetched: {await DescribeGcpErrorAsync(uptimeResponse)}";
                return result;
            }

            var uptimeJson = JObject.Parse(await uptimeResponse.Content.ReadAsStringAsync());
            var uptimeChecks = uptimeJson["uptimeCheckConfigs"] as JArray ?? new JArray();

            result.UptimeChecks = uptimeChecks.Select(u => new GcpUptimeCheckDto
            {
                Name = u["name"]?.ToString() ?? string.Empty,
                DisplayName = u["displayName"]?.ToString(),
                MonitoredResourceType = u["monitoredResource"]?["type"]?.ToString() ?? u["resourceGroup"]?["resourceType"]?.ToString(),
                PeriodSeconds = ParseGoogleDurationSeconds(u["period"]?.ToString())
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "GCP", "Cloud Monitoring overview");
        }

        return result;
    }

    // Google's own APIs encode a duration as e.g. "300s" - parsed
    // defensively since a missing/unexpected shape should degrade to
    // null, not throw.
    private static int? ParseGoogleDurationSeconds(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || !value.EndsWith('s'))
            return null;

        return int.TryParse(value[..^1], out var seconds) ? seconds : null;
    }

    // GCP's own error envelope is {"error": {"code", "message", "status"}} -
    // same defensive "known fields, then raw body, then a plain status
    // line" layering as this app's other provider error helpers.
    private static async Task<string> DescribeGcpErrorAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        try
        {
            var error = JObject.Parse(body)["error"];
            var message = error?["message"]?.ToString();
            var status = error?["status"]?.ToString();

            if (!string.IsNullOrWhiteSpace(message))
                return string.IsNullOrWhiteSpace(status) ? message : $"{status}: {message}";
        }
        catch
        {
            // Fall through to the raw body below.
        }

        return !string.IsNullOrWhiteSpace(body)
            ? body
            : $"GCP returned {(int)response.StatusCode} {response.StatusCode}.";
    }
}

using Amazon;
using Amazon.CloudWatch;
using Amazon.CloudWatch.Model;
using Amazon.ElasticBeanstalk;
using Amazon.ElasticBeanstalk.Model;
using Amazon.Runtime;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;

namespace DeploymentAPI.Services;

// Phase A of the PaaS/Microservices console - AWS Elastic Beanstalk.
// Own file, same "container/PaaS services get their own service class"
// precedent as ContainerServiceManagementService.cs, kept separate from
// the already-large CloudServiceManagementService.cs. Every method
// follows the same Configured/Error contract and never-throws-to-caller
// shape every other cloud service in this app already uses.
//
// Elastic Beanstalk does NOT behave like Azure App Service slots - there
// is no swap here, only environments + application versions + a real
// deploy-a-version action. Not faked to look like Azure's model.
public class ElasticBeanstalkService
{
    private static AWSCredentials BuildCredentials(UserAwsCredentials credentials) =>
        CloudStatusService.BuildCredentials(credentials);

    private static (bool ok, RegionEndpoint? endpoint, string? error) ResolveRegion(UserAwsCredentials credentials, string? region)
    {
        if (!credentials.IsConfigured)
            return (false, null, null);

        if (credentials.RequiresMfaRefresh)
            return (false, null, "MFA session expired — re-enter your 6-digit code in Settings → Credentials → AWS.");

        var effectiveRegion = string.IsNullOrWhiteSpace(region) ? credentials.Region : region;

        if (string.IsNullOrWhiteSpace(effectiveRegion))
            return (false, null, "No AWS region configured — set one in Settings → Credentials → AWS.");

        return (true, RegionEndpoint.GetBySystemName(effectiveRegion), null);
    }

    public async Task<EbApplicationListDto> GetApplicationsAsync(UserAwsCredentials credentials, string? region)
    {
        var result = new EbApplicationListDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            using var client = new AmazonElasticBeanstalkClient(BuildCredentials(credentials), endpoint);
            var response = await client.DescribeApplicationsAsync(new DescribeApplicationsRequest());

            result.Applications = (response.Applications ?? new List<ApplicationDescription>())
                .Select(a => new EbApplicationDto
                {
                    Name = a.ApplicationName,
                    Description = a.Description,
                    DateCreated = a.DateCreated,
                    DateUpdated = a.DateUpdated
                })
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk application list");
        }

        return result;
    }

    // One DescribeEnvironments call covers every application's
    // environments at once - the list page's own summary, same
    // aggregation principle already used for ECS's cluster/service
    // summary fetch.
    public async Task<EbEnvironmentListDto> GetEnvironmentsAsync(UserAwsCredentials credentials, string? region)
    {
        var result = new EbEnvironmentListDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            using var client = new AmazonElasticBeanstalkClient(BuildCredentials(credentials), endpoint);
            var response = await client.DescribeEnvironmentsAsync(new DescribeEnvironmentsRequest { IncludeDeleted = false });

            result.Environments = (response.Environments ?? new List<EnvironmentDescription>())
                .Select(MapEnvironment)
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk environment list");
        }

        return result;
    }

    private static EbEnvironmentDto MapEnvironment(EnvironmentDescription e) => new()
    {
        EnvironmentName = e.EnvironmentName,
        EnvironmentId = e.EnvironmentId,
        ApplicationName = e.ApplicationName,
        Status = e.Status?.Value,
        Health = e.Health?.Value,
        HealthStatus = e.HealthStatus,
        Url = e.CNAME,
        PlatformArn = e.PlatformArn,
        VersionLabel = e.VersionLabel,
        Tier = e.Tier?.Name,
        DateCreated = e.DateCreated,
        DateUpdated = e.DateUpdated
    };

    public async Task<EbEnvironmentDetailDto> GetEnvironmentDetailAsync(UserAwsCredentials credentials, string? region, string environmentName)
    {
        var result = new EbEnvironmentDetailDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            using var client = new AmazonElasticBeanstalkClient(BuildCredentials(credentials), endpoint);

            var envResponse = await client.DescribeEnvironmentsAsync(new DescribeEnvironmentsRequest
            {
                EnvironmentNames = new List<string> { environmentName },
                IncludeDeleted = false
            });

            var env = envResponse.Environments?.FirstOrDefault();

            if (env == null)
            {
                result.Error = $"Environment \"{environmentName}\" not found.";
                return result;
            }

            result.Environment = MapEnvironment(env);

            var resourcesResponse = await client.DescribeEnvironmentResourcesAsync(new DescribeEnvironmentResourcesRequest
            {
                EnvironmentName = environmentName
            });

            var resources = resourcesResponse.EnvironmentResources;
            result.InstanceIds = resources?.Instances?.Select(i => i.Id).ToList() ?? new List<string>();
            result.LoadBalancerName = resources?.LoadBalancers?.FirstOrDefault()?.Name;
            result.AutoScalingGroupName = resources?.AutoScalingGroups?.FirstOrDefault()?.Name;

            var configResponse = await client.DescribeConfigurationSettingsAsync(new DescribeConfigurationSettingsRequest
            {
                ApplicationName = env.ApplicationName,
                EnvironmentName = environmentName
            });

            var options = configResponse.ConfigurationSettings?.FirstOrDefault()?.OptionSettings ?? new List<ConfigurationOptionSetting>();

            var minSize = options.FirstOrDefault(o => o.Namespace == "aws:autoscaling:asg" && o.OptionName == "MinSize");
            var maxSize = options.FirstOrDefault(o => o.Namespace == "aws:autoscaling:asg" && o.OptionName == "MaxSize");

            result.MinSize = int.TryParse(minSize?.Value, out var min) ? min : null;
            result.MaxSize = int.TryParse(maxSize?.Value, out var max) ? max : null;

            result.EnvironmentVariables = options
                .Where(o => o.Namespace == "aws:elasticbeanstalk:application:environment")
                .Select(o => new EbEnvironmentVariableDto
                {
                    Name = o.OptionName,
                    IsSecret = SecretRedaction.LooksLikeSecretKey(o.OptionName),
                    Value = SecretRedaction.LooksLikeSecretKey(o.OptionName) ? null : o.Value
                })
                .OrderBy(v => v.Name)
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk environment detail");
        }

        return result;
    }

    public async Task<EbApplicationVersionListDto> GetApplicationVersionsAsync(UserAwsCredentials credentials, string? region, string applicationName)
    {
        var result = new EbApplicationVersionListDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            using var client = new AmazonElasticBeanstalkClient(BuildCredentials(credentials), endpoint);

            var response = await client.DescribeApplicationVersionsAsync(new DescribeApplicationVersionsRequest
            {
                ApplicationName = applicationName
            });

            result.Versions = (response.ApplicationVersions ?? new List<ApplicationVersionDescription>())
                .OrderByDescending(v => v.DateCreated)
                .Select(v => new EbApplicationVersionDto
                {
                    VersionLabel = v.VersionLabel,
                    Description = v.Description,
                    DateCreated = v.DateCreated,
                    SourceBundle = v.SourceBundle != null ? $"s3://{v.SourceBundle.S3Bucket}/{v.SourceBundle.S3Key}" : null,
                    Status = v.Status?.Value
                })
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk application version list");
        }

        return result;
    }

    // Never auto-deploys - the frontend's own before/after confirmation
    // (current version -> new version) gates this call, per section 8's
    // explicit requirement; the backend doesn't second-guess that, AWS's
    // own IAM permission check is the real authorization boundary.
    public async Task<CloudServiceActionResultDto> DeployVersionAsync(UserAwsCredentials credentials, string? region, string environmentName, string versionLabel)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonElasticBeanstalkClient(BuildCredentials(credentials), endpoint);

            await client.UpdateEnvironmentAsync(new UpdateEnvironmentRequest
            {
                EnvironmentName = environmentName,
                VersionLabel = versionLabel
            });

            return new CloudServiceActionResultDto { Success = true, Message = $"Deploying \"{versionLabel}\" — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk deploy") };
        }
    }

    // EB's own real operation (restarts the application server processes
    // on every instance without replacing them) - not a fake Azure-style
    // slot swap, per section 7's explicit instruction.
    public async Task<CloudServiceActionResultDto> RestartAppServerAsync(UserAwsCredentials credentials, string? region, string environmentName)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonElasticBeanstalkClient(BuildCredentials(credentials), endpoint);
            await client.RestartAppServerAsync(new RestartAppServerRequest { EnvironmentName = environmentName });

            return new CloudServiceActionResultDto { Success = true, Message = "Restart requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk restart") };
        }
    }

    // EB's own real "rebuild" operation - terminates and recreates every
    // resource in the environment from scratch (a heavier, real, distinct
    // operation from RestartAppServer above, not a synonym for it).
    public async Task<CloudServiceActionResultDto> RebuildEnvironmentAsync(UserAwsCredentials credentials, string? region, string environmentName)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonElasticBeanstalkClient(BuildCredentials(credentials), endpoint);
            await client.RebuildEnvironmentAsync(new RebuildEnvironmentRequest { EnvironmentName = environmentName });

            return new CloudServiceActionResultDto { Success = true, Message = "Rebuild requested — every resource in this environment is being recreated, which takes several minutes." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk rebuild") };
        }
    }

    public async Task<CloudServiceActionResultDto> ScaleEnvironmentAsync(UserAwsCredentials credentials, string? region, string environmentName, int minSize, int maxSize)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonElasticBeanstalkClient(BuildCredentials(credentials), endpoint);

            await client.UpdateEnvironmentAsync(new UpdateEnvironmentRequest
            {
                EnvironmentName = environmentName,
                OptionSettings = new List<ConfigurationOptionSetting>
                {
                    new("aws:autoscaling:asg", "MinSize", minSize.ToString()),
                    new("aws:autoscaling:asg", "MaxSize", maxSize.ToString())
                }
            });

            return new CloudServiceActionResultDto { Success = true, Message = "Scale requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk scale") };
        }
    }

    // EB's configuration-settings API has no single-key upsert for the
    // aws:elasticbeanstalk:application:environment namespace - the whole
    // namespace is replaced by whatever OptionSettings are submitted, so
    // this reads the CURRENT settings first, merges in the one change
    // (or removes the key entirely if value is null), and resubmits only
    // that namespace. A real read-modify-write against EB's actual API
    // shape, not an invented limitation.
    public async Task<CloudServiceActionResultDto> UpdateEnvironmentVariableAsync(UserAwsCredentials credentials, string? region, string environmentName, string variableName, string? value)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonElasticBeanstalkClient(BuildCredentials(credentials), endpoint);

            var envResponse = await client.DescribeEnvironmentsAsync(new DescribeEnvironmentsRequest
            {
                EnvironmentNames = new List<string> { environmentName },
                IncludeDeleted = false
            });

            var env = envResponse.Environments?.FirstOrDefault();

            if (env == null)
                return new CloudServiceActionResultDto { Success = false, Error = $"Environment \"{environmentName}\" not found." };

            var configResponse = await client.DescribeConfigurationSettingsAsync(new DescribeConfigurationSettingsRequest
            {
                ApplicationName = env.ApplicationName,
                EnvironmentName = environmentName
            });

            var existing = (configResponse.ConfigurationSettings?.FirstOrDefault()?.OptionSettings ?? new List<ConfigurationOptionSetting>())
                .Where(o => o.Namespace == "aws:elasticbeanstalk:application:environment")
                .ToDictionary(o => o.OptionName, o => o.Value, StringComparer.OrdinalIgnoreCase);

            if (value == null)
                existing.Remove(variableName);
            else
                existing[variableName] = value;

            var optionSettings = existing
                .Select(kv => new ConfigurationOptionSetting("aws:elasticbeanstalk:application:environment", kv.Key, kv.Value))
                .ToList();

            var updateRequest = new UpdateEnvironmentRequest
            {
                EnvironmentName = environmentName,
                OptionSettings = optionSettings
            };

            if (value == null)
            {
                // A removed key has to be explicitly unset via
                // OptionsToRemove - simply omitting it from OptionSettings
                // above leaves it untouched, EB's real merge semantics for
                // an UpdateEnvironment call (unlike a full PUT replace).
                updateRequest.OptionsToRemove = new List<OptionSpecification>
                {
                    new() { Namespace = "aws:elasticbeanstalk:application:environment", OptionName = variableName }
                };
            }

            await client.UpdateEnvironmentAsync(updateRequest);

            return new CloudServiceActionResultDto { Success = true, Message = value == null ? "Variable removed." : "Variable saved." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk environment variable update") };
        }
    }

    // Irreversible - the frontend requires typing "DELETE {name}" to
    // confirm (section 37) before this is ever called.
    public async Task<CloudServiceActionResultDto> TerminateEnvironmentAsync(UserAwsCredentials credentials, string? region, string environmentName)
    {
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!ok)
            return new CloudServiceActionResultDto { Success = false, Error = error ?? "AWS is not configured." };

        try
        {
            using var client = new AmazonElasticBeanstalkClient(BuildCredentials(credentials), endpoint);
            await client.TerminateEnvironmentAsync(new TerminateEnvironmentRequest { EnvironmentName = environmentName });

            return new CloudServiceActionResultDto { Success = true, Message = "Termination requested — refresh to see the current state." };
        }
        catch (Exception ex)
        {
            return new CloudServiceActionResultDto { Success = false, Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk termination") };
        }
    }

    // A glance at the most recent events, not a full paginated event
    // log - same "glance, not a query builder" posture already used for
    // CloudWatch/X-Ray/Azure Monitor.
    public async Task<EbEventListDto> GetEnvironmentEventsAsync(UserAwsCredentials credentials, string? region, string environmentName)
    {
        var result = new EbEventListDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        try
        {
            using var client = new AmazonElasticBeanstalkClient(BuildCredentials(credentials), endpoint);

            var response = await client.DescribeEventsAsync(new DescribeEventsRequest
            {
                EnvironmentName = environmentName,
                MaxRecords = 50
            });

            result.Events = (response.Events ?? new List<EventDescription>())
                .Select(e => new EbEventDto
                {
                    EventDate = e.EventDate,
                    Severity = e.Severity?.Value,
                    Message = e.Message
                })
                .ToList();
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk event list");
        }

        return result;
    }

    // A real, aggregate CPU view across every instance in the
    // environment's own Auto Scaling Group - CloudWatch's AWS/EC2
    // namespace supports an AutoScalingGroupName dimension for exactly
    // this (a documented capability, not a guess). Environment-level
    // health/enhanced-monitoring metrics aren't exposed the same
    // straightforward way, so this round doesn't chart those.
    public async Task<ResourceMetricsDto> GetEnvironmentMetricsAsync(UserAwsCredentials credentials, string? region, string autoScalingGroupName, int rangeMinutes)
    {
        var result = new ResourceMetricsDto { Configured = credentials.IsConfigured };
        var (ok, endpoint, error) = ResolveRegion(credentials, region);

        if (!credentials.IsConfigured)
            return result;

        if (!ok)
        {
            result.Error = error;
            return result;
        }

        if (string.IsNullOrWhiteSpace(autoScalingGroupName))
        {
            result.Error = "This environment has no Auto Scaling Group to report metrics for.";
            return result;
        }

        try
        {
            using var client = new AmazonCloudWatchClient(BuildCredentials(credentials), endpoint);

            var end = DateTime.UtcNow;
            var start = end.AddMinutes(-Math.Max(15, rangeMinutes));
            var periodSeconds = rangeMinutes <= 60 ? 60 : rangeMinutes <= 360 ? 300 : rangeMinutes <= 1440 ? 900 : 3600;

            var response = await client.GetMetricDataAsync(new GetMetricDataRequest
            {
                StartTime = start,
                EndTime = end,
                MetricDataQueries = new List<MetricDataQuery>
                {
                    new()
                    {
                        Id = "cpu",
                        MetricStat = new MetricStat
                        {
                            Metric = new Amazon.CloudWatch.Model.Metric
                            {
                                Namespace = "AWS/EC2",
                                MetricName = "CPUUtilization",
                                Dimensions = new List<Amazon.CloudWatch.Model.Dimension>
                                {
                                    new() { Name = "AutoScalingGroupName", Value = autoScalingGroupName }
                                }
                            },
                            Period = periodSeconds,
                            Stat = "Average"
                        }
                    }
                }
            });

            var series = response.MetricDataResults?.FirstOrDefault(r => r.Id == "cpu");

            result.Series.Add(new MetricSeriesDto
            {
                Label = "CPU Utilization",
                Unit = "%",
                Points = series?.Timestamps == null
                    ? new List<MetricPointDto>()
                    : series.Timestamps.Zip(series.Values, (t, v) => new MetricPointDto { Timestamp = t, Value = v })
                        .OrderBy(p => p.Timestamp).ToList()
            });
        }
        catch (Exception ex)
        {
            result.Error = CloudErrorSanitizer.Describe(ex, "AWS", "Elastic Beanstalk metrics");
        }

        return result;
    }
}

using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Phase C of the PaaS/Microservices console - the cross-provider hub.
// Purely a thin aggregator over the three provider services that
// already exist (ElasticBeanstalkService/AzureAppServiceManagement
// Service/ContainerServiceManagementService) - no new provider API
// calls of its own beyond what each already does, all three fetched in
// parallel (section 36's aggregation principle applied across
// providers, not just within one).
public class PaasAggregationService
{
    private readonly ElasticBeanstalkService _elasticBeanstalk;
    private readonly AzureAppServiceManagementService _appService;
    private readonly ContainerServiceManagementService _containerServices;

    public PaasAggregationService(
        ElasticBeanstalkService elasticBeanstalk, AzureAppServiceManagementService appService, ContainerServiceManagementService containerServices)
    {
        _elasticBeanstalk = elasticBeanstalk;
        _appService = appService;
        _containerServices = containerServices;
    }

    public async Task<PaasApplicationListDto> GetAllApplicationsAsync(
        UserAwsCredentials awsCredentials, UserAzureCredentials azureCredentials, UserGcpCredentials gcpCredentials)
    {
        var result = new PaasApplicationListDto();

        var ebTask = _elasticBeanstalk.GetEnvironmentsAsync(awsCredentials, null);
        var azureTask = _appService.GetAppServicesAsync(azureCredentials);
        var gcpTask = _containerServices.GetCloudRunServicesAsync(gcpCredentials);

        await Task.WhenAll(ebTask, azureTask, gcpTask);

        var ebResult = await ebTask;
        var azureResult = await azureTask;
        var gcpResult = await gcpTask;

        result.AwsConfigured = ebResult.Configured;
        result.AwsError = ebResult.Error;
        result.AzureConfigured = azureResult.Configured;
        result.AzureError = azureResult.Error;
        result.GcpConfigured = gcpResult.Configured;
        result.GcpError = gcpResult.Error;

        result.Applications.AddRange(ebResult.Environments.Select(e => new PaasApplicationDto
        {
            Provider = "AWS",
            Name = e.EnvironmentName,
            Environment = e.ApplicationName,
            Region = awsCredentials.Region,
            Status = e.Status,
            Version = e.VersionLabel,
            Url = e.Url
        }));

        result.Applications.AddRange(azureResult.Apps.Select(a => new PaasApplicationDto
        {
            Provider = "Azure",
            Name = a.Name,
            Environment = a.ResourceGroup,
            Region = a.Location,
            ResourceGroup = a.ResourceGroup,
            Status = a.State,
            Url = a.DefaultHostName
        }));

        result.Applications.AddRange(gcpResult.Services.Select(s => new PaasApplicationDto
        {
            Provider = "GCP",
            Name = s.Name,
            Environment = s.Location,
            Region = s.Location,
            Status = s.Condition,
            Version = s.LatestReadyRevision,
            Url = s.Url
        }));

        return result;
    }

    // Restart-only (see PaasBulkRestartItemDto's own comment for why) -
    // each item dispatched to the real per-provider restart-equivalent
    // that already exists (built in Phases A/B/C, not duplicated here):
    // Elastic Beanstalk's RestartAppServer, Azure App Service's site
    // restart, Cloud Run's redeploy annotation-touch. Every item's own
    // success/error is recorded independently - never a blended pass/
    // fail for the batch.
    public async Task<PaasBulkActionResultDto> BulkRestartAsync(
        UserAwsCredentials awsCredentials, UserAzureCredentials azureCredentials, UserGcpCredentials gcpCredentials, List<PaasBulkRestartItemDto> items)
    {
        var result = new PaasBulkActionResultDto();

        foreach (var item in items)
        {
            CloudServiceActionResultDto actionResult;

            switch (item.Provider.ToUpperInvariant())
            {
                case "AWS":
                    actionResult = await _elasticBeanstalk.RestartAppServerAsync(awsCredentials, null, item.Name);
                    break;

                case "AZURE":
                    actionResult = string.IsNullOrWhiteSpace(item.ResourceGroup)
                        ? new CloudServiceActionResultDto { Success = false, Error = "Missing resource group." }
                        : await _appService.RestartAsync(azureCredentials, item.ResourceGroup, item.Name, null);
                    break;

                case "GCP":
                    actionResult = await _containerServices.RedeployCloudRunServiceAsync(gcpCredentials, item.Name);
                    break;

                default:
                    actionResult = new CloudServiceActionResultDto { Success = false, Error = $"Unknown provider \"{item.Provider}\"." };
                    break;
            }

            result.Results.Add(new PaasBulkActionItemResultDto
            {
                Provider = item.Provider,
                Name = item.Name,
                Success = actionResult.Success,
                Error = actionResult.Error
            });
        }

        return result;
    }
}

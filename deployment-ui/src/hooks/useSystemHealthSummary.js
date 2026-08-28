import useAuth from "./useAuth";
import useGithubDeploymentActivity from "./useGithubDeploymentActivity";
import useAzureDevOpsStatus from "./useAzureDevOpsStatus";
import { useAwsResourceInventory, useAzureResourceInventory, useGcpResources } from "./useSharedCloudInventories";
import usePaasApplications from "./usePaasApplications";
import useContainerRegistryStatus from "./useContainerRegistryStatus";
import useSonarStatus from "./useSonarStatus";
import useObservabilityStatus from "./useObservabilityStatus";

const AWS_ERROR_KEYS = ["ec2", "ecr", "vpc", "s3", "lambda", "route53", "sns"];

// Extracted out of SystemHealthCard so the Dashboard's hero stat strip
// (DashboardOverviewStrip/SystemHealthTiles) can read the exact same
// "is X connected/healthy" definition as the Connections table instead of
// a second, driftable copy of the same logic. Every hook called here is
// already shared/deduped (see useSharedCloudInventories.js and friends),
// so calling this from two different components costs no extra network
// traffic - it's the same cached data read twice.
export default function useSystemHealthSummary() {

    const { githubTokenConfigured } = useAuth();

    const github = useGithubDeploymentActivity(githubTokenConfigured);
    const azureDevOps = useAzureDevOpsStatus();
    const aws = useAwsResourceInventory();
    const azure = useAzureResourceInventory();
    const gcp = useGcpResources();
    const { data: paas } = usePaasApplications();
    const registries = useContainerRegistryStatus();
    const sonar = useSonarStatus();
    const observability = useObservabilityStatus();

    const awsHasError = AWS_ERROR_KEYS.some((k) => aws.data?.[k]?.error) || !!aws.data?.otherError;
    const gcpVms = gcp.data?.vms;
    const gcpCloudRun = gcp.data?.cloudRun;
    const paasConfigured = !!(paas?.awsConfigured || paas?.azureConfigured || paas?.gcpConfigured);
    const paasHasError = !!(paas?.awsError || paas?.azureError || paas?.gcpError);
    const registryConfigured = registries.status ? Object.values(registries.status).some(Boolean) : false;
    const sonarConfigured = sonar.status ? Object.values(sonar.status).some(Boolean) : false;
    const observabilityConfigured = observability.status ? Object.values(observability.status).some(Boolean) : false;

    const rows = [
        {
            key: "github", category: "Source Control", label: "GitHub", tab: "deploy",
            configured: githubTokenConfigured, healthy: githubTokenConfigured, tookMs: github.tookMs
        },
        {
            key: "azuredevops", category: "Source Control", label: "Azure DevOps", tab: "azureDevOpsPipelines",
            configured: azureDevOps.configured, healthy: azureDevOps.configured, tookMs: azureDevOps.tookMs
        },
        {
            key: "aws", category: "Cloud Provider", label: "AWS", tab: "cloudServicesAws",
            configured: !!aws.data?.configured, healthy: !!aws.data?.configured && !awsHasError, tookMs: aws.tookMs
        },
        {
            key: "azure", category: "Cloud Provider", label: "Azure", tab: "cloudServicesAzure",
            configured: !!azure.data?.configured, healthy: !!azure.data?.configured && !azure.data?.error, tookMs: azure.tookMs
        },
        {
            key: "gcp", category: "Cloud Provider", label: "GCP", tab: "cloudServicesGcp",
            configured: !!gcpVms?.configured,
            healthy: !!gcpVms?.configured && !gcpVms?.error && !gcpCloudRun?.error,
            tookMs: gcp.tookMs
        },
        {
            key: "paas", category: "PaaS / Microservices", label: "PaaS Applications", tab: "paasHub",
            configured: paasConfigured, healthy: paasConfigured && !paasHasError, tookMs: null
        },
        {
            key: "registry", category: "Container Registry", label: "Container Registries", tab: null,
            configured: registryConfigured, healthy: registryConfigured, tookMs: registries.tookMs
        },
        {
            key: "codequality", category: "Code Quality", label: "SonarQube / SonarCloud", tab: null,
            configured: sonarConfigured, healthy: sonarConfigured, tookMs: sonar.tookMs
        },
        {
            key: "observability", category: "Observability", label: "Monitoring Tools", tab: null,
            configured: observabilityConfigured, healthy: observabilityConfigured, tookMs: observability.tookMs
        }
    ];

    const configuredRows = rows.filter((r) => r.configured);
    const healthyCount = configuredRows.filter((r) => r.healthy).length;
    const downCount = configuredRows.length - healthyCount;
    const timedRows = rows.filter((r) => r.configured && r.tookMs != null);
    const avgResponseMs = timedRows.length
        ? Math.round(timedRows.reduce((sum, r) => sum + r.tookMs, 0) / timedRows.length)
        : null;

    const overallStatus = configuredRows.length === 0 ? "Not Configured" : downCount > 0 ? "Degraded" : "Healthy";
    const overallTone = configuredRows.length === 0 ? "default" : downCount > 0 ? "critical" : "good";

    const tiles = [
        { key: "overall", label: "Overall Status", value: overallStatus, tone: overallTone },
        { key: "connected", label: "Integrations Connected", value: `${configuredRows.length}/${rows.length}` },
        { key: "healthy", label: "Healthy", value: healthyCount, tone: "good" },
        {
            key: "attention", label: "Needs Attention", value: downCount,
            tone: downCount > 0 ? "critical" : "good"
        },
        {
            key: "response", label: "Avg Response Time",
            value: avgResponseMs != null ? `${avgResponseMs}ms` : "—",
            sublabel: "across connected integrations"
        }
    ];

    return { rows, tiles, configuredCount: configuredRows.length, totalCount: rows.length };

}

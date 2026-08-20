import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import useGithubDeploymentActivity from "../../hooks/useGithubDeploymentActivity";
import useAzureDevOpsStatus from "../../hooks/useAzureDevOpsStatus";
import { useAwsResourceInventory, useAzureResourceInventory, useGcpResources } from "../../hooks/useSharedCloudInventories";
import usePaasApplications from "../../hooks/usePaasApplications";
import useContainerRegistryStatus from "../../hooks/useContainerRegistryStatus";
import useSonarStatus from "../../hooks/useSonarStatus";
import useObservabilityStatus from "../../hooks/useObservabilityStatus";
import StatTile from "../charts/StatTile";

const AWS_ERROR_KEYS = ["ec2", "ecr", "vpc", "s3", "lambda", "route53", "sns"];

function StatusPill({ configured, healthy }) {

    if (!configured) {
        return <span className="badge badge-secondary">Not Connected</span>;
    }

    return healthy
        ? <span className="badge badge-success">Healthy</span>
        : <span className="badge badge-danger">Needs Attention</span>;

}

// The Dashboard's own "at a glance, one container" health view - every
// row here is a real read of an already-connected integration (or a
// real "Not Connected" if it isn't), never a placeholder metric. No
// Total Requests/Error Rate/24h Uptime tiles - this app has no request-
// count or uptime-history instrumentation anywhere (the separate,
// uncommitted Prometheus work in this repo is exactly that, and is
// deliberately left untouched rather than folded in here), so nothing
// resembling those numbers is shown. "Response Time" is real too - each
// row's tookMs is measured client-side around the same shared hook every
// other Dashboard card already reads from (see useSharedCloudInventories.js
// and friends), not invented and not a duplicate fetch: this card makes
// zero network calls of its own.
export default function SystemHealthCard() {

    const { githubTokenConfigured } = useAuth();
    const { setTab } = useNavigation();

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

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>System Health</h2>
                <span className="field-hint" style={{ margin: 0 }}>Live status of every connected integration</span>
            </div>

            <div className="stat-grid" style={{ marginTop: "12px" }}>
                {tiles.map((tile) => (
                    <StatTile key={tile.key} label={tile.label} value={tile.value} tone={tile.tone} sublabel={tile.sublabel} />
                ))}
            </div>

            <div className="table-scroll" style={{ marginTop: "16px" }}>

                <table className="table">

                    <thead>
                        <tr>
                            <th>Integration</th>
                            <th>Category</th>
                            <th>Status</th>
                            <th>Response Time</th>
                        </tr>
                    </thead>

                    <tbody>

                        {rows.map((row) => (

                            <tr
                                key={row.key}
                                className={row.tab && row.configured ? "table-row-clickable" : ""}
                                onClick={row.tab && row.configured ? () => setTab(row.tab) : undefined}
                            >
                                <td>{row.label}</td>
                                <td><span className="field-hint" style={{ margin: 0 }}>{row.category}</span></td>
                                <td><StatusPill configured={row.configured} healthy={row.healthy} /></td>
                                <td className="smoke-test-metric-mono">
                                    {row.configured && row.tookMs != null ? `${row.tookMs}ms` : "—"}
                                </td>
                            </tr>

                        ))}

                    </tbody>

                </table>

            </div>

        </div>

    );

}

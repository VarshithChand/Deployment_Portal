import useAuth from "../../hooks/useAuth";
import usePaasApplications from "../../hooks/usePaasApplications";
import { useAwsResourceInventory, useAzureResourceInventory, useGcpResources } from "../../hooks/useSharedCloudInventories";
import useGithubDeploymentActivity from "../../hooks/useGithubDeploymentActivity";
import StatTile from "../charts/StatTile";

function sumAwsCounts(inventory) {

    if (!inventory?.configured) return null;

    const known = ["ec2", "ecr", "vpc", "s3", "lambda", "route53", "sns"];
    const total = known.reduce((sum, key) => sum + (inventory[key]?.count || 0), 0);

    return total + (inventory.other || []).reduce((sum, g) => sum + (g.count || 0), 0);

}

function sumAzureCounts(inventory) {

    if (!inventory?.configured) return null;

    return (inventory.groups || []).reduce((sum, g) => sum + (g.count || 0), 0);

}

// The Dashboard's own top stat row - every number here is real, drawn
// from data this app already fetches elsewhere (AWS/Azure resource
// inventories, GCP VM/Cloud Run lists, the PaaS hub's aggregation, and
// GitHub Actions run history), all via the shared hooks in
// useSharedCloudInventories.js/usePaasApplications.js/
// useGithubDeploymentActivity.js - this component no longer fetches
// anything of its own, it only reads the same data AwsCloudSection/
// AzureCloudSection/GcpCloudSection/PaasSummaryCard/DeploymentActivityCard
// already keep live. Deliberately no fake week-over-week deltas ("+12
// this week" style indicators) - this app keeps no historical snapshots
// to compute a real delta from, so none are shown rather than invented.
export default function OverviewStats() {

    const { githubTokenConfigured } = useAuth();

    const { data: paas } = usePaasApplications();
    const { data: aws, loading: awsLoading } = useAwsResourceInventory();
    const { data: azure, loading: azureLoading } = useAzureResourceInventory();
    const { data: gcpData, loading: gcpLoading } = useGcpResources();
    const { runs, tookMs: runsTookMs } = useGithubDeploymentActivity(githubTokenConfigured);

    if (awsLoading || azureLoading || gcpLoading || (githubTokenConfigured && runsTookMs === null)) {
        return null;
    }

    const gcpVms = gcpData?.vms;
    const cloudRun = gcpData?.cloudRun;

    const totalApplications = paas?.applications?.length ?? null;
    const awsCount = sumAwsCounts(aws);
    const azureCount = sumAzureCounts(azure);
    const gcpCount = gcpVms?.configured ? (gcpVms.instances?.length || 0) + (cloudRun?.services?.length || 0) : null;

    const allRuns = runs || [];
    const activeDeployments = githubTokenConfigured
        ? allRuns.filter((r) => r.status === "in_progress" || r.status === "queued").length
        : null;

    let openIssues = allRuns.filter((r) => r.conclusion === "failure").length;
    if (aws?.error) openIssues += 1;
    if (azure?.error) openIssues += 1;
    if (gcpVms?.error) openIssues += 1;

    const tiles = [
        totalApplications != null && { key: "apps", label: "PaaS Applications", value: totalApplications },
        awsCount != null && { key: "aws", label: "AWS Resources", value: awsCount },
        azureCount != null && { key: "azure", label: "Azure Resources", value: azureCount },
        gcpCount != null && { key: "gcp", label: "GCP Resources", value: gcpCount },
        activeDeployments != null && {
            key: "active", label: "Active Deployments", value: activeDeployments,
            tone: activeDeployments > 0 ? "good" : "default"
        },
        {
            key: "issues", label: "Open Issues", value: openIssues,
            tone: openIssues > 0 ? "critical" : "good",
            sublabel: "failed runs + connection errors"
        }
    ].filter(Boolean);

    if (tiles.length <= 1) {
        return null;
    }

    return (

        <div className="stat-grid">
            {tiles.map((tile) => (
                <StatTile key={tile.key} label={tile.label} value={tile.value} tone={tile.tone} sublabel={tile.sublabel} />
            ))}
        </div>

    );

}

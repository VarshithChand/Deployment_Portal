import { useEffect, useState } from "react";

import useAuth from "../../hooks/useAuth";
import { getPaasApplications } from "../../services/paasHubService";
import { getMyAwsResources, getMyAzureResources } from "../../services/settingsService";
import { getGcpVms } from "../../services/cloudServicesService";
import { getCloudRunServices } from "../../services/containerServicesService";
import { getAccountRepositories, getRepoRunsBulk } from "../../services/githubService";
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
// GitHub Actions run history). Deliberately no fake week-over-week
// deltas ("+12 this week" style indicators) - this app keeps no
// historical snapshots to compute a real delta from, so none are shown
// rather than invented.
export default function OverviewStats() {

    const { githubTokenConfigured } = useAuth();

    const [stats, setStats] = useState(null);

    useEffect(() => {

        const calls = [
            getPaasApplications().catch(() => null),
            getMyAwsResources().catch(() => null),
            getMyAzureResources().catch(() => null),
            getGcpVms().catch(() => null),
            getCloudRunServices().catch(() => null)
        ];

        const runsPromise = githubTokenConfigured
            ? getAccountRepositories()
                .then((response) => {
                    const repos = (Array.isArray(response.data) ? response.data : []).slice(0, 100);
                    if (repos.length === 0) return {};
                    return getRepoRunsBulk(repos.map((r) => ({ owner: r.owner, repo: r.name }))).then((r) => r.data || {});
                })
                .catch(() => ({}))
            : Promise.resolve({});

        Promise.all([...calls, runsPromise]).then(([paas, aws, azure, gcpVms, cloudRun, runsByRepo]) => {

            const awsCount = sumAwsCounts(aws);
            const azureCount = sumAzureCounts(azure);
            const gcpCount = gcpVms?.configured ? (gcpVms.instances?.length || 0) + (cloudRun?.services?.length || 0) : null;

            const allRuns = Object.values(runsByRepo || {}).flat();
            const activeDeployments = githubTokenConfigured
                ? allRuns.filter((r) => r.status === "in_progress" || r.status === "queued").length
                : null;

            let openIssues = allRuns.filter((r) => r.conclusion === "failure").length;
            if (aws?.error) openIssues += 1;
            if (azure?.error) openIssues += 1;
            if (gcpVms?.error) openIssues += 1;

            setStats({
                totalApplications: paas?.applications?.length ?? null,
                awsCount, azureCount, gcpCount,
                activeDeployments, openIssues
            });

        });

    }, [githubTokenConfigured]);

    if (!stats) {
        return null;
    }

    const tiles = [
        stats.totalApplications != null && { key: "apps", label: "PaaS Applications", value: stats.totalApplications },
        stats.awsCount != null && { key: "aws", label: "AWS Resources", value: stats.awsCount },
        stats.azureCount != null && { key: "azure", label: "Azure Resources", value: stats.azureCount },
        stats.gcpCount != null && { key: "gcp", label: "GCP Resources", value: stats.gcpCount },
        stats.activeDeployments != null && {
            key: "active", label: "Active Deployments", value: stats.activeDeployments,
            tone: stats.activeDeployments > 0 ? "good" : "default"
        },
        {
            key: "issues", label: "Open Issues", value: stats.openIssues,
            tone: stats.openIssues > 0 ? "critical" : "good",
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

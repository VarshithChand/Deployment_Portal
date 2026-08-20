import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import useGithubDeploymentActivity from "../../hooks/useGithubDeploymentActivity";
import useAzureDevOpsStatus from "../../hooks/useAzureDevOpsStatus";
import { GitHubGroupIcon, AzureDevOpsIcon } from "../layout/SidebarIcons";

// Source Control's own "one container" glance, same tile shape as
// PaasSummaryCard.jsx - what used to live only inside the large
// AllRepositoriesCard (a full repo browser, not a glance) now also gets
// a compact summary alongside every other integrated area's own card
// (Cloud Services, PaaS, Container Registry, Code Quality,
// Observability). Every number here rides the exact same shared hooks
// those repo/activity cards already use - no new fetches.
export default function SourceControlSummaryCard() {

    const { githubTokenConfigured } = useAuth();
    const { setTab } = useNavigation();

    const github = useGithubDeploymentActivity(githubTokenConfigured);
    const azureDevOps = useAzureDevOpsStatus();

    if (!githubTokenConfigured && !azureDevOps.configured) {
        return null;
    }

    const activeRuns = (github.runs || []).filter((r) => r.status === "in_progress" || r.status === "queued").length;

    const tiles = [
        githubTokenConfigured && {
            key: "github", label: "GitHub", tab: "deploy", Icon: GitHubGroupIcon,
            count: github.repoCount, sublabel: activeRuns > 0 ? `${activeRuns} running` : "repositories"
        },
        azureDevOps.configured && {
            key: "azuredevops", label: "Azure DevOps", tab: "azureDevOpsPipelines", Icon: AzureDevOpsIcon,
            count: null, sublabel: "Connected"
        }
    ].filter(Boolean);

    return (

        <div className="card">

            <h2 className="card-title">Source Control</h2>

            <div className="aws-service-grid">

                {tiles.map((tile) => (

                    <button key={tile.key} type="button" className="aws-service-tile aws-service-tile-clickable" onClick={() => setTab(tile.tab)}>

                        <div className="aws-service-tile-header">
                            <span>{tile.label}</span>
                            {tile.count != null && <span className="badge badge-success">{tile.count}</span>}
                        </div>

                        <p className="field-hint" style={{ margin: 0 }}>{tile.sublabel}</p>

                    </button>

                ))}

            </div>

        </div>

    );

}

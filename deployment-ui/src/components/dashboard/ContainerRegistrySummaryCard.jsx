import useNavigation from "../../hooks/useNavigation";
import useCloudProviderStatus from "../../hooks/useCloudProviderStatus";
import useContainerRegistryStatus from "../../hooks/useContainerRegistryStatus";
import {
    EcrIcon, AcrIcon, ArtifactRegistryIcon, DockerHubIcon, GhcrIcon,
    GitLabRegistryIcon, JfrogIcon, HarborIcon, NexusIcon
} from "../layout/SidebarIcons";

// ecr/acr/artifactRegistry piggyback on the aws/azure/gcp credential
// status respectively rather than their own status call - same
// convention QuickAccessCard.jsx's own ITEMS list already uses, since
// the same credential backs both.
const ITEMS = [
    { key: "aws", label: "AWS ECR", tab: "ecr", Icon: EcrIcon },
    { key: "azure", label: "Azure ACR", tab: "acr", Icon: AcrIcon },
    { key: "gcp", label: "GCP Artifact Registry", tab: "artifactRegistry", Icon: ArtifactRegistryIcon },
    { key: "dockerhub", label: "Docker Hub", tab: "dockerHub", Icon: DockerHubIcon },
    { key: "ghcr", label: "GHCR", tab: "ghcr", Icon: GhcrIcon },
    { key: "gitlab-registry", label: "GitLab Registry", tab: "gitlabRegistry", Icon: GitLabRegistryIcon },
    { key: "jfrog", label: "JFrog Artifactory", tab: "jfrog", Icon: JfrogIcon },
    { key: "harbor", label: "Harbor", tab: "harbor", Icon: HarborIcon },
    { key: "nexus", label: "Nexus", tab: "nexus", Icon: NexusIcon }
];

// Container Registry's own slice of the Dashboard - same shape as
// CloudServicesCard's own "hide if nothing configured" convention, not
// QuickAccessCard's "always show, with an empty state" one, since this
// is a provider-integration summary like Cloud Services/PaaS rather
// than a standing navigation aid. AWS/Azure/GCP status comes from the
// shared, deduped useCloudProviderStatus hook; the 6 standalone
// registries come from useContainerRegistryStatus - both shared with
// QuickAccessCard, which used to fire these same 9 calls a second time.
export default function ContainerRegistrySummaryCard() {

    const { setTab } = useNavigation();
    const { awsConfigured, azureConfigured, gcpConfigured, loading: cloudLoading } = useCloudProviderStatus();
    const { status: standaloneStatus, loading } = useContainerRegistryStatus();

    if (loading || cloudLoading) {
        return null;
    }

    const status = { aws: awsConfigured, azure: azureConfigured, gcp: gcpConfigured, ...standaloneStatus };

    const visible = ITEMS.filter((item) => status[item.key]);

    if (visible.length === 0) {
        return null;
    }

    return (

        <div className="card">

            <h2 className="card-title">Container Registry</h2>

            <div className="quick-access-grid">

                {visible.map((item) => (

                    <button key={item.tab} type="button" className="quick-access-tile" onClick={() => setTab(item.tab)}>
                        <span className="quick-access-tile-icon"><item.Icon /></span>
                        <span className="quick-access-tile-label">{item.label}</span>
                    </button>

                ))}

            </div>

        </div>

    );

}

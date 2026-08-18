import { useEffect, useState } from "react";

import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import { getMyAwsSettings, getMyAzureSettings, getMyGcpSettings } from "../../services/settingsService";
import { getAzureDevOpsStatus } from "../../services/azureDevOpsService";
import { getSonarStatus } from "../../services/sonarService";
import {
    getDockerHubStatus, getGhcrStatus, getGitLabRegistryStatus, getJfrogStatus, getHostRegistryStatus
} from "../../services/containerRegistryService";
import {
    DeployIcon, AzureDevOpsIcon, AwsCloudIcon, AzureCloudIcon, GcpCloudIcon,
    EcrIcon, AcrIcon, ArtifactRegistryIcon, DockerHubIcon, GhcrIcon,
    GitLabRegistryIcon, JfrogIcon, HarborIcon, NexusIcon, SonarQubeIcon, SonarCloudIcon
} from "../layout/SidebarIcons";

// Every credential-backed page in this portal, in one place - by explicit
// request, so a visitor with several providers connected doesn't have to
// dig through the Sidebar's own nested groups (Source Control > Azure
// DevOps, Container Registry > ..., Code Quality > ...) to reach the one
// they actually want. Only ITEMS whose `configured` resolves true ever
// render a tile - this is deliberately an index of what's already
// connected, not a promotional list of every integration this portal
// supports (that's what Settings → Credentials' own tab row is for).
//
// ecr/acr/artifactRegistry piggyback on the aws/azure/gcp credential
// status respectively rather than their own status call - same
// credential backs all three (see the Container Registry hub's own ECR/
// ACR/Artifact Registry pages), so a separate fetch would just re-ask a
// question already answered.
const ITEMS = [
    { key: "github", label: "GitHub Deploy", tab: "deploy", Icon: DeployIcon },
    { key: "azureDevOps", label: "Azure DevOps", tab: "azureDevOpsPipelines", Icon: AzureDevOpsIcon },
    { key: "aws", label: "AWS", tab: "cloudServicesAws", Icon: AwsCloudIcon },
    { key: "azure", label: "Azure", tab: "cloudServicesAzure", Icon: AzureCloudIcon },
    { key: "gcp", label: "GCP", tab: "cloudServicesGcp", Icon: GcpCloudIcon },
    { key: "aws", label: "AWS ECR", tab: "ecr", Icon: EcrIcon },
    { key: "azure", label: "Azure ACR", tab: "acr", Icon: AcrIcon },
    { key: "gcp", label: "GCP Artifact Registry", tab: "artifactRegistry", Icon: ArtifactRegistryIcon },
    { key: "dockerhub", label: "Docker Hub", tab: "dockerHub", Icon: DockerHubIcon },
    { key: "ghcr", label: "GHCR", tab: "ghcr", Icon: GhcrIcon },
    { key: "gitlab-registry", label: "GitLab Registry", tab: "gitlabRegistry", Icon: GitLabRegistryIcon },
    { key: "jfrog", label: "JFrog Artifactory", tab: "jfrog", Icon: JfrogIcon },
    { key: "harbor", label: "Harbor", tab: "harbor", Icon: HarborIcon },
    { key: "nexus", label: "Nexus", tab: "nexus", Icon: NexusIcon },
    { key: "sonarqube", label: "SonarQube", tab: "codeQuality", Icon: SonarQubeIcon },
    { key: "sonarcloud", label: "SonarCloud", tab: "sonarcloud", Icon: SonarCloudIcon }
];

export default function QuickAccessCard() {

    const { githubTokenConfigured } = useAuth();
    const { setTab } = useNavigation();

    const [remoteStatus, setRemoteStatus] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        Promise.all([
            getMyAwsSettings().catch(() => null),
            getMyAzureSettings().catch(() => null),
            getMyGcpSettings().catch(() => null),
            getAzureDevOpsStatus().catch(() => null),
            getDockerHubStatus().catch(() => null),
            getGhcrStatus().catch(() => null),
            getGitLabRegistryStatus().catch(() => null),
            getJfrogStatus().catch(() => null),
            getHostRegistryStatus("harbor").catch(() => null),
            getHostRegistryStatus("nexus").catch(() => null),
            getSonarStatus("sonarqube").catch(() => null),
            getSonarStatus("sonarcloud").catch(() => null)
        ]).then(([aws, azure, gcp, azureDevOps, dockerhub, ghcr, gitlabRegistry, jfrog, harbor, nexus, sonarqube, sonarcloud]) => {

            setRemoteStatus({
                aws: aws?.configured,
                azure: azure?.configured,
                gcp: gcp?.configured,
                azureDevOps: azureDevOps?.configured,
                dockerhub: dockerhub?.configured,
                ghcr: ghcr?.configured,
                "gitlab-registry": gitlabRegistry?.configured,
                jfrog: jfrog?.configured,
                harbor: harbor?.configured,
                nexus: nexus?.configured,
                sonarqube: sonarqube?.configured,
                sonarcloud: sonarcloud?.configured
            });

            setLoading(false);

        });

    }, []);

    const configuredByKey = { github: githubTokenConfigured, ...remoteStatus };

    const visibleItems = ITEMS.filter((item) => configuredByKey[item.key]);

    return (

        <div className="card">

            <h2 className="card-title">Quick Access</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Every page you've already connected a credential for - jump straight in.
            </p>

            {loading ? (

                <p className="empty-state" style={{ minHeight: "60px" }}>Checking connected integrations...</p>

            ) : visibleItems.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left" }}>
                    Nothing connected yet — head to{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>Settings → Credentials</a>
                    {" "}to connect your first provider.
                </p>

            ) : (

                <div className="quick-access-grid">

                    {visibleItems.map((item) => (

                        <button
                            key={item.tab}
                            type="button"
                            className="quick-access-tile"
                            onClick={() => setTab(item.tab)}
                        >
                            <span className="quick-access-tile-icon"><item.Icon /></span>
                            <span className="quick-access-tile-label">{item.label}</span>
                        </button>

                    ))}

                </div>

            )}

        </div>

    );

}

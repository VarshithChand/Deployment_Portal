import { useEffect, useState } from "react";

import { getMyAwsSettings, getMyAzureSettings, getMyGcpSettings } from "../../services/settingsService";
import {
    getDockerHubStatus, getGhcrStatus, getGitLabRegistryStatus, getJfrogStatus, getHostRegistryStatus
} from "../../services/containerRegistryService";
import useNavigation from "../../hooks/useNavigation";
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
// than a standing navigation aid. Reuses the exact same lightweight
// status calls QuickAccessCard.jsx already makes for these 9 providers -
// no new backend endpoint, no new frontend service functions.
export default function ContainerRegistrySummaryCard() {

    const { setTab } = useNavigation();

    const [status, setStatus] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        Promise.all([
            getMyAwsSettings().catch(() => null),
            getMyAzureSettings().catch(() => null),
            getMyGcpSettings().catch(() => null),
            getDockerHubStatus().catch(() => null),
            getGhcrStatus().catch(() => null),
            getGitLabRegistryStatus().catch(() => null),
            getJfrogStatus().catch(() => null),
            getHostRegistryStatus("harbor").catch(() => null),
            getHostRegistryStatus("nexus").catch(() => null)
        ]).then(([aws, azure, gcp, dockerhub, ghcr, gitlabRegistry, jfrog, harbor, nexus]) => {

            setStatus({
                aws: aws?.configured,
                azure: azure?.configured,
                gcp: gcp?.configured,
                dockerhub: dockerhub?.configured,
                ghcr: ghcr?.configured,
                "gitlab-registry": gitlabRegistry?.configured,
                jfrog: jfrog?.configured,
                harbor: harbor?.configured,
                nexus: nexus?.configured
            });

            setLoading(false);

        });

    }, []);

    if (loading) {
        return null;
    }

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

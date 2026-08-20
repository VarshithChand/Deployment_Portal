import { useEffect, useState } from "react";

import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import useCloudProviderStatus from "../../hooks/useCloudProviderStatus";
import useContainerRegistryStatus from "../../hooks/useContainerRegistryStatus";
import useSonarStatus from "../../hooks/useSonarStatus";
import useAzureDevOpsStatus from "../../hooks/useAzureDevOpsStatus";
import { getSettings } from "../../services/settingsService";
import { getMyApiKeys } from "../../services/securityService";
import { getPaasStatus } from "../../services/paasService";
import {
    DeployIcon, AzureDevOpsIcon, AwsCloudIcon, AzureCloudIcon, GcpCloudIcon,
    EcrIcon, AcrIcon, ArtifactRegistryIcon, DockerHubIcon, GhcrIcon,
    GitLabRegistryIcon, JfrogIcon, HarborIcon, NexusIcon, SonarQubeIcon, SonarCloudIcon,
    HostingProvidersIcon, SettingsIcon, DockerIcon
} from "../layout/SidebarIcons";

// Every credential-backed resource in this portal, in one place - by
// explicit request ("all the resources what i had configured", except
// Screen Lock and AI Assistant, neither of which is a "resource" with
// anything to browse). A visitor with several providers connected
// shouldn't have to dig through the Sidebar's own nested groups (Source
// Control > Azure DevOps, Container Registry > ..., Code Quality > ...)
// or Settings' own tab row to reach the one they actually want. Only
// ITEMS whose `configured` resolves true ever render a tile - this stays
// an index of what's already connected, not a promotional list of every
// integration this portal supports.
//
// Two kinds of target:
//   - `tab`: a real, independently-navigable page (setTab straight there).
//   - `credentialMode`: no dedicated page exists for this one (Render/
//     Cloudflare/Netlify/Vercel/API Key/Docker/GitHub OAuth all only ever
//     show their own status inside Settings → Credentials' own tab row -
//     see CredentialsView.jsx) - goToCredential lands directly on that
//     provider's own tab there instead of just the Settings hub.
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
    { key: "sonarcloud", label: "SonarCloud", tab: "sonarcloud", Icon: SonarCloudIcon },
    { key: "render", label: "Render", credentialMode: "render", Icon: HostingProvidersIcon },
    { key: "cloudflare", label: "Cloudflare", credentialMode: "cloudflare", Icon: HostingProvidersIcon },
    { key: "netlify", label: "Netlify", credentialMode: "netlify", Icon: HostingProvidersIcon },
    { key: "vercel", label: "Vercel", credentialMode: "vercel", Icon: HostingProvidersIcon },
    { key: "apikey", label: "API Key", credentialMode: "apikey", Icon: SettingsIcon },
    { key: "docker", label: "Docker Registry", credentialMode: "docker", Icon: DockerIcon },
    { key: "oauth", label: "GitHub OAuth", credentialMode: "oauth", Icon: SettingsIcon }
];

export default function QuickAccessCard() {

    const { githubTokenConfigured } = useAuth();
    const { setTab, goToCredential } = useNavigation();
    const { awsConfigured, azureConfigured, gcpConfigured, loading: cloudLoading } = useCloudProviderStatus();
    const { status: registryStatus, loading: registryLoading } = useContainerRegistryStatus();
    const { status: sonarStatus, loading: sonarLoading } = useSonarStatus();
    const { configured: azureDevOpsConfigured, loading: azureDevOpsLoading } = useAzureDevOpsStatus();

    const [remoteStatus, setRemoteStatus] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        Promise.all([
            getSettings().catch(() => null),
            getMyApiKeys().catch(() => null),
            getPaasStatus("render").catch(() => null),
            getPaasStatus("cloudflare").catch(() => null),
            getPaasStatus("netlify").catch(() => null),
            getPaasStatus("vercel").catch(() => null)
        ]).then(([settings, apiKeysRes, render, cloudflare, netlify, vercel]) => {

            const activeKeyCount = Array.isArray(apiKeysRes?.data)
                ? apiKeysRes.data.filter((k) => !k.revoked).length
                : 0;

            setRemoteStatus({
                apikey: activeKeyCount > 0,
                docker: !!settings?.dockerPasswordConfigured,
                oauth: !!settings?.gitHubOAuthClientId && !!settings?.gitHubOAuthClientSecretConfigured,
                render: render?.configured,
                cloudflare: cloudflare?.configured,
                netlify: netlify?.configured,
                vercel: vercel?.configured
            });

            setLoading(false);

        });

    }, []);

    const configuredByKey = {
        github: githubTokenConfigured,
        aws: awsConfigured, azure: azureConfigured, gcp: gcpConfigured,
        azureDevOps: azureDevOpsConfigured,
        ...registryStatus,
        ...sonarStatus,
        ...remoteStatus
    };

    const isLoading = loading || cloudLoading || registryLoading || sonarLoading || azureDevOpsLoading;

    const visibleItems = ITEMS.filter((item) => configuredByKey[item.key]);

    function openItem(item) {

        if (item.credentialMode) {
            goToCredential(item.credentialMode);
            return;
        }

        setTab(item.tab);

    }

    return (

        <div className="card">

            <h2 className="card-title">Quick Access</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Every resource you've already connected a credential for - jump straight in.
            </p>

            {isLoading ? (

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
                            key={item.tab || item.credentialMode}
                            type="button"
                            className="quick-access-tile"
                            onClick={() => openItem(item)}
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

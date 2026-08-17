import { useCallback, useEffect, useState } from "react";

import PageLayout from "../components/layout/PageLayout";
import LoadingSpinner from "../components/LoadingSpinner";
import EcrView from "../components/containerRegistry/EcrView";
import AcrView from "../components/containerRegistry/AcrView";
import ArtifactRegistryView from "../components/containerRegistry/ArtifactRegistryView";
import DockerHubView from "../components/containerRegistry/DockerHubView";
import GhcrView from "../components/containerRegistry/GhcrView";
import useNavigation from "../hooks/useNavigation";
import { getMyAwsSettings, getMyAzureSettings, getMyGcpSettings } from "../services/settingsService";
import { getDockerHubStatus, getGhcrStatus } from "../services/containerRegistryService";

const VIEWS = ["ecr", "acr", "artifactRegistry", "dockerHub", "ghcr"];

// The 3 cloud-native registries auto-enable from credentials this portal
// already has (AWS/Azure/GCP - see each provider's own Settings →
// Credentials tab). Docker Hub and GHCR auto-enable from a portal-wide
// shared credential instead (see Settings → Credentials → Docker Hub/GHCR)
// - one admin connects each once, every visitor then sees the same
// repositories/packages. The remaining 4 are shown so the whole picture is
// visible at a glance, but aren't built yet - a later fast-follow, each
// needing its own brand-new credential model and API integration from
// scratch (confirmed scope decision, see the plan this feature shipped from).
const PROVIDERS = [
    { key: "ecr", label: "AWS ECR", credentialKey: "aws", credentialLabel: "AWS", view: "ecr" },
    { key: "acr", label: "Azure ACR", credentialKey: "azure", credentialLabel: "Azure", view: "acr" },
    { key: "artifactRegistry", label: "Artifact Registry", credentialKey: "gcp", credentialLabel: "GCP", view: "artifactRegistry" },
    { key: "dockerHub", label: "Docker Hub", credentialKey: "dockerhub", credentialLabel: "Docker Hub", view: "dockerHub", portalWide: true },
    { key: "ghcr", label: "GHCR", credentialKey: "ghcr", credentialLabel: "GHCR", view: "ghcr", portalWide: true },
    { key: "gitlabRegistry", label: "GitLab Registry", comingSoon: true },
    { key: "jfrog", label: "JFrog Artifactory", comingSoon: true },
    { key: "harbor", label: "Harbor", comingSoon: true },
    { key: "nexus", label: "Nexus", comingSoon: true }
];

function readViewFromUrl() {

    const requested = new URLSearchParams(window.location.search).get("view");

    return VIEWS.includes(requested) ? requested : null;

}

// One hub for every container image registry a team might use - each
// tile enables the moment the credentials it needs exist. The 3 cloud-
// native registries (ECR/ACR/Artifact Registry) reuse this portal's
// existing session-scoped AWS/Azure/GCP credentials (see Settings →
// Credentials) - nothing new to connect if those are already set up for
// Cloud Services/Environments. Own "?view=" sub-nav, local replaceState,
// same pattern as PaasHosting.jsx/Settings.jsx/Services.jsx (siblings,
// not a drill-down).
export default function ContainerRegistry() {

    const { setTab } = useNavigation();

    const [view, setViewState] = useState(readViewFromUrl);
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    const setView = useCallback((next) => {

        setViewState(next);

        const url = new URL(window.location.href);

        if (next) {
            url.searchParams.set("view", next);
        }
        else {
            url.searchParams.delete("view");
        }

        window.history.replaceState(null, "", url);

    }, []);

    useEffect(() => {

        Promise.all([
            getMyAwsSettings().catch(() => null),
            getMyAzureSettings().catch(() => null),
            getMyGcpSettings().catch(() => null),
            getDockerHubStatus().catch(() => null),
            getGhcrStatus().catch(() => null)
        ]).then(([aws, azure, gcp, dockerhub, ghcr]) => {

            setStatus({
                aws: !!aws?.configured,
                azure: !!azure?.configured,
                gcp: !!gcp?.configured,
                dockerhub: !!dockerhub?.configured,
                ghcr: !!ghcr?.configured
            });
            setLoading(false);

        });

    }, []);

    if (loading) {
        return <LoadingSpinner />;
    }

    if (view) {

        const provider = PROVIDERS.find((p) => p.view === view);

        return (

            <PageLayout
                title="Container Registry"
                actions={
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setView(null)}>
                        ← All Registries
                    </button>
                }
            >

                <h2 style={{ marginTop: 0 }}>{provider?.label}</h2>

                {view === "ecr" && <EcrView />}
                {view === "acr" && <AcrView />}
                {view === "artifactRegistry" && <ArtifactRegistryView />}
                {view === "dockerHub" && <DockerHubView />}
                {view === "ghcr" && <GhcrView />}

            </PageLayout>

        );

    }

    return (

        <PageLayout title="Container Registry">

            <p className="field-hint" style={{ marginBottom: "18px" }}>
                Browse every registry this portal can reach. AWS ECR, Azure ACR, and GCP
                Artifact Registry connect using your own AWS/Azure/GCP credentials from{" "}
                <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>Settings → Credentials</a> —
                nothing new to set up if you already use those for Cloud Services or Environments.
                Docker Hub and GHCR connect using one shared credential an admin sets up
                once for the whole portal. GitLab Registry, JFrog, Harbor, and Nexus are on the way.
            </p>

            <div className="settings-hub">

                {PROVIDERS.map((p) => {

                    const configured = !p.comingSoon && status[p.credentialKey];
                    const enabled = !p.comingSoon && configured;

                    return (

                        <button
                            key={p.key}
                            type="button"
                            className="settings-hub-tile"
                            disabled={!enabled}
                            style={enabled ? undefined : { opacity: 0.55, cursor: "not-allowed" }}
                            onClick={() => enabled && setView(p.view)}
                        >
                            <h2>
                                {p.label}
                                {" "}
                                {p.comingSoon ? (
                                    <span className="badge badge-secondary">Coming soon</span>
                                ) : (
                                    <span className={`badge ${configured ? "badge-success" : "badge-warning"}`}>
                                        {configured ? "Connected" : "Not connected"}
                                    </span>
                                )}
                            </h2>

                            <p>
                                {p.comingSoon
                                    ? "Not built yet — coming in a later update."
                                    : configured
                                        ? p.portalWide
                                            ? "Browse repositories using this portal's shared credential."
                                            : `Browse repositories and images using your connected ${p.credentialLabel} credentials.`
                                        : p.portalWide
                                            ? `An admin needs to connect ${p.credentialLabel} in Settings → Credentials to enable this for everyone.`
                                            : `Connect your ${p.credentialLabel} credentials in Settings → Credentials to enable this.`}
                            </p>
                        </button>

                    );

                })}

            </div>

        </PageLayout>

    );

}

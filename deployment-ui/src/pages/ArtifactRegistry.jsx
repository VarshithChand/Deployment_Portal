import PageLayout from "../components/layout/PageLayout";
import ArtifactRegistryView from "../components/containerRegistry/ArtifactRegistryView";

// Reuses this session's own GCP credentials (Settings → Credentials → GCP,
// including a Location) - self-service, no admin gate.
export default function ArtifactRegistry() {

    return (

        <PageLayout title="Artifact Registry">
            <ArtifactRegistryView />
        </PageLayout>

    );

}

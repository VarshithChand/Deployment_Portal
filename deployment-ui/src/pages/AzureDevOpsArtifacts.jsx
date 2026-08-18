import PageLayout from "../components/layout/PageLayout";
import AzureDevOpsArtifactsView from "../components/sourceControl/AzureDevOpsArtifactsView";

// Session-scoped credential (Settings → Credentials → Azure DevOps) - each
// visitor connects their own, isolated from every other visitor.
export default function AzureDevOpsArtifacts() {

    return (

        <PageLayout title="Azure DevOps Build Artifacts">
            <AzureDevOpsArtifactsView />
        </PageLayout>

    );

}

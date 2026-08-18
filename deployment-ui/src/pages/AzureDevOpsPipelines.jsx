import PageLayout from "../components/layout/PageLayout";
import AzureDevOpsPipelinesView from "../components/sourceControl/AzureDevOpsPipelinesView";

// Session-scoped credential (Settings → Credentials → Azure DevOps) - each
// visitor connects their own, isolated from every other visitor. View-only:
// lists pipelines and recent run status/history, no trigger action.
export default function AzureDevOpsPipelines() {

    return (

        <PageLayout title="Azure DevOps Pipelines">
            <AzureDevOpsPipelinesView />
        </PageLayout>

    );

}

import PageLayout from "../components/layout/PageLayout";
import AzureDevOpsFeedsView from "../components/sourceControl/AzureDevOpsFeedsView";

// Session-scoped credential (Settings → Credentials → Azure DevOps) - each
// visitor connects their own, isolated from every other visitor.
export default function AzureDevOpsFeeds() {

    return (

        <PageLayout title="Azure DevOps Package Feeds">
            <AzureDevOpsFeedsView />
        </PageLayout>

    );

}

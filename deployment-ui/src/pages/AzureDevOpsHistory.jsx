import PageLayout from "../components/layout/PageLayout";
import AzureDevOpsHistoryView from "../components/sourceControl/AzureDevOpsHistoryView";

// Session-scoped credential (Settings → Credentials → Azure DevOps) - each
// visitor connects their own, isolated from every other visitor. Read-only:
// every run across every pipeline in the project picked on the Dashboard
// sub-page (see AzureDevOpsProjectContext).
export default function AzureDevOpsHistory() {

    return (

        <PageLayout title="Azure DevOps History">
            <AzureDevOpsHistoryView />
        </PageLayout>

    );

}

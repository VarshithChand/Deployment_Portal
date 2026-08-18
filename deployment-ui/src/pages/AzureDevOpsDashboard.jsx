import PageLayout from "../components/layout/PageLayout";
import AzureDevOpsDashboardView from "../components/sourceControl/AzureDevOpsDashboardView";

// Pick a project here once - it applies across every other Azure DevOps
// sub-page that needs one (see AzureDevOpsProjectContext.jsx).
export default function AzureDevOpsDashboard() {

    return (

        <PageLayout title="Azure DevOps Dashboard">
            <AzureDevOpsDashboardView />
        </PageLayout>

    );

}

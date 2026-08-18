import PageLayout from "../components/layout/PageLayout";
import AzureDevOpsPullRequestsView from "../components/sourceControl/AzureDevOpsPullRequestsView";

// Session-scoped credential (Settings → Credentials → Azure DevOps) - each
// visitor connects their own, isolated from every other visitor. Approve/
// complete are real mutating actions against that credential's own real
// permission on Azure DevOps' side, each behind their own confirm step.
export default function AzureDevOpsPullRequests() {

    return (

        <PageLayout title="Azure DevOps Pull Requests">
            <AzureDevOpsPullRequestsView />
        </PageLayout>

    );

}

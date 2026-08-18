import PageLayout from "../components/layout/PageLayout";
import AzureDevOpsBranchesView from "../components/sourceControl/AzureDevOpsBranchesView";

// Session-scoped credential (Settings → Credentials → Azure DevOps) - each
// visitor connects their own, isolated from every other visitor.
export default function AzureDevOpsBranches() {

    return (

        <PageLayout title="Azure DevOps Branches">
            <AzureDevOpsBranchesView />
        </PageLayout>

    );

}

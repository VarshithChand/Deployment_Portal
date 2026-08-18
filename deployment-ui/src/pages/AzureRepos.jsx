import PageLayout from "../components/layout/PageLayout";
import AzureReposView from "../components/sourceControl/AzureReposView";

// Portal-wide shared credential (Settings → Credentials → Azure Repos) -
// one admin connects it once, every visitor browses the same repositories.
export default function AzureRepos() {

    return (

        <PageLayout title="Azure Repos">
            <AzureReposView />
        </PageLayout>

    );

}

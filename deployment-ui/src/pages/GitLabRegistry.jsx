import PageLayout from "../components/layout/PageLayout";
import GitLabRegistryView from "../components/containerRegistry/GitLabRegistryView";

// Portal-wide shared credential (Settings → Credentials → GitLab Registry)
// - one admin connects it once, every visitor browses the same repositories.
export default function GitLabRegistry() {

    return (

        <PageLayout title="GitLab Registry">
            <GitLabRegistryView />
        </PageLayout>

    );

}

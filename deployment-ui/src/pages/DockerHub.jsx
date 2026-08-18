import PageLayout from "../components/layout/PageLayout";
import DockerHubView from "../components/containerRegistry/DockerHubView";

// Portal-wide shared credential (Settings → Credentials → Docker Hub) - one
// admin connects it once, every visitor browses the same repositories.
export default function DockerHub() {

    return (

        <PageLayout title="Docker Hub">
            <DockerHubView />
        </PageLayout>

    );

}

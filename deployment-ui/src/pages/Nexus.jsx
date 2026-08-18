import PageLayout from "../components/layout/PageLayout";
import NexusView from "../components/containerRegistry/NexusView";

// Portal-wide shared credential (Settings → Credentials → Nexus) - one
// admin connects it once, every visitor browses the same repositories.
export default function Nexus() {

    return (

        <PageLayout title="Nexus">
            <NexusView />
        </PageLayout>

    );

}

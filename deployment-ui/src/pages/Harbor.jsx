import PageLayout from "../components/layout/PageLayout";
import HarborView from "../components/containerRegistry/HarborView";

// Portal-wide shared credential (Settings → Credentials → Harbor) - one
// admin connects it once, every visitor browses the same projects.
export default function Harbor() {

    return (

        <PageLayout title="Harbor">
            <HarborView />
        </PageLayout>

    );

}

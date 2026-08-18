import PageLayout from "../components/layout/PageLayout";
import JfrogView from "../components/containerRegistry/JfrogView";

// Portal-wide shared credential (Settings → Credentials → JFrog) - one
// admin connects it once, every visitor browses the same repositories.
export default function Jfrog() {

    return (

        <PageLayout title="JFrog Artifactory">
            <JfrogView />
        </PageLayout>

    );

}

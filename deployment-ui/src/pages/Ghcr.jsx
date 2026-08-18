import PageLayout from "../components/layout/PageLayout";
import GhcrView from "../components/containerRegistry/GhcrView";

// Portal-wide shared credential (Settings → Credentials → GHCR) - one
// admin connects it once, every visitor browses the same packages.
export default function Ghcr() {

    return (

        <PageLayout title="GHCR">
            <GhcrView />
        </PageLayout>

    );

}

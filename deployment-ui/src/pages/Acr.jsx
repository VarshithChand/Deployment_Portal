import PageLayout from "../components/layout/PageLayout";
import AcrView from "../components/containerRegistry/AcrView";

// Reuses this session's own Azure credentials (Settings → Credentials →
// Azure, including a Subscription ID) - self-service, no admin gate.
export default function Acr() {

    return (

        <PageLayout title="Azure ACR">
            <AcrView />
        </PageLayout>

    );

}

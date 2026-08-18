import PageLayout from "../components/layout/PageLayout";
import EcrView from "../components/containerRegistry/EcrView";

// Reuses this session's own AWS credentials (Settings → Credentials → AWS)
// - self-service, no admin gate, same posture as Cloud Services.
export default function Ecr() {

    return (

        <PageLayout title="AWS ECR">
            <EcrView />
        </PageLayout>

    );

}

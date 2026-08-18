import PageLayout from "../components/layout/PageLayout";
import CodeCommitView from "../components/sourceControl/CodeCommitView";

// Reuses this session's own AWS credentials (Settings → Credentials → AWS)
// - self-service, no admin gate, same posture as ECR.
export default function CodeCommit() {

    return (

        <PageLayout title="AWS CodeCommit">
            <CodeCommitView />
        </PageLayout>

    );

}

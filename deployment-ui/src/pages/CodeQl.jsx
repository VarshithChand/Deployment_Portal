import PageLayout from "../components/layout/PageLayout";
import CodeQlView from "../components/codeQuality/CodeQlView";

// No dedicated credential/admin gate - reuses this session's already-
// connected GitHub token, same open posture as Artifacts/Analytics/History
// (see Sidebar.jsx's own comment on why this sits outside ADMIN_ONLY_TABS).
export default function CodeQl() {

    return (

        <PageLayout title="CodeQL">
            <CodeQlView />
        </PageLayout>

    );

}

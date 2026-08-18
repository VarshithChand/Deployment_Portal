import PageLayout from "../components/layout/PageLayout";
import PageAdminAccessButton from "../components/common/PageAdminAccessButton";
import SonarView from "../components/codeQuality/SonarView";

// The "SonarQube / SonarCloud" child of the Code Quality sidebar group
// (see Sidebar.jsx's own comment on why this keeps the "codeQuality" tab
// key/route rather than the group taking it - the existing backend admin
// gate and grantable-page-key list are both keyed on exactly that string).
// One combined page, not two - they're the same connection in this app
// (one Sonar Host URL/token form covers either a self-hosted SonarQube
// instance or sonarcloud.io).
export default function CodeQuality() {

    return (

        <PageLayout title="SonarQube / SonarCloud" actions={<PageAdminAccessButton pageKey="codeQuality" pageLabel="Code Quality" />}>
            <SonarView />
        </PageLayout>

    );

}

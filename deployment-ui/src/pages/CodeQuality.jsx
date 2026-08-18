import PageLayout from "../components/layout/PageLayout";
import PageAdminAccessButton from "../components/common/PageAdminAccessButton";
import SonarView from "../components/codeQuality/SonarView";

// The "SonarQube" child of the Code Quality sidebar group (see Sidebar.jsx's
// own comment on why this keeps the "codeQuality" tab key/route rather than
// the group taking it - the existing backend admin gate and grantable-
// page-key list are both keyed on exactly that string). SonarQube and
// SonarCloud are two fully independent credentials/pages now (see
// pages/SonarCloud.jsx for the other one) - split per explicit request.
export default function CodeQuality() {

    return (

        <PageLayout title="SonarQube" actions={<PageAdminAccessButton pageKey="codeQuality" pageLabel="Code Quality" />}>
            <SonarView provider="sonarqube" />
        </PageLayout>

    );

}

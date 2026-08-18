import PageLayout from "../components/layout/PageLayout";
import PageAdminAccessButton from "../components/common/PageAdminAccessButton";
import SonarView from "../components/codeQuality/SonarView";

// SonarCloud's own page, independent of SonarQube's (see pages/CodeQuality.jsx
// and SettingsService.SaveSonarCredentialsAsync's own comment on the split).
// Reuses the same "codeQuality" grant/pageKey as SonarQube - both Sonar
// pages are still one grantable admin-access unit, just two separate
// credentials/data sources underneath now.
export default function SonarCloud() {

    return (

        <PageLayout title="SonarCloud" actions={<PageAdminAccessButton pageKey="codeQuality" pageLabel="Code Quality" />}>
            <SonarView provider="sonarcloud" />
        </PageLayout>

    );

}

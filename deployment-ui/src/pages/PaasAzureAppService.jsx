import PageLayout from "../components/layout/PageLayout";
import AzureAppServiceManagementPage from "../components/paas/AzureAppServiceManagementPage";

// PaaS/Microservices - Phase B's Azure child, same standalone-page
// pattern as PaasElasticBeanstalk.jsx's AWS child. The pre-existing
// Cloud Services -> Azure -> "App Service" catalog tile also renders
// this same AzureAppServiceManagementPage component (see
// AzureServiceDetailPage.jsx) rather than a duplicate - one real
// implementation, two entry points.
export default function PaasAzureAppService() {

    return (
        <PageLayout title="Azure App Service">
            <AzureAppServiceManagementPage />
        </PageLayout>
    );

}

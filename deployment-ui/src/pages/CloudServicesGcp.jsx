import PageLayout from "../components/layout/PageLayout";
import GcpVmManagementPage from "../components/cloudServices/GcpVmManagementPage";

// Phase 1 of the multi-cloud infrastructure console - Compute Engine is
// now real (list/start/stop/reset/delete, firewall, metrics - see
// GcpVmManagementPage.jsx). GCP still has no catalog beyond Compute
// Engine the way AWS's ~100-service page does - that's a later phase
// (Cloud Run - see the plan in security_findings.txt), not a guess added
// here.
export default function CloudServicesGcp() {

    return (

        <PageLayout title="GCP Services">
            <GcpVmManagementPage />
        </PageLayout>

    );

}

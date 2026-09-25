import PageLayout from "../components/layout/PageLayout";
import TerraformCredentialsSection from "../components/terraform/TerraformCredentialsSection";
import TerraformFilesSection from "../components/terraform/TerraformFilesSection";
import TerraformExecutionPanel from "../components/terraform/TerraformExecutionPanel";

// Standalone top-level sidebar page (not nested under Settings/
// Organizations) - a personal, self-service place for your own Azure
// Service Principal + .tf files, open to any logged-in user the same way
// Hosting Providers/Cloud Services are (own credential = own auth
// boundary, no admin gate). Credentials/Files are low-risk storage;
// TerraformExecutionPanel is the higher-risk real plan/apply - see
// TerraformController.cs's own header comment for the full reasoning.
export default function Terraform() {

    return (

        <PageLayout title="Terraform">

            <div className="card">

                <TerraformCredentialsSection />

                <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid var(--border)" }} />

                <TerraformFilesSection />

                <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid var(--border)" }} />

                <TerraformExecutionPanel />

            </div>

        </PageLayout>

    );

}

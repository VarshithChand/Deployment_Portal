import PageLayout from "../components/layout/PageLayout";
import TerraformCredentialsSection from "../components/terraform/TerraformCredentialsSection";
import TerraformFilesSection from "../components/terraform/TerraformFilesSection";

// Standalone top-level sidebar page (not nested under Settings/
// Organizations) - a personal, self-service place for your own Azure
// Service Principal + .tf files, open to any logged-in user the same way
// Hosting Providers/Cloud Services are (own credential = own auth
// boundary, no admin gate). See TerraformController.cs's own header
// comment: storage and editing only, no execution.
export default function Terraform() {

    return (

        <PageLayout title="Terraform">

            <div className="card">

                <TerraformCredentialsSection />

                <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid var(--border)" }} />

                <TerraformFilesSection />

            </div>

        </PageLayout>

    );

}

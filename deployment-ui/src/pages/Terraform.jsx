import { useCallback, useState } from "react";

import PageLayout from "../components/layout/PageLayout";
import TerraformCredentialsSection from "../components/terraform/TerraformCredentialsSection";
import TerraformProjectsList from "../components/terraform/TerraformProjectsList";
import TerraformProjectPage from "../components/terraform/TerraformProjectPage";

// Mirrors Settings.jsx's/PaasHosting.jsx's own "?project=" pattern, owned
// locally rather than by NavigationContext (which only owns the top-level
// "?tab="). pushState (not replaceState) since list -> project is a real
// drill-down a visitor would expect the browser Back button to undo.
function readProjectIdFromUrl() {
    return new URLSearchParams(window.location.search).get("project");
}

// Standalone top-level sidebar page (not nested under Settings/
// Organizations) - a personal, self-service place for your own Azure
// Service Principal + Terraform projects, open to any logged-in user the
// same way Hosting Providers/Cloud Services are (own credential = own auth
// boundary, no admin gate). Each uploaded folder is its own project - see
// TerraformProjectsList's own comment for why. See TerraformController.cs's
// own header comment for the full storage/execution reasoning.
export default function Terraform() {

    const [projectId, setProjectIdState] = useState(readProjectIdFromUrl);

    const openProject = useCallback((id) => {

        setProjectIdState(id);

        const url = new URL(window.location.href);
        url.searchParams.set("project", id);
        window.history.pushState(null, "", url);

    }, []);

    const backToList = useCallback(() => {

        setProjectIdState(null);

        const url = new URL(window.location.href);
        url.searchParams.delete("project");
        window.history.pushState(null, "", url);

    }, []);

    return (

        <PageLayout title="Terraform">

            <div className="card">

                {projectId ? (
                    <TerraformProjectPage projectId={projectId} onBack={backToList} onDeleted={backToList} />
                ) : (
                    <>
                        <TerraformProjectsList onOpenProject={openProject} />

                        <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid var(--border)" }} />

                        <TerraformCredentialsSection />
                    </>
                )}

            </div>

        </PageLayout>

    );

}

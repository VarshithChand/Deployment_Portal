import PageLayout from "../components/layout/PageLayout";
import CloudServicesCard from "../components/dashboard/CloudServicesCard";
import PaasSummaryCard from "../components/dashboard/PaasSummaryCard";

// Cloud Services' own landing page - previously the group header itself
// had nowhere to go (clicking it just expanded/collapsed its children).
// Reuses CloudServicesCard/PaasSummaryCard exactly as built for the
// portal Dashboard (same live AWS/Azure/GCP resource inventories, same
// PaaS application counts, same "hide if that provider isn't
// configured" rule) rather than a second copy of that content - this
// page is just those two cards with their own title, for anyone who
// wants the Cloud Services glance without scrolling the whole Dashboard
// to find it. PaaS/Microservices lives here too since it's now nested
// under Cloud Services in the sidebar, not a separate top-level group.
export default function CloudServicesOverview() {

    return (

        <PageLayout title="Cloud Services">

            <CloudServicesCard />

            <br />

            <PaasSummaryCard />

        </PageLayout>

    );

}

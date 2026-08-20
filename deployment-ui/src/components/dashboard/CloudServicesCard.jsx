import useCloudProviderStatus from "../../hooks/useCloudProviderStatus";
import AwsCloudSection from "./AwsCloudSection";
import AzureCloudSection from "./AzureCloudSection";
import GcpCloudSection from "./GcpCloudSection";

// One shared "Cloud Services" container for every cloud provider's
// Dashboard summary - replaces what used to be AWS's own standalone card
// (AwsServicesCard) sitting alone, by explicit request: no separate
// container per provider. Aws/Azure/GcpCloudSection each manage their
// own inventory fetch and hide themselves when that provider isn't
// configured; this component only needs a cheap, shared configured check
// for each (useCloudProviderStatus - deduped with every other Dashboard
// card asking the same question, see that hook's own comment) to decide
// whether the outer container itself is worth rendering at all - if no
// provider is configured, the whole card is hidden from the Dashboard
// rather than showing an empty "connect your credentials" placeholder.
// GCP now has a real summary (Compute Engine + Cloud Run counts) since
// the multi-cloud infrastructure console rounds built those out.
export default function CloudServicesCard() {

    const { awsConfigured, azureConfigured, gcpConfigured, loading } = useCloudProviderStatus();

    if (loading || (!awsConfigured && !azureConfigured && !gcpConfigured)) {
        return null;
    }

    return (

        <div className="card">

            <h2 className="card-title">Cloud Services</h2>

            {awsConfigured && <AwsCloudSection />}

            {awsConfigured && (azureConfigured || gcpConfigured) && <hr className="dashboard-section-divider" />}

            {azureConfigured && <AzureCloudSection />}

            {azureConfigured && gcpConfigured && <hr className="dashboard-section-divider" />}

            {gcpConfigured && <GcpCloudSection />}

        </div>

    );

}

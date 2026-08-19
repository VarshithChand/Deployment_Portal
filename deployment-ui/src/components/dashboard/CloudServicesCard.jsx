import { useEffect, useState } from "react";

import { getMyAwsSettings, getMyAzureSettings, getMyGcpSettings } from "../../services/settingsService";
import AwsCloudSection from "./AwsCloudSection";
import AzureCloudSection from "./AzureCloudSection";
import GcpCloudSection from "./GcpCloudSection";

// One shared "Cloud Services" container for every cloud provider's
// Dashboard summary - replaces what used to be AWS's own standalone card
// (AwsServicesCard) sitting alone, by explicit request: no separate
// container per provider. Aws/Azure/GcpCloudSection each manage their
// own inventory fetch and hide themselves when that provider isn't
// configured; this component only needs a cheap, separate configured
// check for each (getMyAwsSettings/getMyAzureSettings/getMyGcpSettings,
// the same lightweight calls QuickAccessCard already uses) to decide
// whether the outer container itself is worth rendering at all - if no
// provider is configured, the whole card is hidden from the Dashboard
// rather than showing an empty "connect your credentials" placeholder.
// GCP now has a real summary (Compute Engine + Cloud Run counts) since
// the multi-cloud infrastructure console rounds built those out.
export default function CloudServicesCard() {

    const [awsConfigured, setAwsConfigured] = useState(false);
    const [azureConfigured, setAzureConfigured] = useState(false);
    const [gcpConfigured, setGcpConfigured] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {

        Promise.all([
            getMyAwsSettings().catch(() => null),
            getMyAzureSettings().catch(() => null),
            getMyGcpSettings().catch(() => null)
        ]).then(([aws, azure, gcp]) => {
            setAwsConfigured(!!aws?.configured);
            setAzureConfigured(!!azure?.configured);
            setGcpConfigured(!!gcp?.configured);
            setChecked(true);
        });

    }, []);

    if (!checked || (!awsConfigured && !azureConfigured && !gcpConfigured)) {
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

import { useEffect, useState } from "react";

import { getMyAwsSettings, getMyAzureSettings } from "../../services/settingsService";
import AwsCloudSection from "./AwsCloudSection";
import AzureCloudSection from "./AzureCloudSection";

// One shared "Cloud Services" container for every cloud provider's
// Dashboard summary - replaces what used to be AWS's own standalone card
// (AwsServicesCard) sitting alone, by explicit request: no separate
// container per provider. AwsCloudSection/AzureCloudSection each manage
// their own full inventory fetch and hide themselves when that provider
// isn't configured; this component only needs a cheap, separate
// configured check for each (getMyAwsSettings/getMyAzureSettings, the
// same lightweight calls QuickAccessCard already uses) to decide whether
// the outer container itself is worth rendering at all - if neither cloud
// provider is configured, the whole card is hidden from the Dashboard
// rather than showing an empty "connect your credentials" placeholder.
// GCP has no live inventory built yet (see pages/CloudServicesGcp.jsx's
// own "not built yet" placeholder) so it isn't part of this card yet
// either - nothing to summarize there.
export default function CloudServicesCard() {

    const [awsConfigured, setAwsConfigured] = useState(false);
    const [azureConfigured, setAzureConfigured] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {

        Promise.all([
            getMyAwsSettings().catch(() => null),
            getMyAzureSettings().catch(() => null)
        ]).then(([aws, azure]) => {
            setAwsConfigured(!!aws?.configured);
            setAzureConfigured(!!azure?.configured);
            setChecked(true);
        });

    }, []);

    if (!checked || (!awsConfigured && !azureConfigured)) {
        return null;
    }

    return (

        <div className="card">

            <h2 className="card-title">Cloud Services</h2>

            {awsConfigured && <AwsCloudSection />}

            {awsConfigured && azureConfigured && <hr className="dashboard-section-divider" />}

            {azureConfigured && <AzureCloudSection />}

        </div>

    );

}

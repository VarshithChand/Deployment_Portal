import { useEffect, useState } from "react";

import { getMyAwsSettings, getMyAzureSettings, getMyGcpSettings } from "../services/settingsService";

// The Dashboard mounts several independent cards (Cloud Services,
// Container Registry, Observability, Quick Access) that each used to ask
// "is AWS/Azure/GCP configured?" with their own getMyAwsSettings/
// getMyAzureSettings/getMyGcpSettings calls - 4 call sites x 3 calls = 12
// nearly-simultaneous requests for the same 3 answers on every Dashboard
// load. This module-scoped cache + in-flight promise means whichever card
// mounts first triggers the real 3 calls, and every other card that asks
// within the TTL window rides that same promise instead of firing its
// own - the real request count drops from 12 to 3 with no change to what
// any card renders. TTL is short (just long enough to cover one page's
// simultaneous mounts) rather than a real cache - this is about
// deduplicating one page load's burst, not about staleness tolerance.
let inFlight = null;
let cached = null;
let cachedAt = 0;
const TTL_MS = 4000;

function fetchStatus() {

    const now = Date.now();

    if (cached && now - cachedAt < TTL_MS) {
        return Promise.resolve(cached);
    }

    if (inFlight) {
        return inFlight;
    }

    inFlight = Promise.all([
        getMyAwsSettings().catch(() => null),
        getMyAzureSettings().catch(() => null),
        getMyGcpSettings().catch(() => null)
    ]).then(([aws, azure, gcp]) => {

        cached = { awsConfigured: !!aws?.configured, azureConfigured: !!azure?.configured, gcpConfigured: !!gcp?.configured };
        cachedAt = Date.now();
        inFlight = null;

        return cached;

    });

    return inFlight;

}

export default function useCloudProviderStatus() {

    const [status, setStatus] = useState(cached);
    const [loading, setLoading] = useState(!cached);

    useEffect(() => {

        let cancelled = false;

        fetchStatus().then((result) => {

            if (!cancelled) {
                setStatus(result);
                setLoading(false);
            }

        });

        return () => { cancelled = true; };

    }, []);

    return { ...(status || { awsConfigured: false, azureConfigured: false, gcpConfigured: false }), loading };

}

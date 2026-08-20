import { useEffect, useState } from "react";

import { getPaasApplications } from "../services/paasHubService";

// Same dedup shape as useCloudProviderStatus.js - PaasSummaryCard and
// AllApplicationsTable both used to call getPaasApplications() (AWS
// Elastic Beanstalk + Azure App Service + GCP Cloud Run, fetched in
// parallel server-side) independently on every Dashboard load. One
// module-scoped in-flight promise + short TTL means the second caller
// rides the first caller's request instead of firing a second one.
let inFlight = null;
let cached = null;
let cachedAt = 0;
const TTL_MS = 4000;

function fetchApplications() {

    const now = Date.now();

    if (cached && now - cachedAt < TTL_MS) {
        return Promise.resolve(cached);
    }

    if (inFlight) {
        return inFlight;
    }

    inFlight = getPaasApplications()
        .then((data) => {
            cached = data;
            cachedAt = Date.now();
            inFlight = null;
            return cached;
        })
        .catch((err) => {
            inFlight = null;
            throw err;
        });

    return inFlight;

}

export default function usePaasApplications() {

    const [data, setData] = useState(cached);
    const [loading, setLoading] = useState(!cached);

    useEffect(() => {

        let cancelled = false;

        fetchApplications()
            .then((result) => {
                if (!cancelled) {
                    setData(result);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };

    }, []);

    return { data, loading };

}

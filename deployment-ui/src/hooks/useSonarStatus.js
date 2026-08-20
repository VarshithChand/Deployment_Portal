import { useEffect, useState } from "react";

import { getSonarStatus } from "../services/sonarService";

// CodeQualitySummaryCard and QuickAccessCard both used to independently
// call getSonarStatus for both providers on every Dashboard load - same
// TTL-cache dedup shape as useCloudProviderStatus.js.
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

    const start = performance.now();

    inFlight = Promise.all([
        getSonarStatus("sonarqube").catch(() => null),
        getSonarStatus("sonarcloud").catch(() => null)
    ]).then(([sonarqube, sonarcloud]) => {

        cached = {
            status: { sonarqube: !!sonarqube?.configured, sonarcloud: !!sonarcloud?.configured },
            tookMs: Math.round(performance.now() - start)
        };
        cachedAt = Date.now();
        inFlight = null;

        return cached;

    });

    return inFlight;

}

export default function useSonarStatus() {

    const [state, setState] = useState(cached || { status: null, tookMs: null });
    const [loading, setLoading] = useState(!cached);

    useEffect(() => {

        let cancelled = false;

        fetchStatus().then((result) => {
            if (!cancelled) {
                setState(result);
                setLoading(false);
            }
        });

        return () => { cancelled = true; };

    }, []);

    return { ...state, loading };

}

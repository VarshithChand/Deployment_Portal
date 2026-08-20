import { useEffect, useState } from "react";

import { getAzureDevOpsStatus } from "../services/azureDevOpsService";

// QuickAccessCard and the new SourceControlSummaryCard both need this -
// same TTL-cache dedup shape as useCloudProviderStatus.js.
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

    inFlight = getAzureDevOpsStatus().catch(() => null).then((result) => {

        cached = { configured: !!result?.configured, tookMs: Math.round(performance.now() - start) };
        cachedAt = Date.now();
        inFlight = null;

        return cached;

    });

    return inFlight;

}

export default function useAzureDevOpsStatus() {

    const [state, setState] = useState(cached || { configured: false, tookMs: null });
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

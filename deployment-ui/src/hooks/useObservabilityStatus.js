import { useEffect, useState } from "react";

import { getObservabilityHostStatus } from "../services/observabilityService";

// Keys must match ObservabilitySummaryCard.jsx's own STANDALONE_TOOLS
// list exactly - kept here rather than imported from that component so
// this hook has no dependency on a UI file (SystemHealthCard also
// consumes this, and shouldn't need to import a card component just for
// a key list).
export const STANDALONE_OBSERVABILITY_KEYS = [
    "prometheus", "datadog", "elk", "opensearch", "loki",
    "fluentbit", "fluentd", "opentelemetry", "jaeger", "zipkin"
];

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

    inFlight = Promise.all(
        STANDALONE_OBSERVABILITY_KEYS.map((key) => getObservabilityHostStatus(key).catch(() => null))
    ).then((results) => {

        const status = {};
        STANDALONE_OBSERVABILITY_KEYS.forEach((key, index) => { status[key] = !!results[index]?.configured; });

        cached = { status, tookMs: Math.round(performance.now() - start) };
        cachedAt = Date.now();
        inFlight = null;

        return cached;

    });

    return inFlight;

}

export default function useObservabilityStatus() {

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

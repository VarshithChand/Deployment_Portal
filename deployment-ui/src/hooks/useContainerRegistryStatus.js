import { useEffect, useState } from "react";

import {
    getDockerHubStatus, getGhcrStatus, getGitLabRegistryStatus, getJfrogStatus, getHostRegistryStatus
} from "../services/containerRegistryService";

// ContainerRegistrySummaryCard and QuickAccessCard both used to
// independently call these same 6 standalone-registry status endpoints
// on every Dashboard load - same TTL-cache dedup shape as
// useCloudProviderStatus.js.
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
        getDockerHubStatus().catch(() => null),
        getGhcrStatus().catch(() => null),
        getGitLabRegistryStatus().catch(() => null),
        getJfrogStatus().catch(() => null),
        getHostRegistryStatus("harbor").catch(() => null),
        getHostRegistryStatus("nexus").catch(() => null)
    ]).then(([dockerhub, ghcr, gitlabRegistry, jfrog, harbor, nexus]) => {

        cached = {
            status: {
                dockerhub: !!dockerhub?.configured,
                ghcr: !!ghcr?.configured,
                "gitlab-registry": !!gitlabRegistry?.configured,
                jfrog: !!jfrog?.configured,
                harbor: !!harbor?.configured,
                nexus: !!nexus?.configured
            },
            tookMs: Math.round(performance.now() - start)
        };
        cachedAt = Date.now();
        inFlight = null;

        return cached;

    });

    return inFlight;

}

export default function useContainerRegistryStatus() {

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

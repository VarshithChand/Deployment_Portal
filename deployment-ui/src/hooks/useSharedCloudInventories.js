import { useEffect, useState } from "react";

import { getMyAwsResources, getMyAzureResources } from "../services/settingsService";
import { getGcpVms } from "../services/cloudServicesService";
import { getCloudRunServices } from "../services/containerServicesService";

// AwsCloudSection/AzureCloudSection/GcpCloudSection each already poll
// their own inventory in the background (usePolling, 30-45s) for the
// Cloud Services card's own tiles; OverviewStats and the new
// SystemHealthCard need the exact same data. A plain TTL-cache (like
// useCloudProviderStatus.js) only dedupes a burst of near-simultaneous
// one-shot calls - it can't dedupe an ongoing background poll, since
// each poller would just re-win the cache on its own next tick. This is
// a real shared store instead: one interval, one in-flight fetch per
// tick, broadcast to every subscribed component - so 3 cards polling
// the same AWS inventory still only cost 1 timer and 1 request per
// tick, not 3. `tookMs` is measured here (client-observed round trip),
// not returned by the backend, since none of these DTOs carry server-
// side timing - it's real elapsed time for the call as this session's
// resources actually get it.
function createResourceStore(fetchFn, intervalMs) {

    let snapshot = { data: null, loading: true, tookMs: null };
    const subscribers = new Set();
    let timer = null;

    function notify() {
        subscribers.forEach((cb) => cb(snapshot));
    }

    async function tick() {

        const start = performance.now();

        try {
            const data = await fetchFn();
            snapshot = { data, loading: false, tookMs: Math.round(performance.now() - start) };
        }
        catch {
            snapshot = { data: snapshot.data, loading: false, tookMs: null };
        }

        notify();

    }

    function subscribe(cb) {

        subscribers.add(cb);

        if (!timer) {
            tick();
            timer = setInterval(tick, intervalMs);
        }
        else {
            cb(snapshot);
        }

        return () => {

            subscribers.delete(cb);

            if (subscribers.size === 0 && timer) {
                clearInterval(timer);
                timer = null;
            }

        };

    }

    return { subscribe, getSnapshot: () => snapshot };

}

const awsStore = createResourceStore(() => getMyAwsResources(), 30000);
const azureStore = createResourceStore(() => getMyAzureResources(), 45000);
const gcpStore = createResourceStore(
    () => Promise.all([getGcpVms().catch(() => null), getCloudRunServices().catch(() => null)])
        .then(([vms, cloudRun]) => ({ vms, cloudRun })),
    45000
);

function useStore(store) {

    const [snapshot, setSnapshot] = useState(store.getSnapshot());

    useEffect(() => store.subscribe(setSnapshot), [store]);

    return snapshot;

}

export function useAwsResourceInventory() { return useStore(awsStore); }
export function useAzureResourceInventory() { return useStore(azureStore); }
export function useGcpResources() { return useStore(gcpStore); }

// AwsCloudSection's region ComboBox needs a one-off fetch for a region
// other than the default the shared store polls - a plain pass-through,
// not part of the shared/polled pool (a per-user region override isn't
// something other cards should ever see).
export function fetchAwsResourceInventory(region) {
    return getMyAwsResources(region);
}

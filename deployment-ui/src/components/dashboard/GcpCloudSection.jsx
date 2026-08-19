import { useState } from "react";

import { getGcpVms } from "../../services/cloudServicesService";
import { getCloudRunServices } from "../../services/containerServicesService";
import useNavigation from "../../hooks/useNavigation";
import usePolling from "../../hooks/usePolling";

const POLL_MS = 45000;
const MAX_ITEMS_SHOWN = 4;

// Same tile shape as AwsCloudSection.jsx's own (private, unexported)
// AwsServiceTile - duplicated locally rather than extracted into a
// shared component, since it's a small, stable shape and not worth a
// cross-file dependency for two call sites.
function GcpServiceTile({ label, status, onSelect }) {

    const header = (

        <div className="aws-service-tile-header">
            <span>{label}</span>
            {status.error ? (
                <span className="badge badge-danger">Error</span>
            ) : (
                <span className="badge badge-success">{status.count}</span>
            )}
        </div>

    );

    const body = status.error ? (

        <p className="field-hint field-hint-bad" style={{ margin: 0 }}>{status.error}</p>

    ) : (

        <ul className="aws-service-tile-list">

            {status.items.slice(0, MAX_ITEMS_SHOWN).map((item, index) => (

                <li key={index}>
                    <span className="aws-service-tile-item-name">{item.name}</span>
                    {item.detail && <span className="aws-service-tile-item-detail">{item.detail}</span>}
                </li>

            ))}

            {status.count > MAX_ITEMS_SHOWN && (
                <li className="aws-service-tile-more">+{status.count - MAX_ITEMS_SHOWN} more</li>
            )}

        </ul>

    );

    return (

        <button type="button" className="aws-service-tile aws-service-tile-clickable" onClick={onSelect}>
            {header}
            {body}
        </button>

    );

}

// GCP's own slice of the Dashboard's "Cloud Services" container -
// closes the gap CloudServicesCard.jsx's own comment used to note
// ("GCP has no live inventory built yet"). Reuses the two calls that
// already exist and are already used elsewhere (Compute Engine's own
// management page, Cloud Run's own management page) rather than a new
// grouped/counted inventory endpoint like AWS/Azure have - two real
// numbers from data already fetchable in two calls, not a full
// per-resource-type breakdown, a proportionate scope for what's
// actually needed on a summary card.
export default function GcpCloudSection() {

    const { setTab } = useNavigation();

    const [vms, setVms] = useState(null);
    const [cloudRun, setCloudRun] = useState(null);
    const [loading, setLoading] = useState(true);

    async function load() {

        const [vmsRes, cloudRunRes] = await Promise.all([
            getGcpVms().catch(() => null),
            getCloudRunServices().catch(() => null)
        ]);

        setVms(vmsRes);
        setCloudRun(cloudRunRes);
        setLoading(false);

    }

    usePolling(load, POLL_MS);

    if (loading || !vms?.configured) {
        return null;
    }

    const tiles = [
        {
            key: "compute",
            label: "Compute Engine Instances",
            status: vms.error
                ? { error: vms.error }
                : { count: vms.instances?.length || 0, items: (vms.instances || []).map((i) => ({ name: i.name, detail: i.zone })) }
        },
        {
            key: "cloudrun",
            label: "Cloud Run Services",
            status: cloudRun?.error
                ? { error: cloudRun.error }
                : { count: cloudRun?.services?.length || 0, items: (cloudRun?.services || []).map((s) => ({ name: s.name, detail: s.location })) }
        }
    ];

    return (

        <>

            <h3 className="settings-subhead" style={{ marginTop: 0 }}>GCP</h3>

            <div className="aws-service-grid">

                {tiles.map((tile) => (
                    <GcpServiceTile key={tile.key} label={tile.label} status={tile.status} onSelect={() => setTab("cloudServicesGcp")} />
                ))}

            </div>

        </>

    );

}

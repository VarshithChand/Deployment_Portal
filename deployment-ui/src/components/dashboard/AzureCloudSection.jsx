import { useState } from "react";

import { getMyAzureResources } from "../../services/settingsService";
import useNavigation from "../../hooks/useNavigation";
import usePolling from "../../hooks/usePolling";

const POLL_MS = 45000;
const MAX_ITEMS_SHOWN = 4;
const MAX_GROUPS_SHOWN = 7;

// Reuses AWS's own tile CSS (aws-service-tile/aws-service-tile-header/...)
// - those classes are already provider-agnostic in shape (a label, a
// count, a short item list), same reasoning CloudCredentialsDto.cs's
// AwsServiceGroupDto/AwsResourceItemDto reuse on the backend for this
// exact inventory. Not clickable per-tile (unlike AWS's own tiles, which
// deep-link into a specific service's own detail page) - Azure's Cloud
// Services page doesn't have a pendingCloudService-style hand-off wired up
// yet, so this section links out to the whole catalog instead (see the
// "View all Azure services" link below the grid).
function AzureServiceTile({ label, status }) {

    return (

        <div className="aws-service-tile">

            <div className="aws-service-tile-header">
                <span>{label}</span>
                <span className="badge badge-success">{status.count}</span>
            </div>

            <ul className="aws-service-tile-list">

                {status.items.slice(0, MAX_ITEMS_SHOWN).map((item, index) => (

                    <li key={index}>
                        <span className="aws-service-tile-item-name">{item.name}</span>
                        {item.detail && (
                            <span className="aws-service-tile-item-detail">{item.detail}</span>
                        )}
                    </li>

                ))}

                {status.count > MAX_ITEMS_SHOWN && (
                    <li className="aws-service-tile-more">+{status.count - MAX_ITEMS_SHOWN} more</li>
                )}

            </ul>

        </div>

    );

}

// Azure's own slice of the Dashboard's "Cloud Services" container -
// the Azure equivalent of AwsCloudSection, built on the same
// GetAzureResourceInventoryAsync/getMyAzureResources call Cloud Services'
// own Azure sub-page uses (one ARM call, grouped by resource type - see
// that page's own comment on why this doesn't need AWS's "known services +
// tagging API" split). Renders nothing at all once it's clear Azure isn't
// configured - CloudServicesCard itself decides whether the whole
// container is worth showing.
export default function AzureCloudSection() {

    const { setTab } = useNavigation();

    const [inventory, setInventory] = useState(null);
    const [loading, setLoading] = useState(true);

    async function loadInventory() {

        try {
            setInventory(await getMyAzureResources());
        }
        catch (err) {
            console.error(err);
        }
        finally {
            setLoading(false);
        }

    }

    usePolling(loadInventory, POLL_MS);

    if (loading || !inventory?.configured) {
        return null;
    }

    const groups = (inventory.groups || []).slice(0, MAX_GROUPS_SHOWN);

    return (

        <>

            <h3 className="settings-subhead">Azure</h3>

            {inventory.error ? (

                <p className="error-message">{inventory.error}</p>

            ) : groups.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left" }}>
                    Nothing detected in your Azure subscription yet.
                </p>

            ) : (

                <div className="aws-service-grid">

                    {groups.map((group) => (
                        <AzureServiceTile key={group.key} label={group.label} status={group} />
                    ))}

                </div>

            )}

            <p className="field-hint" style={{ marginTop: "10px" }}>
                <a href="#" onClick={(e) => { e.preventDefault(); setTab("cloudServicesAzure"); }}>
                    View all Azure services →
                </a>
            </p>

        </>

    );

}

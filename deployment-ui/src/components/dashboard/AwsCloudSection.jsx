import { useState } from "react";

import AWS_REGIONS from "../../data/awsRegions";
import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import { useAwsResourceInventory, fetchAwsResourceInventory } from "../../hooks/useSharedCloudInventories";
import ComboBox from "../common/ComboBox";

const MAX_ITEMS_SHOWN = 4;

const SERVICES = [
    { key: "ec2", label: "Running EC2 Instances" },
    { key: "ecr", label: "ECR Repositories" },
    { key: "vpc", label: "VPCs" },
    { key: "s3", label: "S3 Buckets" },
    { key: "lambda", label: "Lambda Functions" },
    { key: "route53", label: "Route 53 Zones" },
    { key: "sns", label: "SNS Topics" }
];

// A tile only ever renders for a service that's actually got something
// running (status.count > 0) or one that errored trying to check.
function AwsServiceTile({ label, status, onSelect }) {

    const clickable = typeof onSelect === "function";

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
                    {item.detail && (
                        <span className="aws-service-tile-item-detail">{item.detail}</span>
                    )}
                </li>

            ))}

            {status.count > MAX_ITEMS_SHOWN && (
                <li className="aws-service-tile-more">+{status.count - MAX_ITEMS_SHOWN} more</li>
            )}

        </ul>

    );

    if (!clickable) {

        return (
            <div className="aws-service-tile">
                {header}
                {body}
            </div>
        );

    }

    return (

        <button type="button" className="aws-service-tile aws-service-tile-clickable" onClick={onSelect}>
            {header}
            {body}
        </button>

    );

}

// AWS's own slice of the Dashboard's "Cloud Services" container - moved
// out of what used to be its own standalone card (AwsServicesCard) so it
// can live inside one shared container alongside Azure's slice (see
// CloudServicesCard.jsx). Content is unchanged from the original: every
// AWS service this session's saved credentials can see resources in, for
// the configured region. Renders nothing at all once it's clear AWS isn't
// configured - CloudServicesCard itself decides whether the whole
// container is worth showing.
//
// The default-region view rides useAwsResourceInventory's shared,
// polled store (see useSharedCloudInventories.js) - OverviewStats and
// SystemHealthCard poll this exact same data, so this section no longer
// runs its own separate 30s timer for it. Only a manually-picked region
// (via the ComboBox below) falls back to a local, one-off fetch - a
// per-visitor override the shared store has no reason to know about.
export default function AwsCloudSection() {

    const { awsIdentityLabel } = useAuth();
    const { goToCloudService } = useNavigation();

    const shared = useAwsResourceInventory();

    const [overrideInventory, setOverrideInventory] = useState(null);
    const [overrideLoading, setOverrideLoading] = useState(false);
    const [selectedRegion, setSelectedRegion] = useState(null);

    async function handleRegionChange(region) {

        setSelectedRegion(region || null);

        if (!region) {
            setOverrideInventory(null);
            return;
        }

        setOverrideLoading(true);
        setOverrideInventory(await fetchAwsResourceInventory(region));
        setOverrideLoading(false);

    }

    const loading = selectedRegion ? overrideLoading : shared.loading;
    const inventory = selectedRegion ? overrideInventory : shared.data;

    if (loading || !inventory?.configured) {
        return null;
    }

    const visibleKnown = SERVICES.filter((service) => {
        const status = inventory[service.key];
        return status && (status.error || status.count > 0);
    }).map((service) => ({ key: service.key, label: service.label, status: inventory[service.key] }));

    const otherTiles = (inventory.other || []).map((group) => ({
        key: group.key,
        label: group.label,
        status: { count: group.count, items: group.items }
    }));

    if (inventory.otherError) {
        otherTiles.push({
            key: "other-error",
            label: "Other AWS Resources",
            status: { error: inventory.otherError }
        });
    }

    const visibleTiles = [...visibleKnown, ...otherTiles];

    return (

        <>

            <h3 className="settings-subhead" style={{ marginTop: 0 }}>AWS</h3>

            <div className="form-group cloud-provider-select-group">

                <label htmlFor="aws-dashboard-region">Region</label>

                <ComboBox
                    id="aws-dashboard-region"
                    options={AWS_REGIONS}
                    value={selectedRegion || inventory.region || ""}
                    onChange={handleRegionChange}
                    placeholder={inventory.region || "us-east-1"}
                />

            </div>

            {visibleTiles.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left" }}>
                    Nothing currently running in {inventory.region || "your AWS account"} across any
                    AWS service this access key can see.
                </p>

            ) : (

                <>

                <p className="field-hint" style={{ padding: "0 0 15px", margin: 0, textAlign: "left" }}>
                    {awsIdentityLabel ? `Signed in as ${awsIdentityLabel}` : "Live account inventory"}
                    {inventory.region ? ` · ${inventory.region}` : ""}
                </p>

                <div className="aws-service-grid">

                    {visibleTiles.map((tile) => (

                        <AwsServiceTile
                            key={tile.key}
                            label={tile.label}
                            status={tile.status}
                            onSelect={tile.key === "other-error" ? null : () => goToCloudService(tile.key)}
                        />

                    ))}

                </div>

                </>

            )}

        </>

    );

}

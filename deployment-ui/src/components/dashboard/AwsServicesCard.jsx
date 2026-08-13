import { useState } from "react";

import { getMyAwsResources } from "../../services/settingsService";
import AWS_REGIONS from "../../data/awsRegions";
import useAuth from "../../hooks/useAuth";
import useNavigation from "../../hooks/useNavigation";
import usePolling from "../../hooks/usePolling";
import ComboBox from "../common/ComboBox";

const POLL_MS = 30000;
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
// running (status.count > 0) or one that errored trying to check (still
// worth surfacing — that's a real problem, not "nothing running"). A
// clean zero-count service is deliberately not a tile at all; see
// hasSomethingToShow below for the empty-account case.
//
// onSelect is omitted for the synthetic "Other AWS Resources" error tile
// (see the otherError push below) - it doesn't correspond to any one real
// service on the Cloud Services page, so there's nowhere for a click on it
// to actually go.
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

// Dashboard's account-wide AWS tracker — every AWS service this session's
// saved credentials (see AwsLoginSection) can see resources in, for the
// configured region. EC2/ECR/VPC/S3/Lambda/Route53/SNS are hand-checked
// (accurate semantics, e.g. EC2 filtered to actually-running instances);
// everything else comes from a broader Resource Groups Tagging API scan
// (see CloudStatusService.DescribeOtherResourcesAsync), one tile per AWS
// service namespace actually found. Independent of the Environments
// feature's ECS/ECR panel, which only ever showed the one cluster/service/
// repository a specific environment happens to be wired to.
export default function AwsServicesCard() {

    const { githubTokenConfigured, awsIdentityLabel } = useAuth();
    const { goToCloudService } = useNavigation();

    const [inventory, setInventory] = useState(null);
    const [loading, setLoading] = useState(true);

    // null = "use whatever region is saved with the AWS credential" - the
    // backend's own default. Only becomes a real value once the region
    // picker below is touched.
    const [selectedRegion, setSelectedRegion] = useState(null);

    async function loadInventory(region) {

        // Same reasoning as every other Dashboard card — this mounts even
        // behind RequireGitHubSetup's popup, so without this guard it
        // polled before a token was even connected. Gated on the token,
        // not a chosen repo (this card has nothing to do with which repo
        // is selected) - RequireGitHubSetup itself no longer requires one.
        if (!githubTokenConfigured) {
            setLoading(false);
            return;
        }

        const data = await getMyAwsResources(region ?? selectedRegion);
        setInventory(data);
        setLoading(false);

    }

    usePolling(loadInventory, POLL_MS);

    function handleRegionChange(region) {

        setSelectedRegion(region || null);
        setLoading(true);
        loadInventory(region || null);

    }

    if (!githubTokenConfigured) {
        return null;
    }

    // "Running services" only — a service sitting at zero isn't shown at
    // all, rather than rendering tiles that just say "0/None found". An
    // error still renders (that's "couldn't check", not "nothing running")
    // since silently hiding it would read as "all clear" when it might not
    // be. The seven hand-checked services above come first; anything else
    // this access key has in the region — RDS, DynamoDB, SQS, whatever —
    // comes from inventory.other (see CloudStatusService.
    // DescribeOtherResourcesAsync), one dynamic tile per AWS service found.
    const visibleKnown = inventory?.configured
        ? SERVICES.filter((service) => {
            const status = inventory[service.key];
            return status && (status.error || status.count > 0);
        }).map((service) => ({ key: service.key, label: service.label, status: inventory[service.key] }))
        : [];

    const otherTiles = inventory?.configured
        ? (inventory.other || []).map((group) => ({
            key: group.key,
            label: group.label,
            status: { count: group.count, items: group.items }
        }))
        : [];

    if (inventory?.configured && inventory.otherError) {
        otherTiles.push({
            key: "other-error",
            label: "Other AWS Resources",
            status: { error: inventory.otherError }
        });
    }

    const visibleTiles = [...visibleKnown, ...otherTiles];

    return (

        <div className="card">

            <h2 className="card-title">
                AWS Services
            </h2>

            {inventory?.configured && (

                <div className="form-group" style={{ maxWidth: "280px" }}>

                    <label>Region</label>

                    <ComboBox
                        options={AWS_REGIONS}
                        value={selectedRegion || inventory.region || ""}
                        onChange={handleRegionChange}
                        placeholder={inventory.region || "us-east-1"}
                    />

                </div>

            )}

            {loading ? (

                // min-height approximates a loaded tile grid's typical size
                // (see AllRepositoriesCard's own version of this) - reduces
                // how far the page below jumps once the real inventory (up
                // to several rows of tiles) arrives.
                <p className="empty-state" style={{ minHeight: "96px" }}>Checking your AWS account...</p>

            ) : !inventory?.configured ? (

                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your AWS credentials in Settings → Credentials → AWS to see every AWS
                    service this access key has resources in, for the configured region.
                </p>

            ) : visibleTiles.length === 0 ? (

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

        </div>

    );

}

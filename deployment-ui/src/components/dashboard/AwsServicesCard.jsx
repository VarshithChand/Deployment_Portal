import { useState } from "react";

import { getMyAwsResources } from "../../services/settingsService";
import useAuth from "../../hooks/useAuth";
import usePolling from "../../hooks/usePolling";

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
function AwsServiceTile({ label, status }) {

    if (status.error) {

        return (

            <div className="aws-service-tile">

                <div className="aws-service-tile-header">
                    <span>{label}</span>
                    <span className="badge badge-danger">Error</span>
                </div>

                <p className="field-hint field-hint-bad" style={{ margin: 0 }}>{status.error}</p>

            </div>

        );

    }

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

    const { githubRepoConfigured, awsIdentityLabel } = useAuth();

    const [inventory, setInventory] = useState(null);
    const [loading, setLoading] = useState(true);

    async function loadInventory() {

        // Same reasoning as every other Dashboard card — this mounts even
        // behind RequireGitHubSetup's popup, so without this guard it
        // polled regardless of whether a repo was configured yet.
        if (!githubRepoConfigured) {
            setLoading(false);
            return;
        }

        const data = await getMyAwsResources();
        setInventory(data);
        setLoading(false);

    }

    usePolling(loadInventory, POLL_MS);

    if (!githubRepoConfigured) {
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

            {loading ? (

                <p className="empty-state">Checking your AWS account...</p>

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
                        />

                    ))}

                </div>

                </>

            )}

        </div>

    );

}

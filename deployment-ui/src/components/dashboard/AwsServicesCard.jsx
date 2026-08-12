import { useState } from "react";

import { getMyAwsResources } from "../../services/settingsService";
import useAuth from "../../hooks/useAuth";
import usePolling from "../../hooks/usePolling";

const POLL_MS = 30000;
const MAX_ITEMS_SHOWN = 4;

const SERVICES = [
    { key: "ec2", label: "EC2 Instances" },
    { key: "vpc", label: "VPCs" },
    { key: "s3", label: "S3 Buckets" },
    { key: "lambda", label: "Lambda Functions" },
    { key: "route53", label: "Route 53 Zones" },
    { key: "sns", label: "SNS Topics" }
];

// One AWS service's tile — status is undefined while the whole inventory
// is still loading, or the per-service AwsServiceStatusDto (found/error/
// count/items) once it's back. Each service fails independently (a
// missing IAM permission on just one of the six shouldn't blank the rest).
function AwsServiceTile({ label, status }) {

    if (!status) {

        return (

            <div className="aws-service-tile">
                <div className="aws-service-tile-header"><span>{label}</span></div>
                <p className="field-hint" style={{ margin: 0 }}>Checking...</p>
            </div>

        );

    }

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
                <span className={`badge ${status.count > 0 ? "badge-success" : "badge-secondary"}`}>
                    {status.count}
                </span>
            </div>

            {status.count === 0 ? (

                <p className="field-hint" style={{ margin: 0 }}>None found</p>

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

            )}

        </div>

    );

}

// Dashboard's account-wide AWS tracker — EC2, VPC, S3, Lambda, Route 53,
// and SNS, all resolved from this session's own saved AWS credentials
// (see AwsLoginSection), independent of the Environments feature's ECS/ECR
// panel, which only ever showed the one cluster/service/repository a
// specific environment happens to be wired to.
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

    return (

        <div className="card">

            <h2 className="card-title">
                AWS Services
            </h2>

            {loading ? (

                <p className="empty-state">Checking your AWS account...</p>

            ) : !inventory?.configured ? (

                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your AWS credentials in Settings → Credentials → AWS to see EC2, VPC, S3,
                    Lambda, Route 53, and SNS resources here.
                </p>

            ) : (

                <>

                <p className="field-hint" style={{ padding: "0 0 15px", margin: 0, textAlign: "left" }}>
                    {awsIdentityLabel ? `Signed in as ${awsIdentityLabel}` : "Live account inventory"}
                    {inventory.region ? ` · ${inventory.region}` : ""}
                </p>

                <div className="aws-service-grid">

                    {SERVICES.map((service) => (

                        <AwsServiceTile
                            key={service.key}
                            label={service.label}
                            status={inventory[service.key]}
                        />

                    ))}

                </div>

                </>

            )}

        </div>

    );

}

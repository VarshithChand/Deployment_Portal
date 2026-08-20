import usePaasApplications from "../../hooks/usePaasApplications";
import useNavigation from "../../hooks/useNavigation";
import { AwsCloudIcon, AzureCloudIcon, GcpCloudIcon } from "../layout/SidebarIcons";

const PROVIDERS = [
    { key: "AWS", label: "AWS Elastic Beanstalk", configuredKey: "awsConfigured", errorKey: "awsError", Icon: AwsCloudIcon },
    { key: "Azure", label: "Azure App Service", configuredKey: "azureConfigured", errorKey: "azureError", Icon: AzureCloudIcon },
    { key: "GCP", label: "GCP Cloud Run", configuredKey: "gcpConfigured", errorKey: "gcpError", Icon: GcpCloudIcon }
];

// PaaS/Microservices' own slice of the Dashboard - reuses the SAME
// cross-provider aggregation endpoint the "All Applications" hub page
// already calls (GET /api/paas/applications, one round trip covering
// AWS Elastic Beanstalk + Azure App Service + GCP Cloud Run in
// parallel), deduped via usePaasApplications so this and
// AllApplicationsTable's own identical call share one request instead of
// firing it twice on every Dashboard load. Every tile routes to the hub
// page (not a provider-specific deep link) - the hub already has search/
// filters to narrow down from there, so a second navigation destination
// per provider isn't worth the extra plumbing.
export default function PaasSummaryCard() {

    const { setTab } = useNavigation();
    const { data, loading } = usePaasApplications();

    if (loading || !data) {
        return null;
    }

    const visible = PROVIDERS.filter((p) => data[p.configuredKey]);

    if (visible.length === 0) {
        return null;
    }

    return (

        <div className="card">

            <h2 className="card-title">PaaS / Microservices</h2>

            <div className="aws-service-grid">

                {visible.map((p) => {

                    const count = data.applications.filter((a) => a.provider === p.key).length;
                    const error = data[p.errorKey];

                    return (

                        <button key={p.key} type="button" className="aws-service-tile aws-service-tile-clickable" onClick={() => setTab("paasHub")}>

                            <div className="aws-service-tile-header">
                                <span>{p.label}</span>
                                {error ? <span className="badge badge-danger">Error</span> : <span className="badge badge-success">{count}</span>}
                            </div>

                            {error && <p className="field-hint field-hint-bad" style={{ margin: 0 }}>{error}</p>}

                        </button>

                    );

                })}

            </div>

        </div>

    );

}

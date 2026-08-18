import PageLayout from "../components/layout/PageLayout";

// Not built yet - AWS is the only cloud provider with a real, wired-up
// service catalog (~100 services, live inventory, region picker, per-
// service drill-down - see pages/CloudServicesAws.jsx). GCP's own
// catalog/live-status data shape wasn't specified, so this stays a real,
// visible placeholder rather than a guess.
export default function CloudServicesGcp() {

    return (

        <PageLayout title="GCP Services">
            <div className="card">
                <h2 className="card-title">GCP Services</h2>
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Not built yet — coming in a later update. AWS is the only cloud provider
                    with a full service catalog and live status today.
                </p>
            </div>
        </PageLayout>

    );

}

import PageLayout from "../components/layout/PageLayout";

// Not built yet - AWS is the only cloud provider with a real, wired-up
// service catalog (~100 services, live inventory, region picker, per-
// service drill-down - see pages/CloudServicesAws.jsx). Azure's own
// catalog/live-status data shape wasn't specified, so this stays a real,
// visible placeholder rather than a guess.
export default function CloudServicesAzure() {

    return (

        <PageLayout title="Azure Services">
            <div className="card">
                <h2 className="card-title">Azure Services</h2>
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Not built yet — coming in a later update. AWS is the only cloud provider
                    with a full service catalog and live status today.
                </p>
            </div>
        </PageLayout>

    );

}

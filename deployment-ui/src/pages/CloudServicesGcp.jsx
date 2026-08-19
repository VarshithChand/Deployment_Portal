import { useCallback, useState } from "react";

import PageLayout from "../components/layout/PageLayout";
import GcpVmManagementPage from "../components/cloudServices/GcpVmManagementPage";
import CloudRunManagementPage from "../components/cloudServices/CloudRunManagementPage";

const VIEWS = ["compute", "cloudrun"];

const VIEW_LABELS = { compute: "Compute Engine", cloudrun: "Cloud Run" };

// Mirrors PaasHosting.jsx/Settings.jsx's own page-owned "?view=" sub-nav -
// Compute Engine and Cloud Run are siblings, not a drill-down, same
// reasoning as Frontend/Backend/Database there. replaceState, not
// pushState.
function readViewFromUrl() {

    const requested = new URLSearchParams(window.location.search).get("view");

    return VIEWS.includes(requested) ? requested : "compute";

}

// Phase 1 made Compute Engine real; Phase 3 adds Cloud Run alongside it
// (see security_findings.txt) - GCP still has no ~100-service catalog the
// way AWS's page does, just these two real, managed resource types.
export default function CloudServicesGcp() {

    const [view, setViewState] = useState(readViewFromUrl);

    const setView = useCallback((next) => {

        setViewState(next);

        const url = new URL(window.location.href);
        url.searchParams.set("view", next);
        window.history.replaceState(null, "", url);

    }, []);

    return (

        <PageLayout title="GCP Services">

            <div className="button-row" style={{ marginBottom: "16px" }}>

                {VIEWS.map((v) => (

                    <button
                        key={v}
                        type="button"
                        className={`btn btn-sm ${view === v ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setView(v)}
                    >
                        {VIEW_LABELS[v]}
                    </button>

                ))}

            </div>

            {view === "compute" && <GcpVmManagementPage />}
            {view === "cloudrun" && <CloudRunManagementPage />}

        </PageLayout>

    );

}

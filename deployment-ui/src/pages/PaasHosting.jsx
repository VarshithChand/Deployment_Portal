import { useCallback, useState } from "react";

import PageLayout from "../components/layout/PageLayout";
import FrontendView from "../components/hosting-observability/FrontendView";
import BackendView from "../components/hosting-observability/BackendView";
import HostingDatabaseView from "../components/hosting-observability/DatabaseView";
import useAuth from "../hooks/useAuth";
import useNavigation from "../hooks/useNavigation";

const VIEWS = ["frontend", "backend", "database"];

const VIEW_LABELS = { frontend: "Frontend", backend: "Backend", database: "Database" };

// Mirrors Settings.jsx's own "?view=" pattern, owned locally rather than by
// NavigationContext (which only owns the top-level "?tab=") - same
// precedent as CloudServices.jsx/Services.jsx for a page-owned sub-nav.
// replaceState (not pushState) since Frontend/Backend/Database are
// siblings, not a drill-down chain.
function readViewFromUrl() {

    const requested = new URLSearchParams(window.location.search).get("view");

    return VIEWS.includes(requested) ? requested : "frontend";

}

// This page used to be a session-scoped self-service "what's under MY
// connected account" view - that now lives on Settings → Credentials (see
// MyConnectedAccounts, rendered right next to each provider's login form).
// The "Hosting Providers" nav item is reused, unchanged, for a materially
// different thing: a live view of THIS PORTAL'S OWN real production
// deployment (whichever Cloudflare/Render/Postgres an admin has configured
// as the Frontend/Backend/Database targets - see
// HostingObservabilityController), shown identically to every visitor.
// Restricted to the single super-admin identity, same posture as Settings'
// Database Management / Security Testing Lab pages.
export default function PaasHosting() {

    const { isSuperAdminSession } = useAuth();
    const { setTab } = useNavigation();

    const [view, setViewState] = useState(readViewFromUrl);

    const setView = useCallback((next) => {

        setViewState(next);

        const url = new URL(window.location.href);
        url.searchParams.set("view", next);
        window.history.replaceState(null, "", url);

    }, []);

    if (!isSuperAdminSession) {

        return (

            <PageLayout title="Hosting Providers">

                <div className="card">

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        This page is restricted to a single administrator account. Your own
                        connected Render/Cloudflare/Netlify/Vercel accounts are still available
                        under{" "}
                        <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>
                            Settings → Credentials
                        </a>.
                    </p>

                </div>

            </PageLayout>

        );

    }

    return (

        <PageLayout title="Hosting Providers">

            <div className="button-row" style={{ marginBottom: "18px" }}>

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

            {view === "frontend" && <FrontendView />}
            {view === "backend" && <BackendView />}
            {view === "database" && <HostingDatabaseView />}

        </PageLayout>

    );

}

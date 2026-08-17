import { useEffect, useState } from "react";

import { getFrontendOverview, getBackendOverview, getDatabaseOverview } from "../../services/hostingObservabilityService";
import ConnectionMap from "./ConnectionMap";
import { PROVIDER_LABEL } from "../../constants/paasProviders";

// Always visible above whichever tab (Frontend/Backend/Database) is
// selected - a single "what's actually running, right now" flow diagram,
// rather than three slightly-different copies of the same idea scattered
// across each tab (which is what this used to be - see git history).
// Fetches all 3 roles' overviews once on its own, independent of the
// selected tab, since a visitor might land straight on Backend or Database
// and should still see the whole picture. Range fixed at "15m" - this
// only needs the current status/URL/connection-count, not a chart, so
// there's no reason to pull a longer metrics window just to throw it away.
export default function ArchitectureFlow() {

    const [frontend, setFrontend] = useState(null);
    const [backend, setBackend] = useState(null);
    const [database, setDatabase] = useState(null);
    const [loading, setLoading] = useState(true);

    function refresh() {

        setLoading(true);

        Promise.all([
            getFrontendOverview("15m").catch(() => null),
            getBackendOverview("15m").catch(() => null),
            getDatabaseOverview("15m").catch(() => null)
        ]).then(([f, b, d]) => {

            setFrontend(f);
            setBackend(b);
            setDatabase(d);
            setLoading(false);

        });

    }

    useEffect(refresh, []);

    if (loading) {

        return (
            <div className="card" style={{ marginBottom: "18px" }}>
                <p className="field-hint">Loading connection flow...</p>
            </div>
        );

    }

    const roleState = (role) => {
        if (!role?.configured) return "unknown";
        return role.found ? "ok" : "warning";
    };

    const pool = database?.connectionPool;
    const dbState = !database?.health
        ? "unknown"
        : database.health.connected ? "ok" : (database.health.error ? "warning" : "unknown");

    const nodes = [
        {
            label: "Frontend",
            state: roleState(frontend),
            sub: frontend?.configured ? (PROVIDER_LABEL[frontend.provider] || frontend.provider) : "Not connected",
            url: frontend?.found ? frontend.url : null,
            meta: frontend?.found ? (frontend.status || null) : null
        },
        {
            label: "Backend",
            state: roleState(backend),
            sub: backend?.configured ? (PROVIDER_LABEL[backend.provider] || backend.provider) : "Not connected",
            url: backend?.found ? backend.url : null,
            meta: backend?.found ? (backend.status || null) : null
        },
        {
            label: "Database",
            state: dbState,
            sub: database?.health?.connected
                ? (database.providerLabel ? `PostgreSQL — ${database.providerLabel}` : "PostgreSQL")
                : "Not connected",
            url: null,
            meta: pool ? `Active: ${pool.activeConnections} / ${pool.maxConnections}` : null
        }
    ];

    return (

        <div className="card" style={{ marginBottom: "18px" }}>

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "4px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Connection Flow</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
            </div>

            <ConnectionMap nodes={nodes} />

        </div>

    );

}

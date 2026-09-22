import { useState } from "react";

import usePolling from "../hooks/usePolling";
import { getBackendHealth, getDatabaseHealth } from "../services/healthService";
import Logo from "../components/common/Logo";

// deploymentportal.in/health - a real URL path (not a ?tab= query param
// like every other page), reachable only once App.jsx's own routing gate
// confirms isSuperAdminSession (see that file's own comment on why this
// is client-side-only and what the real server-side floor already is).
// Reuses the exact getBackendHealth/getDatabaseHealth calls the existing
// Smoke Tests page already uses (SmokeTestCard.jsx) - same real, live
// numbers, just always-expanded here instead of behind an accordion,
// since this page's whole purpose is showing them.
const POLL_MS = 15000;

function StatusDot({ ok }) {
    return <span className={`health-dot ${ok ? "health-dot-ok" : "health-dot-bad"}`} />;
}

function StatusPill({ ok }) {
    return <span className={`badge ${ok ? "badge-success" : "badge-danger"}`}>{ok ? "Operational" : "Down"}</span>;
}

export default function HealthPage() {

    const [backend, setBackend] = useState(null);
    const [database, setDatabase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastChecked, setLastChecked] = useState(null);

    async function load() {

        const [b, d] = await Promise.allSettled([getBackendHealth(), getDatabaseHealth()]);

        setBackend(b.status === "fulfilled" ? b.value : { httpStatus: 0 });
        setDatabase(d.status === "fulfilled" ? d.value : { httpStatus: 0 });
        setLastChecked(new Date());
        setLoading(false);

    }

    usePolling(load, POLL_MS);

    const backendOk = backend?.httpStatus >= 200 && backend?.httpStatus < 300;
    const databaseOk = database?.httpStatus >= 200 && database?.httpStatus < 300;
    const connectionString = database?.host ? `${database.host}:${database.port}/${database.database}` : null;

    return (

        <div className="health-page">

            <div className="health-page-inner">

                <div className="health-page-header">
                    <Logo showEyebrow={false} compact size={34} />
                    <h1>System Health</h1>
                    <p className="field-hint">
                        Super-admin only - not part of the normal Settings navigation.
                        {lastChecked && ` Last checked ${lastChecked.toLocaleTimeString()}.`}
                    </p>
                </div>

                {loading ? (

                    <p className="field-hint">Checking...</p>

                ) : (

                    <div className="health-cards">

                        <div className="card health-card">

                            <div className="health-card-head">
                                <StatusDot ok={backendOk} />
                                <h2 className="card-title" style={{ margin: 0 }}>Backend</h2>
                                <StatusPill ok={backendOk} />
                            </div>

                            {backendOk ? (

                                <dl className="smoke-test-metrics">
                                    <div className="smoke-test-metric"><dt>Uptime</dt><dd>{backend.uptimeSeconds}s</dd></div>
                                    <div className="smoke-test-metric"><dt>Memory</dt><dd>{backend.memoryMb} MB</dd></div>
                                    <div className="smoke-test-metric"><dt>CPU</dt><dd>{backend.cpuPercent}%</dd></div>
                                </dl>

                            ) : (

                                <p className="field-hint field-hint-bad">
                                    HTTP {backend?.httpStatus || "—"} - unable to reach the backend.
                                </p>

                            )}

                        </div>

                        <div className="card health-card">

                            <div className="health-card-head">
                                <StatusDot ok={databaseOk} />
                                <h2 className="card-title" style={{ margin: 0 }}>Database</h2>
                                <StatusPill ok={databaseOk} />
                            </div>

                            {databaseOk ? (

                                <dl className="smoke-test-metrics">
                                    <div className="smoke-test-metric"><dt>Mode</dt><dd>{database.mode}</dd></div>
                                    {database.responseTimeMs != null && (
                                        <div className="smoke-test-metric"><dt>Query Time</dt><dd>{database.responseTimeMs} ms</dd></div>
                                    )}
                                </dl>

                            ) : (

                                <p className="field-hint field-hint-bad">
                                    HTTP {database?.httpStatus || "—"} - unable to reach the database.
                                </p>

                            )}

                            {connectionString && (

                                <div className="smoke-test-connection">
                                    <div className="smoke-test-connection-header"><span>Connection</span></div>
                                    <code className="smoke-test-connection-value">{connectionString}</code>
                                </div>

                            )}

                        </div>

                        <div className="card health-card">

                            <div className="health-card-head">
                                <StatusDot ok={true} />
                                <h2 className="card-title" style={{ margin: 0 }}>Frontend</h2>
                                <StatusPill ok={true} />
                            </div>

                            <p className="field-hint">
                                No separate check needed - you're viewing this page live from deploymentportal.in
                                on Cloudflare Workers right now, which alone confirms it's reachable.
                            </p>

                        </div>

                    </div>

                )}

                <div className="button-row" style={{ marginTop: 20 }}>
                    <a href="/" className="btn btn-secondary">&larr; Back to portal</a>
                </div>

            </div>

        </div>

    );

}

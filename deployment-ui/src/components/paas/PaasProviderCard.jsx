import { useEffect, useState } from "react";

import { getPaasStatus, getPaasServiceMetrics } from "../../services/paasService";

// Status-only display for one connected provider (Render/Cloudflare/
// Netlify/Vercel) - connecting/editing/clearing the credential itself now
// lives on Settings > Credentials (see PaasLoginSection), so this card
// only ever renders for a provider PaasHosting.jsx has already confirmed
// is configured. No polling, same reasoning as before: no shared server-
// side cache across four real external APIs, so an open tab shouldn't
// re-hit all of them on a timer - fetch on mount plus a manual Refresh.
export default function PaasProviderCard({ provider, label }) {

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    // Render's real CPU/memory series per service, keyed by id/name - the
    // only provider with a comparable per-resource "load" API (see
    // PaasProviderService.GetServiceMetricsAsync). Fetched lazily once the
    // service list is in, not blocking the rest of the card on it.
    const [metricsByService, setMetricsByService] = useState({});

    function refresh() {

        setLoading(true);
        setMetricsByService({});

        getPaasStatus(provider).then((result) => {

            setStatus(result);
            setLoading(false);

            if (provider === "render" && result?.found) {

                result.services.forEach((svc) => {

                    const id = svc.id || svc.name;

                    getPaasServiceMetrics(provider, id)
                        .then((metrics) => setMetricsByService((current) => ({ ...current, [id]: metrics })))
                        .catch(() => {});

                });

            }

        }).catch((err) => {

            console.error(err);
            setLoading(false);

        });

    }

    useEffect(refresh, [provider]);

    function formatLoad(svc) {

        const metrics = metricsByService[svc.id || svc.name];

        if (!metrics) return "…";
        if (!metrics.found || metrics.series.length === 0) return "—";

        return metrics.series
            .map((s) => {
                const latest = s.points[s.points.length - 1];
                return latest ? `${s.name}: ${Math.round(latest.value * 100) / 100}${s.unit}` : null;
            })
            .filter(Boolean)
            .join(" · ") || "—";

    }

    const isRender = provider === "render";

    return (

        <div className="card">

            <h2 className="card-title">
                {label}
                {" "}
                {!loading && (
                    <span className={`badge ${status?.found ? "badge-success" : "badge-warning"}`}>
                        {status?.found ? "Connected" : "Configured"}
                    </span>
                )}
            </h2>

            {loading && <p className="field-hint">Checking...</p>}

            {!loading && status && (

                <>

                {!status.found && (
                    <p className="error-message">{status.error || `Unable to reach ${label}.`}</p>
                )}

                {status.found && (

                    <>

                    {status.accountLabel && (
                        <p className="field-hint field-hint-good">
                            Signed in as: <strong>{status.accountLabel}</strong>
                        </p>
                    )}

                    {status.services.length === 0 ? (

                        <p className="empty-state" style={{ textAlign: "left" }}>
                            No services/projects found in this {label} account.
                        </p>

                    ) : (

                        <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Status</th>
                                    {isRender && <th>Plan</th>}
                                    <th>Commit</th>
                                    {isRender && <th>Load</th>}
                                    <th>Updated</th>
                                </tr>
                            </thead>

                            <tbody>

                                {status.services.map((svc, i) => (

                                    <tr key={i}>
                                        <td>
                                            {svc.url ? (
                                                <a href={svc.url} target="_blank" rel="noreferrer">{svc.name}</a>
                                            ) : svc.name}
                                        </td>
                                        <td>{svc.type || "—"}</td>
                                        <td>{svc.status || "—"}</td>
                                        {isRender && <td>{svc.plan || "—"}</td>}
                                        <td>
                                            {svc.commitSha ? (
                                                <>
                                                    <span className="smoke-test-metric-mono">{svc.commitSha.slice(0, 7)}</span>
                                                    {svc.commitMessage && (
                                                        <div className="field-hint" style={{ marginTop: "2px" }}>{svc.commitMessage}</div>
                                                    )}
                                                </>
                                            ) : "—"}
                                        </td>
                                        {isRender && <td>{formatLoad(svc)}</td>}
                                        <td>{svc.updatedAt ? new Date(svc.updatedAt).toLocaleString() : "—"}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                        </div>

                    )}

                    </>

                )}

                <div className="button-row" style={{ marginTop: "14px" }}>
                    <button type="button" className="btn btn-secondary" onClick={refresh}>Refresh</button>
                </div>

                </>

            )}

        </div>

    );

}

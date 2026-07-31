import { useState } from "react";

import StatusBadge from "../StatusBadge";
import CopyButton from "../common/CopyButton";
import { getBackendHealth, getDatabaseHealth } from "../../services/healthService";

// Backend/Database expand into a live "check right now" call against
// /api/health(/db) - real numbers measured on that request, not cached
// from the workflow run. Frontend has no equivalent live endpoint (this
// portal doesn't track a deployed frontend URL to ping), so it expands
// into the job's own timing from GitHub instead.
const HEALTH_FETCHERS = {
    backend: getBackendHealth,
    database: getDatabaseHealth
};

function formatDuration(startedAt, completedAt) {

    if (!startedAt || !completedAt) return null;

    const seconds = Math.max(0, Math.round((new Date(completedAt) - new Date(startedAt)) / 1000));

    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

}

export default function SmokeTestCard({ kind, label, job }) {

    const [expanded, setExpanded] = useState(false);
    const [health, setHealth] = useState(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [healthError, setHealthError] = useState("");

    const status = job ? (job.status === "completed" ? job.conclusion : job.status) : "queued";
    const fetcher = HEALTH_FETCHERS[kind];

    async function loadHealth() {

        try {

            setHealthLoading(true);
            setHealthError("");

            setHealth(await fetcher());

        }
        catch (err) {

            console.error(err);
            setHealthError("Unable to reach this service.");

        }
        finally {

            setHealthLoading(false);

        }

    }

    function toggle() {

        const next = !expanded;
        setExpanded(next);

        if (next && fetcher && !health && !healthLoading) {
            loadHealth();
        }

    }

    const duration = formatDuration(job?.startedAt, job?.completedAt);

    return (

        <div className={`smoke-test-card ${expanded ? "smoke-test-card-expanded" : ""}`}>

            <button type="button" className="smoke-test-card-header" onClick={toggle} aria-expanded={expanded}>

                <span className="smoke-test-card-title">{label}</span>

                <span className="smoke-test-card-header-right">
                    <StatusBadge status={status} />
                    <span className="smoke-test-chevron" aria-hidden="true">&#9662;</span>
                </span>

            </button>

            {expanded && (

                <div className="smoke-test-card-body">

                    {fetcher ? (

                        <HealthDetails kind={kind} loading={healthLoading} error={healthError} health={health} onRetry={loadHealth} />

                    ) : (

                        <dl className="smoke-test-metrics">

                            <div className="smoke-test-metric">
                                <dt>Duration</dt>
                                <dd>{duration || "—"}</dd>
                            </div>

                        </dl>

                    )}

                    {job?.htmlUrl && (

                        <a
                            href={job.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm smoke-test-card-link"
                        >
                            View Job &rarr;
                        </a>

                    )}

                </div>

            )}

        </div>

    );

}

function HealthDetails({ kind, loading, error, health, onRetry }) {

    if (loading) {
        return <p className="field-hint">Checking...</p>;
    }

    if (error) {
        return (
            <>
                <p className="field-hint field-hint-bad">{error}</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button>
            </>
        );
    }

    if (!health) {
        return null;
    }

    const responseGood = health.httpStatus >= 200 && health.httpStatus < 300;
    const connectionString = health.host ? `${health.host}:${health.port}/${health.database}` : null;

    return (

        <>

        <dl className="smoke-test-metrics">

            <div className="smoke-test-metric">
                <dt>Response</dt>
                <dd className={responseGood ? "field-hint-good" : "field-hint-bad"}>
                    HTTP {health.httpStatus}
                </dd>
            </div>

            {kind === "backend" && (

                <>
                    <div className="smoke-test-metric">
                        <dt>Uptime</dt>
                        <dd>{health.uptimeSeconds}s</dd>
                    </div>
                    <div className="smoke-test-metric">
                        <dt>Memory</dt>
                        <dd>{health.memoryMb} MB</dd>
                    </div>
                    <div className="smoke-test-metric">
                        <dt>CPU</dt>
                        <dd>{health.cpuPercent}%</dd>
                    </div>
                </>

            )}

            {kind === "database" && (

                <>
                    <div className="smoke-test-metric">
                        <dt>Mode</dt>
                        <dd>{health.mode}</dd>
                    </div>

                    {health.responseTimeMs != null && (
                        <div className="smoke-test-metric">
                            <dt>Query Time</dt>
                            <dd>{health.responseTimeMs} ms</dd>
                        </div>
                    )}

                    {health.host && (
                        <>
                            <div className="smoke-test-metric">
                                <dt>Host</dt>
                                <dd className="smoke-test-metric-mono">{health.host}</dd>
                            </div>
                            <div className="smoke-test-metric">
                                <dt>Port</dt>
                                <dd className="smoke-test-metric-mono">{health.port}</dd>
                            </div>
                            <div className="smoke-test-metric">
                                <dt>Database</dt>
                                <dd className="smoke-test-metric-mono">{health.database}</dd>
                            </div>
                        </>
                    )}
                </>

            )}

        </dl>

        {/* Its own block, not another metric row — a full "host:port/db"
            string is long enough that squeezing it into the same
            label-left/value-right row as everything above just wraps
            awkwardly and breaks alignment. Username/password are never
            part of this — see DatabaseHealthDto. */}
        {connectionString && (

            <div className="smoke-test-connection">

                <div className="smoke-test-connection-header">
                    <span>Connection string</span>
                    <CopyButton value={connectionString} label="Copy connection string" />
                </div>

                <code className="smoke-test-connection-value">{connectionString}</code>

            </div>

        )}

        </>

    );

}

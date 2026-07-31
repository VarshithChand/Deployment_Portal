import { useEffect, useState } from "react";

import { getLatestSmokeTest, runSmokeTests, getSmokeTestRun } from "../../services/smokeTestService";
import SmokeTestCard from "./SmokeTestCard";

const POLL_INTERVAL = 3000;

// Job names have to match the "name:" fields set on each job in
// .github/workflows/smoke-tests.yml exactly - that's the only way to
// tell GitHub's per-job results apart from here. "kind" picks what a
// card's expanded view shows (see SmokeTestCard).
const KNOWN_JOBS = [
    { name: "Backend Smoke Test", label: "Backend", kind: "backend" },
    { name: "Frontend Smoke Test", label: "Frontend", kind: "frontend" },
    { name: "Database Smoke Test", label: "Database", kind: "database" }
];

const ACTIVE_STATUSES = new Set(["queued", "in_progress"]);

export default function SmokeTestsView() {

    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [triggering, setTriggering] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {

        let cancelled = false;

        getLatestSmokeTest()
            .then((data) => {
                if (!cancelled) setResult(data);
            })
            .catch((err) => console.error(err))
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };

    }, []);

    // Polls the specific run just triggered/being watched - not "latest"
    // again, so this can't be confused by a different run (e.g. the
    // workflow's own push-to-master trigger) landing in between polls.
    useEffect(() => {

        if (!result?.runId || !ACTIVE_STATUSES.has(result.status)) return;

        let cancelled = false;

        const timer = setTimeout(async () => {

            try {
                const data = await getSmokeTestRun(result.runId);
                if (!cancelled) setResult(data);
            }
            catch (err) {
                console.error(err);
            }

        }, POLL_INTERVAL);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };

    }, [result]);

    async function handleRun() {

        try {

            setTriggering(true);
            setError("");

            const data = await runSmokeTests();
            setResult(data);

            if (data.status === "error") {
                setError(data.conclusion || "Failed to start smoke tests.");
            }

        }
        catch (err) {

            console.error(err);
            setError(err.response?.data?.message || "Failed to start smoke tests.");

        }
        finally {

            setTriggering(false);

        }

    }

    const jobsByName = new Map((result?.jobs || []).map((j) => [j.name, j]));
    const isRunning = triggering || (result && ACTIVE_STATUSES.has(result.status));
    const hasRun = result && result.status !== "not_run" && result.status !== "error";

    return (

        <div className="card">

            <h2 className="card-title">Smoke Tests</h2>

            <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                Runs a dedicated pipeline that boots the backend, builds and serves the
                frontend, and connects to a real database — verifying each one actually
                works end to end, not just that it builds.
            </p>

            {error && <div className="error-message">{error}</div>}

            <div className="button-row" style={{ marginBottom: 20 }}>

                <button type="button" className="btn btn-primary" onClick={handleRun} disabled={isRunning}>
                    {isRunning ? "Running..." : "Re-run Smoke Tests"}
                </button>

                {result?.htmlUrl && (

                    <a href={result.htmlUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                        View on GitHub &rarr;
                    </a>

                )}

            </div>

            {loading ? (

                <p className="field-hint">Loading last results...</p>

            ) : !hasRun ? (

                <p className="empty-state">No smoke test run yet — click &quot;Re-run Smoke Tests&quot; to start one.</p>

            ) : (

                <div className="smoke-test-grid">

                    {KNOWN_JOBS.map(({ name, label, kind }) => (

                        <SmokeTestCard key={name} kind={kind} label={label} job={jobsByName.get(name)} />

                    ))}

                </div>

            )}

            {result?.createdAt && (

                <p className="field-hint" style={{ marginTop: 15 }}>
                    Last run: {new Date(result.createdAt).toLocaleString()}
                </p>

            )}

        </div>

    );

}

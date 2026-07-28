import { useEffect, useState } from "react";

import { getRunById } from "../../services/historyService";
import StatusBadge from "../StatusBadge";

const POLL_INTERVAL = 3000;

export default function DeploymentProgress({ runId }) {

    const [run, setRun] = useState(null);

    useEffect(() => {

        setRun(null);

        if (!runId) {
            return;
        }

        let cancelled = false;
        let timer;

        async function poll() {

            const data = await getRunById(runId);

            if (cancelled) {
                return;
            }

            setRun(data);

            if (data && data.status !== "completed") {
                timer = setTimeout(poll, POLL_INTERVAL);
            }

        }

        poll();

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };

    }, [runId]);

    if (!runId) {
        return null;
    }

    const status = run?.status || "queued";
    const conclusion = run?.conclusion;
    const isDone = status === "completed";
    const isFailed = isDone && conclusion !== "success";

    const label = isDone
        ? (isFailed ? "Failed" : "Completed")
        : status === "in_progress"
            ? "Running"
            : "Queued";

    let barClass = "progress-bar";

    if (!isDone) {
        barClass += " progress-bar-indeterminate";
    } else {
        barClass += isFailed ? " progress-bar-failed" : " progress-bar-success";
    }

    return (

        <div className="card">

            <h2 className="card-title">
                Live Deployment Progress
            </h2>

            <div className="progress-status-row">

                <StatusBadge status={isDone ? conclusion : status} />

                <span>{label}</span>

                {run?.htmlUrl && (

                    <a
                        href={run.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ marginLeft: "auto" }}
                    >
                        View on GitHub &rarr;
                    </a>

                )}

            </div>

            <div className="progress">

                <div
                    className={barClass}
                    style={isDone ? { width: "100%" } : undefined}
                />

            </div>

        </div>

    );

}

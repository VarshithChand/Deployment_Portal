import { useEffect, useState } from "react";

import useToast from "../hooks/useToast";
import StatusBadge from "./StatusBadge";
import { analyzeRunError } from "../services/historyService";

// Shows a job's full failure detail in-app - the inline row already
// summarizes it, but long/multi-line annotation text gets cramped there.
// This is the "don't make me open GitHub" escape hatch. It also kicks off
// a plain-English explanation of the raw text on open (GitHub Models
// against this visitor's own token, falling back to a built-in pattern
// library server-side when that's unavailable - see ErrorAnalysisService).
export default function HistoryErrorDialog({ open, jobError, onClose }) {

    const toast = useToast();

    const [analysis, setAnalysis] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [analyzeFailed, setAnalyzeFailed] = useState(false);

    useEffect(() => {

        if (!open || !jobError) {

            setAnalysis(null);
            setAnalyzing(false);
            setAnalyzeFailed(false);
            return;

        }

        let cancelled = false;

        setAnalysis(null);
        setAnalyzeFailed(false);
        setAnalyzing(true);

        analyzeRunError(jobError).then((result) => {

            if (!cancelled) {

                setAnalysis(result);
                setAnalyzeFailed(!result?.explanation);
                setAnalyzing(false);

            }

        });

        return () => {
            cancelled = true;
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, jobError?.jobName, jobError?.failedStep]);

    if (!open || !jobError) {
        return null;
    }

    const fullText = [

        jobError.jobName,
        jobError.failedStep ? `Failed step: ${jobError.failedStep}` : null,
        analysis?.explanation ? `\nExplanation: ${analysis.explanation}` : null,
        "",
        jobError.messages && jobError.messages.length > 0
            ? jobError.messages.join("\n\n")
            : "GitHub didn't attach a detailed error message to this step."

    ].filter((line) => line !== null).join("\n");

    function handleCopy() {

        navigator.clipboard.writeText(fullText)
            .then(() => toast.show("Error details copied to clipboard", "success"))
            .catch(() => toast.show("Unable to copy to clipboard", "error"));

    }

    return (

        <div
            className="dialog-backdrop"
            role="presentation"
            onClick={onClose}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        >

            <div
                className="dialog dialog-wide"
                role="presentation"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
            >

                <h2>
                    {jobError.jobName}
                    {" "}
                    <StatusBadge status={jobError.conclusion} />
                </h2>

                {jobError.failedStep && (
                    <p className="field-hint">
                        Failed on the <strong>"{jobError.failedStep}"</strong> step.
                    </p>
                )}

                {analyzing && (

                    <p className="empty-state" style={{ textAlign: "left" }}>
                        Analyzing what went wrong...
                    </p>

                )}

                {!analyzing && analysis?.explanation && (

                    <div className="info-row" style={{ display: "block", border: "none", padding: "0 0 16px" }}>

                        <span style={{ display: "block", marginBottom: "6px" }}>
                            {analysis.source === "ai" ? "AI explanation" : "Explanation"}
                        </span>

                        <strong style={{ fontWeight: 400, display: "block" }}>
                            {analysis.explanation}
                        </strong>

                    </div>

                )}

                {!analyzing && analyzeFailed && (

                    <p className="field-hint" style={{ marginBottom: "16px" }}>
                        Couldn't reach the explanation service just now — the raw message below is still complete.
                    </p>

                )}

                {jobError.messages && jobError.messages.length > 0 ? (

                    <pre className="yaml-viewer">
                        <code>{jobError.messages.join("\n\n")}</code>
                    </pre>

                ) : (

                    <p className="error-message">
                        GitHub didn't attach a detailed error message to this step. This
                        usually means the failure happened before the step itself ran
                        (for example a temporary GitHub runner outage) rather than a
                        line in the pipeline failing.
                    </p>

                )}

                <div>

                    <button
                        type="button"
                        className="btn btn-success"
                        onClick={handleCopy}
                    >
                        Copy
                    </button>

                    {jobError.htmlUrl && (

                        <a
                            href={jobError.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary"
                        >
                            Open on GitHub
                        </a>

                    )}

                    <button
                        type="button"
                        className="btn"
                        onClick={onClose}
                    >
                        Close
                    </button>

                </div>

            </div>

        </div>

    );

}

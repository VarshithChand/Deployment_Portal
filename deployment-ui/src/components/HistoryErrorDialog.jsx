import useToast from "../hooks/useToast";
import StatusBadge from "./StatusBadge";

// Shows a job's full failure detail in-app - the inline row already
// summarizes it, but long/multi-line annotation text gets cramped there.
// This is the "don't make me open GitHub" escape hatch.
export default function HistoryErrorDialog({ open, jobError, onClose }) {

    const toast = useToast();

    if (!open || !jobError) {
        return null;
    }

    const fullText = [

        jobError.jobName,
        jobError.failedStep ? `Failed step: ${jobError.failedStep}` : null,
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

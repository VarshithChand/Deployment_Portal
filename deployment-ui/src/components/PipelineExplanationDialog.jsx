// Deploy page's "Explain Pipeline" — a plain-English summary of what the
// selected workflow actually does, fetched from GET /api/github/explain-pipeline
// (GitHub Models against your own token, falling back server-side to a
// summary read from the workflow's own triggers/jobs/steps — see
// PipelineExplanationService). Same open/loading/error/content shape as
// YamlViewerDialog, one dialog over.
export default function PipelineExplanationDialog({

    open,
    workflowName,
    loading,
    error,
    explanation,
    source,
    onClose

}) {

    if (!open) {
        return null;
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
                    {workflowName || "This pipeline"}
                </h2>

                {loading && (
                    <p className="field-hint">Reading the pipeline...</p>
                )}

                {!loading && error && (
                    <div className="error-message">{error}</div>
                )}

                {!loading && !error && explanation && (

                    <>

                    <p className="field-hint" style={{ marginBottom: "6px" }}>
                        {source === "ai" ? "AI explanation" : "Explanation"}
                    </p>

                    <p style={{ lineHeight: 1.6 }}>
                        {explanation}
                    </p>

                    </>

                )}

                <div>

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

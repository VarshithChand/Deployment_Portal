import useToast from "../hooks/useToast";

export default function YamlViewerDialog({

    open,
    path,
    loading,
    error,
    content,
    onClose

}) {

    const toast = useToast();

    if (!open) {
        return null;
    }

    function handleCopy() {

        navigator.clipboard.writeText(content || "")
            .then(() => toast.show("YAML copied to clipboard", "success"))
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

                <h2>{path || "Workflow YAML"}</h2>

                {loading && (
                    <p className="field-hint">Loading workflow file...</p>
                )}

                {!loading && error && (
                    <div className="error-message">{error}</div>
                )}

                {!loading && !error && (
                    <pre className="yaml-viewer">
                        <code>{content}</code>
                    </pre>
                )}

                <div>

                    <button
                        type="button"
                        className="btn btn-success"
                        onClick={handleCopy}
                        disabled={loading || !!error}
                    >
                        Copy
                    </button>

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

import { useEffect, useState } from "react";
import { Folder, FileText, ChevronRight, RotateCw } from "lucide-react";

import { getRepoContents } from "../../services/githubService";

function formatSize(bytes) {

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

}

// Uses dp-fb-* classes only - styled by Dashboard.jsx's own CSS (this
// renders as a child of that page's .dp-root, so those selectors reach it
// exactly as if it were written inline there), the same "dp-panel" visual
// language as the rest of the Overview page rather than the older generic
// .card look AllRepositoriesCard/AzureDevOpsCard further down still use -
// this is a NEW section, not a revived one, so it follows this page's
// current conventions from the start.
export default function RepoFileBrowserCard() {

    const [path, setPath] = useState("");
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    function load(targetPath, force = false) {

        setLoading(true);
        setError("");

        getRepoContents(targetPath, undefined, force)
            .then((response) => {

                const data = response.data;

                if (data.found === false) {
                    setError(data.error || "Unable to load this path.");
                    setResult(null);
                }
                else {
                    setResult(data);
                }

            })
            .catch((err) => {
                setError(err.response?.data?.message || "Unable to reach the Deployment API.");
                setResult(null);
            })
            .finally(() => setLoading(false));

    }

    useEffect(() => {

        load(path);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path]);

    const segments = path ? path.split("/") : [];

    function goToRoot() {
        setPath("");
    }

    function goToSegment(index) {
        setPath(segments.slice(0, index + 1).join("/"));
    }

    function openEntry(entry) {

        if (entry.type === "dir") {
            setPath(entry.path);
        }

    }

    return (

        <div className="dp-fb">

            <div className="dp-fb-breadcrumb">

                <button type="button" className="dp-fb-crumb" onClick={goToRoot}>
                    {/* Repo root - the connected repo's own name would need
                        an extra prop/fetch this card doesn't otherwise need;
                        "Files" reads fine as the root label on its own. */}
                    Files
                </button>

                {segments.map((seg, i) => (

                    <span key={i} className="dp-fb-crumb-group">
                        <ChevronRight size={12} className="dp-fb-crumb-sep" />
                        <button
                            type="button"
                            className="dp-fb-crumb"
                            disabled={i === segments.length - 1 && result && !result.isDirectory}
                            onClick={() => goToSegment(i)}
                        >
                            {seg}
                        </button>
                    </span>

                ))}

                <button type="button" className="dp-fb-refresh" onClick={() => load(path, true)} title="Refresh" aria-label="Refresh">
                    <RotateCw size={13} />
                </button>

            </div>

            {loading && <p className="dp-empty dp-small">Loading...</p>}

            {!loading && error && <p className="dp-empty dp-small">{error}</p>}

            {!loading && !error && result && result.isDirectory && (

                result.entries.length === 0 ? (

                    <p className="dp-empty dp-small">This folder is empty.</p>

                ) : (

                    <div className="dp-fb-list">

                        {result.entries.map((entry) => (

                            <button
                                key={entry.path}
                                type="button"
                                className="dp-fb-row"
                                onClick={() => openEntry(entry)}
                                disabled={entry.type !== "dir"}
                            >
                                {entry.type === "dir" ? <Folder size={15} className="dp-fb-icon dir" /> : <FileText size={15} className="dp-fb-icon" />}
                                <span className="dp-fb-name">{entry.name}</span>
                                {entry.type !== "dir" && <span className="dp-fb-size dp-mono">{formatSize(entry.size)}</span>}
                                {entry.type === "dir" && <ChevronRight size={13} className="dp-fb-chevron" />}
                            </button>

                        ))}

                    </div>

                )

            )}

            {!loading && !error && result && !result.isDirectory && (

                <div className="dp-fb-file">

                    <div className="dp-fb-file-head">
                        <span className="dp-fb-file-name">{result.name}</span>
                        <span className="dp-mono dp-muted">{formatSize(result.size)}</span>
                    </div>

                    {result.isBinary ? (
                        <p className="dp-empty dp-small">Binary file - preview not available.</p>
                    ) : result.tooLarge ? (
                        <p className="dp-empty dp-small">File is too large to preview here.</p>
                    ) : (
                        <pre className="dp-fb-code">{result.content}</pre>
                    )}

                </div>

            )}

        </div>

    );

}

import { useEffect, useMemo, useState } from "react";

import { getAzureDevOpsPipelines, getAzureDevOpsArtifactHistory } from "../../services/azureDevOpsService";
import ComboBox from "../common/ComboBox";
import CopyButton from "../common/CopyButton";
import Pagination from "../common/Pagination";
import usePagination from "../../hooks/usePagination";
import useAzureDevOpsProject from "../../hooks/useAzureDevOpsProject";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

// Same CI/CD/CI+CD name-based heuristic as AzureDevOpsPipelinesView's own
// classifyPipeline - duplicated rather than imported, same reasoning as
// that file's own comment on why it doesn't share GitHub's
// classifyWorkflow either.
function classifyPipeline(item) {

    const text = `${item.name} ${item.folder || ""}`;

    const hasCi = /\bci\b/i.test(text) || /\bbuild\b/i.test(text) || /\btest\b/i.test(text);
    const hasCd = /\bcd\b/i.test(text) || /\brelease\b/i.test(text) || /\bdeploy\b/i.test(text);

    if (hasCi && hasCd) {
        return "CI+CD";
    }

    if (hasCi) {
        return "CI";
    }

    return "CD";

}

function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

// Read-only "everything about this one artifact" dialog - Name/Type/
// Location/Download plus which run it came from, all in one place, with
// its own copy buttons, rather than making a visitor hunt across the
// table row for each value. Rendered as a sibling of .card by the caller,
// not a child of it - see AzureDevOpsPipelinesView's own dialog placement
// fix for why nesting a fixed-position dialog inside .card (which has its
// own backdrop-filter) traps it inside the card's bounds instead of the
// viewport.
function ArtifactDetailDialog({ artifact, onClose }) {

    if (!artifact) return null;

    return (

        <div className="dialog-backdrop" role="presentation" onClick={onClose} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>

            <div className="dialog" role="presentation" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>

                <h2>{artifact.name}</h2>

                <div className="info-row">
                    <span>From run</span>
                    <strong>
                        {artifact.runWebUrl ? (
                            <a href={artifact.runWebUrl} target="_blank" rel="noreferrer">{artifact.runName || `#${artifact.runId}`}</a>
                        ) : (artifact.runName || `#${artifact.runId}`)}
                    </strong>
                </div>

                <div className="info-row">
                    <span>Run date</span>
                    <strong>{formatDate(artifact.runCreatedDate)}</strong>
                </div>

                <div className="info-row">
                    <span>Type</span>
                    <strong>{artifact.type || "—"}</strong>
                </div>

                <div className="info-row">
                    <span>Location</span>
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", wordBreak: "break-all" }}>
                        {artifact.location || "—"}
                        {artifact.location && <CopyButton value={artifact.location} label="Copy location" />}
                    </strong>
                </div>

                <div className="info-row">
                    <span>Download URL</span>
                    <strong style={{ display: "flex", alignItems: "center", gap: "6px", wordBreak: "break-all" }}>
                        {artifact.downloadUrl ? (
                            <a href={artifact.downloadUrl} target="_blank" rel="noreferrer">{artifact.downloadUrl}</a>
                        ) : "—"}
                        {artifact.downloadUrl && <CopyButton value={artifact.downloadUrl} label="Copy download URL" />}
                    </strong>
                </div>

                <div style={{ marginTop: "16px" }}>
                    <button type="button" className="btn" onClick={onClose}>Close</button>
                </div>

            </div>

        </div>

    );

}

// Azure DevOps' Build Artifacts sub-page - the same CI/CD/CI+CD-tabbed,
// search-by-name pipeline picker Pipelines itself uses, then EVERY recent
// run's own artifacts for that pipeline, each row still tagged with the
// run it came from. Running the same pipeline twice therefore shows two
// separate, individually copyable rows with the same artifact name - no
// need to open Azure DevOps' own portal to find and copy an older
// artifact. Copy-name button per row; clicking a row opens the full
// detail dialog (run, type, location, download URL). The project itself
// is picked once on the Dashboard sub-page and shared via
// AzureDevOpsProjectContext - this page no longer asks for one separately.
export default function AzureDevOpsArtifactsView() {

    const { setTab } = useNavigation();
    const { project } = useAzureDevOpsProject();

    const [pipelines, setPipelines] = useState(null);
    const [pipelinesLoading, setPipelinesLoading] = useState(false);

    const [mode, setMode] = useState("CI");
    const [pipelineId, setPipelineId] = useState("");

    const [artifactHistory, setArtifactHistory] = useState(null);
    const [artifactsLoading, setArtifactsLoading] = useState(false);

    const [detailArtifact, setDetailArtifact] = useState(null);

    useEffect(() => {

        setPipelineId("");
        setArtifactHistory(null);

        if (!project) {
            setPipelines(null);
            return;
        }

        setPipelinesLoading(true);

        getAzureDevOpsPipelines(project.name).then((data) => {
            setPipelines(data);
            setPipelinesLoading(false);
        }).catch((err) => {
            console.error(err);
            setPipelines({ configured: false, error: "Unable to load pipelines." });
            setPipelinesLoading(false);
        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id]);

    function handleModeChange(nextMode) {

        setMode(nextMode);
        setPipelineId("");
        setArtifactHistory(null);

    }

    function handleSelectPipeline(nextId) {

        setPipelineId(nextId);
        setArtifactHistory(null);

        if (!nextId) return;

        setArtifactsLoading(true);

        getAzureDevOpsArtifactHistory(project.name, Number(nextId)).then((data) => {
            setArtifactHistory(data);
            setArtifactsLoading(false);
        }).catch((err) => {
            console.error(err);
            setArtifactHistory({ configured: false, error: "Unable to load artifacts." });
            setArtifactsLoading(false);
        });

    }

    const modeFilteredPipelines = useMemo(
        () => (pipelines?.pipelines || []).filter((p) => classifyPipeline(p) === mode),
        [pipelines, mode]
    );

    // Flattened into one row per artifact, each carrying its own run's
    // context - the shape the table/pagination actually want, kept
    // separate from the grouped-by-run shape the API returns.
    const flattenedArtifacts = useMemo(() => {

        const runs = artifactHistory?.runs || [];

        return runs.flatMap((run) =>
            run.artifacts.map((artifact) => ({
                ...artifact,
                runId: run.runId,
                runName: run.runName,
                runResult: run.result,
                runCreatedDate: run.createdDate,
                runWebUrl: run.webUrl
            }))
        );

    }, [artifactHistory]);

    const {
        page, setPage, pageCount, pageItems,
        totalCount, startIndex, endIndex
    } = usePagination(flattenedArtifacts, PAGE_SIZE);

    if (!project) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Pick an Azure DevOps project on the{" "}
                    <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("dashboard")}>Dashboard</button>
                    {" "}first.
                </p>
            </div>
        );

    }

    return (

        <>

        <ArtifactDetailDialog artifact={detailArtifact} onClose={() => setDetailArtifact(null)} />

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>{project.name}</h2>
                <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("dashboard")}>Change project</button>
            </div>

            {pipelinesLoading ? (

                <p className="field-hint">Loading pipelines...</p>

            ) : !pipelines?.configured || pipelines.error ? (

                <p className="error-message">{pipelines?.error || "Azure DevOps is not configured."}</p>

            ) : (

                <>

                <fieldset className="form-group" style={{ border: "none", padding: 0, margin: 0 }}>

                    <legend className="field-hint" style={{ padding: 0, marginBottom: "6px" }}>Mode</legend>

                    <div className="mode-toggle">

                        <button
                            type="button"
                            className={`mode-toggle-option ${mode === "CI" ? "active" : ""}`}
                            onClick={() => handleModeChange("CI")}
                        >
                            CI
                        </button>

                        <button
                            type="button"
                            className={`mode-toggle-option ${mode === "CD" ? "active" : ""}`}
                            onClick={() => handleModeChange("CD")}
                        >
                            CD
                        </button>

                        <button
                            type="button"
                            className={`mode-toggle-option ${mode === "CI+CD" ? "active" : ""}`}
                            onClick={() => handleModeChange("CI+CD")}
                        >
                            CI+CD
                        </button>

                    </div>

                </fieldset>

                <div className="form-group">

                    <label htmlFor="ado-artifacts-pipeline">Pipeline</label>

                    <ComboBox
                        id="ado-artifacts-pipeline"
                        options={modeFilteredPipelines.map((p) => ({ value: String(p.id), label: p.name }))}
                        value={pipelineId}
                        onChange={handleSelectPipeline}
                        placeholder="Search or select a pipeline..."
                        emptyLabel={`No ${mode} pipeline found`}
                    />

                </div>

                {pipelineId && (

                    artifactsLoading ? (

                        <p className="field-hint">Loading artifacts from recent runs...</p>

                    ) : !artifactHistory?.configured || artifactHistory.error ? (

                        <p className="error-message">{artifactHistory?.error || "Unable to load artifacts."}</p>

                    ) : flattenedArtifacts.length === 0 ? (

                        <p className="empty-state" style={{ textAlign: "left" }}>No artifacts were published by this pipeline's recent runs.</p>

                    ) : (

                        <>

                        <p className="field-hint">
                            Every artifact from this pipeline's last {artifactHistory.runs.length} run{artifactHistory.runs.length === 1 ? "" : "s"} that published one — same-named artifacts from different runs each get their own row.
                        </p>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Artifact</th>
                                        <th>Type</th>
                                        <th>Run</th>
                                        <th>Run Date</th>
                                        <th><span className="visually-hidden">Actions</span></th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {pageItems.map((artifact, index) => (

                                        <tr key={`${artifact.runId}-${artifact.name}-${index}`} className="table-row-clickable" onClick={() => setDetailArtifact(artifact)}>
                                            <td>
                                                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                    {artifact.name}
                                                    <CopyButton value={artifact.name} label="Copy artifact name" />
                                                </span>
                                            </td>
                                            <td>{artifact.type || "—"}</td>
                                            <td>
                                                {artifact.runWebUrl ? (
                                                    <a
                                                        href={artifact.runWebUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {artifact.runName || `#${artifact.runId}`}
                                                    </a>
                                                ) : (artifact.runName || `#${artifact.runId}`)}
                                            </td>
                                            <td>{formatDate(artifact.runCreatedDate)}</td>
                                            <td>
                                                {artifact.downloadUrl && (
                                                    <a
                                                        href={artifact.downloadUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        Download
                                                    </a>
                                                )}
                                            </td>
                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                        </div>

                        <Pagination
                            page={page}
                            pageCount={pageCount}
                            totalCount={totalCount}
                            startIndex={startIndex}
                            endIndex={endIndex}
                            onPageChange={setPage}
                        />

                        </>

                    )

                )}

                </>

            )}

        </div>

        </>

    );

}

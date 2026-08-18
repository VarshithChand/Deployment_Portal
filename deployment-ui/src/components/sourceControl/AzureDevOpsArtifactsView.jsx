import { useEffect, useMemo, useState } from "react";

import { getAzureDevOpsPipelines, getAzureDevOpsLatestArtifacts } from "../../services/azureDevOpsService";
import ComboBox from "../common/ComboBox";
import CopyButton from "../common/CopyButton";
import useAzureDevOpsProject from "../../hooks/useAzureDevOpsProject";
import useNavigation from "../../hooks/useNavigation";

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

// Read-only "everything about this one artifact" dialog - Name/Type/
// Location/Download all in one place, plus its own copy buttons, rather
// than making a visitor hunt across the table row for each value.
// Rendered as a sibling of .card by the caller, not a child of it - see
// AzureDevOpsPipelinesView's own dialog placement fix for why nesting a
// fixed-position dialog inside .card (which has its own backdrop-filter)
// traps it inside the card's bounds instead of the viewport.
function ArtifactDetailDialog({ artifact, onClose }) {

    if (!artifact) return null;

    return (

        <div className="dialog-backdrop" role="presentation" onClick={onClose} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>

            <div className="dialog" role="presentation" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>

                <h2>{artifact.name}</h2>

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
// search-by-name pipeline picker Pipelines itself uses, then that
// pipeline's LATEST run's artifacts directly - no separate "pick a run"
// step, by explicit request. Copy-name button per row; clicking a row
// opens the full detail dialog (type, location, download URL). The
// project itself is picked once on the Dashboard sub-page and shared via
// AzureDevOpsProjectContext - this page no longer asks for one separately.
export default function AzureDevOpsArtifactsView() {

    const { setTab } = useNavigation();
    const { project } = useAzureDevOpsProject();

    const [pipelines, setPipelines] = useState(null);
    const [pipelinesLoading, setPipelinesLoading] = useState(false);

    const [mode, setMode] = useState("CI");
    const [pipelineId, setPipelineId] = useState("");

    const [artifacts, setArtifacts] = useState(null);
    const [artifactsLoading, setArtifactsLoading] = useState(false);

    const [detailArtifact, setDetailArtifact] = useState(null);

    useEffect(() => {

        setPipelineId("");
        setArtifacts(null);

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
        setArtifacts(null);

    }

    function handleSelectPipeline(nextId) {

        setPipelineId(nextId);
        setArtifacts(null);

        if (!nextId) return;

        setArtifactsLoading(true);

        getAzureDevOpsLatestArtifacts(project.name, Number(nextId)).then((data) => {
            setArtifacts(data);
            setArtifactsLoading(false);
        }).catch((err) => {
            console.error(err);
            setArtifacts({ configured: false, error: "Unable to load artifacts." });
            setArtifactsLoading(false);
        });

    }

    const modeFilteredPipelines = useMemo(
        () => (pipelines?.pipelines || []).filter((p) => classifyPipeline(p) === mode),
        [pipelines, mode]
    );

    if (!project) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Pick a project on the{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("azureDevOpsDashboard"); }}>Azure DevOps Dashboard</a>
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
                <a href="#" onClick={(e) => { e.preventDefault(); setTab("azureDevOpsDashboard"); }}>Change project</a>
            </div>

            {pipelinesLoading ? (

                <p className="field-hint">Loading pipelines...</p>

            ) : !pipelines?.configured || pipelines.error ? (

                <p className="error-message">{pipelines?.error || "Azure DevOps is not configured."}</p>

            ) : (

                <>

                <div className="form-group">

                    <label>Mode</label>

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

                </div>

                <div className="form-group">

                    <label>Pipeline</label>

                    <ComboBox
                        options={modeFilteredPipelines.map((p) => ({ value: String(p.id), label: p.name }))}
                        value={pipelineId}
                        onChange={handleSelectPipeline}
                        placeholder="Search or select a pipeline..."
                        emptyLabel={`No ${mode} pipeline found`}
                    />

                </div>

                {pipelineId && (

                    artifactsLoading ? (

                        <p className="field-hint">Loading the latest artifacts...</p>

                    ) : !artifacts?.configured || artifacts.error ? (

                        <p className="error-message">{artifacts?.error || "Unable to load artifacts."}</p>

                    ) : !artifacts.runId ? (

                        <p className="empty-state" style={{ textAlign: "left" }}>This pipeline has no runs yet.</p>

                    ) : (

                        <>

                        <p className="field-hint">
                            From the latest run{artifacts.runName ? ` — "${artifacts.runName}"` : ""} (#{artifacts.runId}).
                        </p>

                        {artifacts.artifacts.length === 0 ? (

                            <p className="empty-state" style={{ textAlign: "left" }}>No artifacts were published by this run.</p>

                        ) : (

                            <div className="table-scroll">

                                <table className="table">

                                    <thead>
                                        <tr>
                                            <th>Artifact</th>
                                            <th>Type</th>
                                            <th></th>
                                        </tr>
                                    </thead>

                                    <tbody>

                                        {artifacts.artifacts.map((artifact) => (

                                            <tr key={artifact.name} className="table-row-clickable" onClick={() => setDetailArtifact(artifact)}>
                                                <td>
                                                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                        {artifact.name}
                                                        <CopyButton value={artifact.name} label="Copy artifact name" />
                                                    </span>
                                                </td>
                                                <td>{artifact.type || "—"}</td>
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

                        )}

                        </>

                    )

                )}

                </>

            )}

        </div>

        </>

    );

}

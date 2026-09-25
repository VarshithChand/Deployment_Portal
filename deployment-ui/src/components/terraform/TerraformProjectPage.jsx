import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileCode, FolderUp, Sparkles, PlayCircle, Rocket, Upload } from "lucide-react";

import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import CopilotMarkdown from "../copilot/CopilotMarkdown";
import TypedConfirmDialog from "../cloudServices/TypedConfirmDialog";
import TerraformFileTree from "./TerraformFileTree";
import { TERRAFORM_RESOURCE_TEMPLATES } from "../../utils/terraformTemplates";
import {
    getTerraformProject, deleteTerraformProject, uploadFilesToProject,
    getTerraformProjectFile, updateTerraformProjectFile, deleteTerraformProjectFile,
    explainTerraformProject, previewTerraformProject, planTerraformProject, applyTerraformProject
} from "../../services/terraformService";

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

// One project's own page - its file tree, its own Explain/Preview/Plan/
// Apply. See TerraformProjectsList's own comment for why each uploaded
// folder gets one of these instead of merging into a shared list.
export default function TerraformProjectPage({ projectId, onBack, onDeleted }) {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();
    const filesInputRef = useRef(null);
    const folderInputRef = useRef(null);

    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);

    const [uploading, setUploading] = useState(false);
    const [uploadCount, setUploadCount] = useState(0);

    const [selectedPath, setSelectedPath] = useState(null);
    const [openContent, setOpenContent] = useState("");
    const [openLoading, setOpenLoading] = useState(false);
    const [savingOpen, setSavingOpen] = useState(false);

    const [explaining, setExplaining] = useState(false);
    const [explanation, setExplanation] = useState(null);

    const [previewing, setPreviewing] = useState(false);
    const [preview, setPreview] = useState(null); // { resources, narrative }

    const [planning, setPlanning] = useState(false);
    const [plan, setPlan] = useState(null);
    const [planError, setPlanError] = useState(null);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [applying, setApplying] = useState(false);
    const [applyOutput, setApplyOutput] = useState(null);
    const [applyError, setApplyError] = useState(null);

    function load() {
        setLoading(true);
        getTerraformProject(projectId)
            .then(setProject)
            .catch((err) => {
                console.error(err);
                toast.show("Unable to load this project.", "error");
                onBack();
            })
            .finally(() => setLoading(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(load, [projectId]);

    async function processPicked(pickedList) {

        const picked = Array.from(pickedList || []);

        if (picked.length === 0) return;

        const widened = /\.(tf|tf\.json|tfvars|tfvars\.json|json|md)$|(^|\/)\.[A-Za-z0-9_-]+$/i;
        const tfFiles = picked.filter((f) => widened.test(f.webkitRelativePath || f.name));
        const skippedCount = picked.length - tfFiles.length;

        if (skippedCount > 0) {
            toast.show(`Skipped ${skippedCount} file(s) of a type this page doesn't store.`, "error");
        }

        if (tfFiles.length === 0) return;

        function relativePathFor(f) {
            if (!f.webkitRelativePath) return f.name;
            const parts = f.webkitRelativePath.split("/");
            return parts.length > 1 ? parts.slice(1).join("/") : f.name;
        }

        setUploadCount(tfFiles.length);
        setUploading(true);

        try {

            const entries = await Promise.all(
                tfFiles.map(async (f) => ({ fileName: relativePathFor(f), content: await readFileAsText(f) }))
            );

            const result = await uploadFilesToProject(projectId, entries);

            if (result.accepted?.length > 0) {
                toast.show(`${result.accepted.length} file(s) uploaded.`, "success");
            }

            if (result.rejected?.length > 0) {
                toast.show(
                    `${result.rejected.length} file(s) skipped: ${result.rejected.map((r) => r.fileName).join(", ")}`,
                    "error"
                );
            }

            load();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to upload files.", "error");
        }
        finally {
            setUploading(false);
        }

    }

    function handlePickFiles(e) {
        const picked = Array.from(e.target.files || []);
        e.target.value = "";
        processPicked(picked);
    }

    function handlePickFolder(e) {
        const picked = Array.from(e.target.files || []);
        e.target.value = "";
        processPicked(picked);
    }

    async function handleOpenFile(fileName) {

        setSelectedPath(fileName);
        setOpenLoading(true);

        try {
            const detail = await getTerraformProjectFile(projectId, fileName);
            setOpenContent(detail.content || "");
        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to open that file.", "error");
            setSelectedPath(null);
        }
        finally {
            setOpenLoading(false);
        }

    }

    async function handleSaveOpen() {

        setSavingOpen(true);

        try {
            await updateTerraformProjectFile(projectId, selectedPath, openContent);
            toast.show("Saved.", "success");
            load();
        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to save changes.", "error");
        }
        finally {
            setSavingOpen(false);
        }

    }

    async function handleDeleteFile() {

        if (!(await confirm({
            title: "Delete this file?",
            message: `"${selectedPath}" will be permanently deleted.`,
            confirmLabel: "Delete File",
            danger: true
        }))) {
            return;
        }

        try {
            await deleteTerraformProjectFile(projectId, selectedPath);
            toast.show("File deleted.", "success");
            setSelectedPath(null);
            load();
        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to delete file.", "error");
        }

    }

    async function handleDeleteProject() {

        if (!(await confirm({
            title: "Delete this project?",
            message: `"${project?.name}" and all its files will be permanently deleted.`,
            confirmLabel: "Delete Project",
            danger: true
        }))) {
            return;
        }

        try {
            await deleteTerraformProject(projectId);
            toast.show("Project deleted.", "success");
            onDeleted();
        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to delete project.", "error");
        }

    }

    async function handleExplain() {

        setExplaining(true);
        setExplanation(null);

        try {
            const result = await explainTerraformProject(projectId);

            if (!result.success) {
                toast.show(result.message || "Unable to explain this project right now.", "error");
                return;
            }

            setExplanation(result.explanation);
        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to explain this project right now.", "error");
        }
        finally {
            setExplaining(false);
        }

    }

    async function handlePreview() {

        setPreviewing(true);
        setPreview(null);

        try {
            const result = await previewTerraformProject(projectId);

            if (!result.success) {
                toast.show(result.message || "Unable to preview this project right now.", "error");
                return;
            }

            setPreview(result);
        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to preview this project right now.", "error");
        }
        finally {
            setPreviewing(false);
        }

    }

    async function handlePlan() {

        setPlanning(true);
        setPlan(null);
        setPlanError(null);
        setApplyOutput(null);
        setApplyError(null);

        try {
            const result = await planTerraformProject(projectId);

            if (!result.success) {
                setPlanError(result.message || "terraform plan failed.");
                return;
            }

            setPlan(result);
        }
        catch (err) {
            setPlanError(err.response?.data?.message || "Unable to run terraform plan right now.");
        }
        finally {
            setPlanning(false);
        }

    }

    async function handleApplyConfirmed() {

        setApplying(true);

        try {
            const result = await applyTerraformProject(projectId, plan.planId, plan.summaryLine);

            if (!result.success) {
                setApplyError(result.message || "terraform apply failed.");
                setConfirmOpen(false);
                return;
            }

            setApplyOutput(result.output);
            setConfirmOpen(false);
            setPlan(null);
            toast.show("Apply completed.", "success");
        }
        catch (err) {
            setApplyError(err.response?.data?.message || "Unable to run terraform apply right now.");
            setConfirmOpen(false);
        }
        finally {
            setApplying(false);
        }

    }

    if (loading) {
        return <p className="field-hint">Loading...</p>;
    }

    if (!project) {
        return null;
    }

    const fileResources = preview?.resources?.filter((r) => r.fileName === selectedPath) || [];

    return (

        <div>

            {dialog}

            <div className="access-panel-header">
                <button type="button" className="btn" onClick={onBack}>
                    <ArrowLeft size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    All Projects
                </button>
                <h2 className="settings-subhead" style={{ margin: 0 }}>{project.name}</h2>
                <div className="button-row" style={{ margin: 0 }}>
                    <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => filesInputRef.current?.click()}>
                        <Upload size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        Add Files
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => folderInputRef.current?.click()}>
                        <FolderUp size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        Add Folder
                    </button>
                    <button type="button" className="btn btn-danger" onClick={handleDeleteProject}>
                        Delete Project
                    </button>
                </div>
                <input ref={filesInputRef} type="file" multiple style={{ display: "none" }} onChange={handlePickFiles} />
                <input
                    ref={folderInputRef}
                    type="file"
                    webkitdirectory=""
                    directory=""
                    multiple
                    style={{ display: "none" }}
                    onChange={handlePickFolder}
                />
            </div>

            {uploading && (
                <div className="inline-loading-row" role="status" aria-live="polite">
                    <span className="inline-spinner" aria-hidden="true"></span>
                    Uploading {uploadCount} file{uploadCount === 1 ? "" : "s"}...
                </div>
            )}

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>

                <div style={{ flex: "1 1 260px", minWidth: 220 }}>
                    <TerraformFileTree files={project.files} selectedPath={selectedPath} onSelect={handleOpenFile} />
                </div>

                <div style={{ flex: "2 1 420px", minWidth: 280 }}>

                    {!selectedPath ? (

                        <p className="empty-state">Select a file from the tree to view and edit it.</p>

                    ) : openLoading ? (

                        <p className="field-hint">Loading...</p>

                    ) : (

                        <div className="settings-subsection" style={{ padding: 0 }}>

                            <h3 className="settings-subhead" style={{ marginTop: 0 }}>
                                <FileCode size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
                                {selectedPath}
                            </h3>

                            {fileResources.length > 0 ? (

                                <div className="card" style={{ marginBottom: 12 }}>
                                    <p className="field-hint" style={{ marginTop: 0 }}>What this file creates:</p>
                                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                                        {fileResources.map((r, i) => (
                                            <li key={i}>
                                                <strong>{r.resourceType}</strong> "{r.localName}"
                                                {r.declaredName ? <> &rarr; name = "{r.declaredName}"</> : <> &rarr; name depends on a variable</>}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                            ) : preview ? (

                                <p className="field-hint">No resources found in this file.</p>

                            ) : (

                                <p className="field-hint">Run Preview below to see what this file would create.</p>

                            )}

                            <div className="form-group" style={{ marginBottom: 8 }}>
                                <label htmlFor="tf-insert-template">Insert starter code</label>
                                <select
                                    id="tf-insert-template"
                                    className="form-control"
                                    value=""
                                    onChange={(e) => {
                                        const template = TERRAFORM_RESOURCE_TEMPLATES.find((t) => t.key === e.target.value);
                                        if (!template) return;
                                        setOpenContent((prev) => (prev && !prev.endsWith("\n") ? prev + "\n\n" : prev + "\n") + template.hcl);
                                        e.target.value = "";
                                    }}
                                >
                                    <option value="" disabled>Choose a resource to insert...</option>
                                    {TERRAFORM_RESOURCE_TEMPLATES.map((t) => (
                                        <option key={t.key} value={t.key}>{t.label}</option>
                                    ))}
                                </select>
                            </div>

                            <textarea
                                className="form-control"
                                style={{ fontFamily: "monospace", fontSize: 13, minHeight: 320, whiteSpace: "pre", width: "100%" }}
                                value={openContent}
                                onChange={(e) => setOpenContent(e.target.value)}
                                spellCheck={false}
                            />

                            <div className="button-row" style={{ marginTop: 10 }}>
                                <button type="button" className="btn btn-primary" disabled={savingOpen} onClick={handleSaveOpen}>
                                    {savingOpen ? "Saving..." : "Save"}
                                </button>
                                <button type="button" className="btn btn-danger" onClick={handleDeleteFile}>
                                    Delete File
                                </button>
                            </div>

                        </div>

                    )}

                </div>

            </div>

            <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid var(--border)" }} />

            <div className="settings-subsection">

                <h3 className="settings-subhead">Explain, Preview, Plan &amp; Apply</h3>

                <p className="field-hint" style={{ marginTop: 0 }}>
                    <strong>Explain</strong> and <strong>Preview</strong> only read your stored files - no
                    Azure calls, safe to run anytime. <strong>Preview</strong> ("fake plan") lists exactly
                    what resources this project describes and their names, without running real terraform.
                    <strong> Plan</strong> and <strong>Apply</strong> run the real terraform CLI against
                    your Azure subscription using the Service Principal above; Apply actually creates,
                    changes, or destroys real resources and requires typing the plan's own summary line
                    to confirm.
                </p>

                <div className="button-row">

                    <button type="button" className="btn btn-secondary" disabled={explaining} onClick={handleExplain}>
                        <Sparkles size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        {explaining ? "Explaining..." : "Explain"}
                    </button>

                    <button type="button" className="btn btn-secondary" disabled={previewing} onClick={handlePreview}>
                        <PlayCircle size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        {previewing ? "Previewing..." : "Preview (fake plan)"}
                    </button>

                    <button type="button" className="btn btn-secondary" disabled={planning} onClick={handlePlan}>
                        <PlayCircle size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        {planning ? "Planning... (this can take a minute)" : "Run Real Plan"}
                    </button>

                    <button
                        type="button"
                        className="btn btn-danger"
                        disabled={!plan}
                        onClick={() => setConfirmOpen(true)}
                    >
                        <Rocket size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        Apply
                    </button>

                </div>

                {(explaining || previewing || planning || applying) && (
                    <div className="inline-loading-row" role="status" aria-live="polite">
                        <span className="inline-spinner" aria-hidden="true"></span>
                        {explaining && "Asking the AI Assistant to explain your files..."}
                        {previewing && "Scanning your files for resources..."}
                        {planning && "Running terraform init + plan against Azure - this can take a minute..."}
                        {applying && "Running terraform apply against Azure..."}
                    </div>
                )}

                {explanation && (
                    <div className="card" style={{ marginTop: 14 }}>
                        <CopilotMarkdown text={explanation} />
                    </div>
                )}

                {preview && (
                    <div className="card" style={{ marginTop: 14 }}>

                        {preview.resources.length === 0 ? (
                            <p className="field-hint" style={{ margin: 0 }}>No resource blocks found.</p>
                        ) : (
                            <div className="table-scroll">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Type</th>
                                            <th>Local Name</th>
                                            <th>Declared Name</th>
                                            <th>File</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.resources.map((r, i) => (
                                            <tr key={i}>
                                                <td>{r.resourceType}</td>
                                                <td>{r.localName}</td>
                                                <td>{r.declaredName || <em>depends on a variable</em>}</td>
                                                <td>{r.fileName}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {preview.narrative && (
                            <div style={{ marginTop: 12 }}>
                                <CopilotMarkdown text={preview.narrative} />
                            </div>
                        )}

                    </div>
                )}

                {planError && (
                    <>
                        <p className="field-hint field-hint-bad" style={{ marginTop: 14 }}>Plan failed.</p>
                        <pre className="terraform-output">{planError}</pre>
                    </>
                )}

                {plan && (
                    <div style={{ marginTop: 14 }}>
                        <p className="field-hint field-hint-good" style={{ margin: "0 0 8px" }}>
                            {plan.summaryLine}
                        </p>
                        <pre className="terraform-output">{plan.output}</pre>
                    </div>
                )}

                {applyError && (
                    <>
                        <p className="field-hint field-hint-bad" style={{ marginTop: 14 }}>Apply failed.</p>
                        <pre className="terraform-output">{applyError}</pre>
                    </>
                )}

                {applyOutput && (
                    <div style={{ marginTop: 14 }}>
                        <p className="field-hint field-hint-good" style={{ margin: "0 0 8px" }}>Apply completed.</p>
                        <pre className="terraform-output">{applyOutput}</pre>
                    </div>
                )}

                <TypedConfirmDialog
                    open={confirmOpen}
                    title="Apply this Terraform plan?"
                    message="This will run terraform apply against your real Azure subscription using the changes shown above. This cannot be undone from here."
                    resourceName={plan?.summaryLine || ""}
                    confirmLabel="Apply"
                    loading={applying}
                    onConfirm={handleApplyConfirmed}
                    onCancel={() => setConfirmOpen(false)}
                />

            </div>

        </div>

    );

}

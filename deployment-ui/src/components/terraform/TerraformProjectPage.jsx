import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, FileCode, FolderUp, KeyRound, PlusCircle, Sparkles, PlayCircle, Rocket, Upload } from "lucide-react";

import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import CopilotMarkdown from "../copilot/CopilotMarkdown";
import TypedConfirmDialog from "../cloudServices/TypedConfirmDialog";
import SectionTabs from "../common/SectionTabs";
import TerraformFileTree from "./TerraformFileTree";
import TerraformAddResourceForm from "./TerraformAddResourceForm";
import TerraformResourcesTab from "./TerraformResourcesTab";
import TerraformCredentialsSection from "./TerraformCredentialsSection";
import { TERRAFORM_RESOURCE_TEMPLATES } from "../../utils/terraformTemplates";
import {
    getTerraformProject, deleteTerraformProject, uploadFilesToProject,
    getTerraformProjectFile, updateTerraformProjectFile, deleteTerraformProjectFile,
    explainTerraformProject, previewTerraformProject, planTerraformProject, applyTerraformProject,
    addTerraformResourceInstance
} from "../../services/terraformService";

// A single `resource` block with for_each/count creates one ACTUAL Azure
// resource per entry, not one - see TerraformResourceExtractor.cs's own
// header comment for how instanceCount/instanceNames get resolved (from an
// uploaded .tfvars file) and why they're sometimes still null (the
// referenced value wasn't a literal this app could read).
function describeResourceInstances(r) {

    if (!r.hasForEachOrCount) {
        return r.declaredName ? `1 instance, name = "${r.declaredName}"` : "1 instance, name depends on a variable";
    }

    if (r.instanceCount == null) {
        return "uses for_each/count - instance count depends on a variable this preview couldn't resolve";
    }

    return `${r.instanceCount} instance${r.instanceCount === 1 ? "" : "s"}`;

}

// Groups "base-A" / "base-B" pairs (this project's own paired-deployment
// naming convention) onto one line each instead of a flat comma-separated
// wall of 24 names - deliberately narrow (only a trailing "-A"/"-B", not
// any trailing token) so an unrelated numeric or descriptive suffix on some
// other project's names is left alone as its own standalone line, never
// silently merged into a group that doesn't actually mean anything.
function groupInstanceNames(names) {

    const groups = new Map(); // base name -> Set of suffixes, or null for a standalone (no -A/-B) name
    const order = [];

    for (const name of names || []) {

        const match = name.match(/^(.*)-([AB])$/);
        const base = match ? match[1] : name;
        const suffix = match ? match[2] : null;

        if (!groups.has(base)) {
            groups.set(base, new Set());
            order.push(base);
        }

        if (suffix) groups.get(base).add(suffix);
        else groups.get(base).add(null);

    }

    return order.map((base) => {
        const suffixes = [...groups.get(base)];
        const hasRealSuffixes = suffixes.length > 0 && suffixes[0] !== null;
        return { base, suffixes: hasRealSuffixes ? suffixes.sort() : null };
    });

}

function InstanceNamesList({ names }) {

    if (!names || names.length === 0) return null;

    const grouped = groupInstanceNames(names);

    return (

        <ul className="terraform-instance-list">
            {grouped.map(({ base, suffixes }) => (
                <li key={base}>
                    {base}
                    {suffixes && (
                        <span className="terraform-instance-suffixes">
                            {" "}({suffixes.join(", ")})
                        </span>
                    )}
                </li>
            ))}
        </ul>

    );

}

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

    const [addResourceOpen, setAddResourceOpen] = useState(false);

    const [activeTab, setActiveTab] = useState("files");
    const [credentialsOpen, setCredentialsOpen] = useState(false);

    const [highlightedPaths, setHighlightedPaths] = useState(new Set());

    // Brief "just updated" flash on whichever file(s) an action just
    // touched - see TerraformFileTree's own comment. Fades on its own;
    // never a persistent marker.
    function flashPaths(fileNames) {
        if (!fileNames || fileNames.length === 0) return;
        setHighlightedPaths(new Set(fileNames));
        setTimeout(() => setHighlightedPaths(new Set()), 2200);
    }

    // Staged-but-not-yet-saved web app drafts (see TerraformAddResourceForm's
    // own comment) - held here, not on the Resources tab, so they survive a
    // Files/Resources tab switch and so "Back to All Projects" can guard
    // against losing them. Cleared only by an explicit save or discard.
    const [pendingWebApps, setPendingWebApps] = useState([]);
    const [savingPending, setSavingPending] = useState(false);
    const [flashedResourceKeys, setFlashedResourceKeys] = useState(new Set());
    const [resourcesRefreshToken, setResourcesRefreshToken] = useState(0);
    const [unsavedPromptOpen, setUnsavedPromptOpen] = useState(false);

    function flashResourceKeys(keys) {
        if (!keys || keys.length === 0) return;
        setFlashedResourceKeys(new Set(keys));
        setTimeout(() => setFlashedResourceKeys(new Set()), 2200);
    }

    function handleStageWebApps(items) {
        setPendingWebApps((prev) => [...prev, ...items]);
    }

    function handleRemovePending(tempId) {
        setPendingWebApps((prev) => prev.filter((i) => i.tempId !== tempId));
    }

    async function handleSaveAllPending() {

        if (pendingWebApps.length === 0) return true;

        setSavingPending(true);

        const stillPending = [];
        const touchedFiles = new Set();
        const savedKeys = [];
        let anyFailed = false;

        try {

            for (const item of pendingWebApps) {

                try {

                    const result = await addTerraformResourceInstance(projectId, item.variableName, item.name, {
                        appsettingsFile: item.appsettingsFile,
                        connectionstringsFile: item.connectionstringsFile
                    });

                    if (!result.success) {
                        toast.show(`"${item.name}": ${result.message || "unable to save."}`, "error");
                        stillPending.push(item);
                        anyFailed = true;
                        continue;
                    }

                    touchedFiles.add(item.fileName);
                    savedKeys.push(`${item.variableName}::${item.name}`);

                }
                catch (err) {
                    toast.show(`"${item.name}": ${err.response?.data?.message || "unable to save right now."}`, "error");
                    stillPending.push(item);
                    anyFailed = true;
                }

            }

            setPendingWebApps(stillPending);

            if (savedKeys.length > 0) {
                toast.show(`${savedKeys.length} web app(s) saved.`, "success");
                flashPaths([...touchedFiles]);
                flashResourceKeys(savedKeys);
                setResourcesRefreshToken((v) => v + 1);
                load();
            }

            return !anyFailed;

        }
        finally {
            setSavingPending(false);
        }

    }

    async function handleDiscardAllPending() {

        if (!(await confirm({
            title: "Discard unsaved web apps?",
            message: `${pendingWebApps.length} unsaved web app(s) will be discarded - nothing was written to terraform.tfvars.`,
            confirmLabel: "Discard",
            danger: true
        }))) {
            return;
        }

        setPendingWebApps([]);

    }

    function handleBackClick() {
        if (pendingWebApps.length > 0) {
            setUnsavedPromptOpen(true);
            return;
        }
        onBack();
    }

    useEffect(() => {

        if (pendingWebApps.length === 0) return;

        function handleBeforeUnload(e) {
            e.preventDefault();
            e.returnValue = "";
        }

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);

    }, [pendingWebApps.length]);

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
                flashPaths(result.accepted);
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
            flashPaths([selectedPath]);
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
                const message = result.message || "terraform plan failed.";
                setPlanError(message);
                if (message.includes("Service Principal")) setCredentialsOpen(true);
                return;
            }

            setPlan(result);
        }
        catch (err) {
            const message = err.response?.data?.message || "Unable to run terraform plan right now.";
            setPlanError(message);
            if (message.includes("Service Principal")) setCredentialsOpen(true);
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
                <button type="button" className="btn" onClick={handleBackClick}>
                    <ArrowLeft size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    All Projects
                </button>
                <h2 className="settings-subhead" style={{ margin: 0 }}>{project.name}</h2>
                <div className="button-row" style={{ margin: 0 }}>
                    <button type="button" className="btn btn-primary" onClick={() => setAddResourceOpen(true)}>
                        <PlusCircle size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        Add Resource
                    </button>
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

            <SectionTabs
                sections={[
                    { key: "files", label: "Files" },
                    { key: "resources", label: "Resources" }
                ]}
                active={activeTab}
                onSelect={setActiveTab}
            />

            {pendingWebApps.length > 0 && (
                <div className="card" style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                    <span className="field-hint" style={{ margin: 0 }}>
                        <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: -2, color: "var(--viz-warning, #b45309)" }} />
                        {pendingWebApps.length} unsaved web app{pendingWebApps.length === 1 ? "" : "s"} - not yet written to terraform.tfvars.
                    </span>
                    <div className="button-row" style={{ margin: 0 }}>
                        <button type="button" className="btn btn-primary" disabled={savingPending} onClick={handleSaveAllPending}>
                            {savingPending ? "Saving..." : "Save Changes"}
                        </button>
                        <button type="button" className="btn btn-secondary" disabled={savingPending} onClick={handleDiscardAllPending}>
                            Discard
                        </button>
                    </div>
                </div>
            )}

            {activeTab === "resources" ? (

                <TerraformResourcesTab
                    projectId={projectId}
                    pendingInstances={pendingWebApps}
                    onRemovePending={handleRemovePending}
                    flashedKeys={flashedResourceKeys}
                    refreshToken={resourcesRefreshToken}
                />

            ) : (

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>

                <div style={{ flex: "1 1 260px", minWidth: 220 }}>
                    <TerraformFileTree
                        files={project.files}
                        selectedPath={selectedPath}
                        onSelect={handleOpenFile}
                        highlightedPaths={highlightedPaths}
                    />
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
                                                <strong>{r.resourceType}</strong> "{r.localName}" &rarr; {describeResourceInstances(r)}
                                                <InstanceNamesList names={r.instanceNames} />
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

            )}

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

                <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginBottom: 14 }}
                    onClick={() => setCredentialsOpen((v) => !v)}
                >
                    <KeyRound size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    {credentialsOpen ? <ChevronDown size={14} style={{ verticalAlign: -2 }} /> : <ChevronRight size={14} style={{ verticalAlign: -2 }} />}
                    {" "}Azure Service Principal
                </button>

                {credentialsOpen && (
                    <div style={{ marginBottom: 14 }}>
                        <TerraformCredentialsSection />
                    </div>
                )}

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
                                            <th>Instances &amp; Names</th>
                                            <th>File</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.resources.map((r, i) => (
                                            <tr key={i}>
                                                <td>{r.resourceType}</td>
                                                <td>{r.localName}</td>
                                                <td>
                                                    {describeResourceInstances(r)}
                                                    <InstanceNamesList names={r.instanceNames} />
                                                </td>
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

            <TerraformAddResourceForm
                projectId={projectId}
                open={addResourceOpen}
                onClose={() => setAddResourceOpen(false)}
                onAdded={(touchedFiles) => { flashPaths(touchedFiles); load(); }}
                onStage={handleStageWebApps}
            />

            {unsavedPromptOpen && (

                <div className="dialog-backdrop" role="presentation">

                    <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="tf-unsaved-title">

                        <h2 id="tf-unsaved-title">
                            <AlertTriangle size={18} style={{ marginRight: 6, verticalAlign: -3 }} />
                            Unsaved web apps
                        </h2>

                        <p className="field-hint" style={{ marginTop: 0 }}>
                            {pendingWebApps.length} unsaved web app{pendingWebApps.length === 1 ? "" : "s"} haven't
                            been written to terraform.tfvars yet. Save them, leave without saving, or go back and
                            keep working.
                        </p>

                        <div className="button-row">

                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={savingPending}
                                onClick={async () => {
                                    const allSaved = await handleSaveAllPending();
                                    setUnsavedPromptOpen(false);
                                    if (allSaved) onBack();
                                }}
                            >
                                {savingPending ? "Saving..." : "Save & Leave"}
                            </button>

                            <button
                                type="button"
                                className="btn btn-danger"
                                disabled={savingPending}
                                onClick={() => {
                                    setPendingWebApps([]);
                                    setUnsavedPromptOpen(false);
                                    onBack();
                                }}
                            >
                                Leave Without Saving
                            </button>

                            <button type="button" className="btn btn-secondary" disabled={savingPending} onClick={() => setUnsavedPromptOpen(false)}>
                                Cancel
                            </button>

                        </div>

                    </div>

                </div>

            )}

        </div>

    );

}

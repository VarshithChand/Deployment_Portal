import { useEffect, useRef, useState } from "react";
import { FolderUp, Upload, FolderTree } from "lucide-react";

import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import { listTerraformProjects, createTerraformProject, deleteTerraformProject } from "../../services/terraformService";

function formatDateTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

// Each upload becomes its own PROJECT - see SettingsService.
// ListUserTerraformProjectsAsync's own comment for why that replaced one
// flat file list every upload used to merge into. A folder pick's own
// top-level name (e.g. "cluster creation infra") pre-fills the project
// name; you confirm/rename before it's actually created.
export default function TerraformProjectsList({ onOpenProject }) {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();
    const filesInputRef = useRef(null);
    const folderInputRef = useRef(null);

    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    const [reading, setReading] = useState(false);
    const [readCount, setReadCount] = useState(0);

    // Staged pick, waiting on a project name before it's actually created.
    const [pending, setPending] = useState(null); // { name, entries }
    const [creating, setCreating] = useState(false);

    function load() {
        setLoading(true);
        listTerraformProjects()
            .then((result) => setProjects(result.projects || []))
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }

    useEffect(load, []);

    const {
        page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex
    } = usePagination(projects, 10);

    // Same live-FileList-vs-input.value ordering fix as TerraformFileTree's
    // sibling components: Array.from() BEFORE resetting the input's value,
    // or the list reads empty (see the earlier upload-does-nothing fix).
    async function processPicked(pickedList, isFolderPick) {

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

        const defaultName = isFolderPick && tfFiles[0].webkitRelativePath
            ? tfFiles[0].webkitRelativePath.split("/")[0]
            : "";

        setReadCount(tfFiles.length);
        setReading(true);

        try {

            const entries = await Promise.all(
                tfFiles.map(async (f) => ({ fileName: relativePathFor(f), content: await readFileAsText(f) }))
            );

            setPending({ name: defaultName, entries });

        }
        catch (err) {
            toast.show("Unable to read the selected files.", "error");
        }
        finally {
            setReading(false);
        }

    }

    function handlePickFiles(e) {
        const picked = Array.from(e.target.files || []);
        e.target.value = "";
        processPicked(picked, false);
    }

    function handlePickFolder(e) {
        const picked = Array.from(e.target.files || []);
        e.target.value = "";
        processPicked(picked, true);
    }

    async function handleCreate() {

        if (!pending?.name.trim()) {
            toast.show("Give this project a name first.", "error");
            return;
        }

        setCreating(true);

        try {

            const result = await createTerraformProject(pending.name.trim(), pending.entries);

            if (!result.success) {
                toast.show(result.message || "Unable to create project.", "error");
                return;
            }

            if (result.rejected?.length > 0) {
                toast.show(
                    `${result.rejected.length} file(s) skipped: ${result.rejected.map((r) => r.fileName).join(", ")}`,
                    "error"
                );
            }

            toast.show(`"${pending.name.trim()}" created.`, "success");
            setPending(null);
            onOpenProject(result.project.projectId);

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to create project.", "error");
        }
        finally {
            setCreating(false);
        }

    }

    async function handleDelete(project) {

        if (!(await confirm({
            title: "Delete this project?",
            message: `"${project.name}" and all ${project.fileCount} of its files will be permanently deleted.`,
            confirmLabel: "Delete Project",
            danger: true
        }))) {
            return;
        }

        try {
            await deleteTerraformProject(project.projectId);
            toast.show("Project deleted.", "success");
            load();
        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to delete project.", "error");
        }

    }

    return (

        <div className="settings-subsection">

            {dialog}

            <div className="access-panel-header">
                <h3 className="settings-subhead" style={{ margin: 0 }}>Terraform Projects</h3>
                <div className="button-row" style={{ margin: 0 }}>
                    <button type="button" className="btn btn-primary" disabled={reading} onClick={() => filesInputRef.current?.click()}>
                        <Upload size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        {reading ? "Reading..." : "Upload Files"}
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={reading} onClick={() => folderInputRef.current?.click()}>
                        <FolderUp size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        {reading ? "Reading..." : "Upload Folder"}
                    </button>
                </div>
                <input
                    ref={filesInputRef}
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={handlePickFiles}
                />
                {/* webkitdirectory (Chrome/Edge/Firefox/Safari, non-standard but
                    universally supported) turns this into a folder picker - every
                    file inside the chosen folder, including subfolders, comes
                    back in one FileList with webkitRelativePath set. */}
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

            <p className="field-hint" style={{ marginTop: 0 }}>
                Each folder you upload becomes its own project - its own file tree, own Explain/
                Preview/Plan/Apply. Accepts .tf, .tf.json, .tfvars, .tfvars.json, .json, .md, and
                dotfiles like .gitignore, with folder structure preserved (so local module
                references keep working).
            </p>

            {reading && (
                <div className="inline-loading-row" role="status" aria-live="polite">
                    <span className="inline-spinner" aria-hidden="true"></span>
                    Reading {readCount} file{readCount === 1 ? "" : "s"}...
                </div>
            )}

            {pending && (

                <div className="card" style={{ marginTop: 0, marginBottom: 16 }}>

                    <div className="form-group" style={{ marginBottom: 10 }}>
                        <label htmlFor="tf-project-name">
                            Project name ({pending.entries.length} file{pending.entries.length === 1 ? "" : "s"} read)
                        </label>
                        <input
                            id="tf-project-name"
                            type="text"
                            className="form-control"
                            value={pending.name}
                            onChange={(e) => setPending({ ...pending, name: e.target.value })}
                            placeholder="e.g. Cluster Creation Infra"
                            autoFocus
                        />
                    </div>

                    <div className="button-row">
                        <button type="button" className="btn btn-primary" disabled={creating} onClick={handleCreate}>
                            {creating ? "Creating..." : "Create Project"}
                        </button>
                        <button type="button" className="btn" disabled={creating} onClick={() => setPending(null)}>
                            Cancel
                        </button>
                    </div>

                </div>

            )}

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : pageItems.length === 0 ? (

                <p className="empty-state">No projects yet. Use "Upload Files" or "Upload Folder" to create one.</p>

            ) : (

                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Project</th>
                                <th>Files</th>
                                <th>Updated</th>
                                <th><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageItems.map((project) => (
                                <tr key={project.projectId}>
                                    <td>
                                        <button
                                            type="button"
                                            onClick={() => onOpenProject(project.projectId)}
                                            style={{
                                                background: "none", border: "none", padding: 0,
                                                color: "var(--heading-accent, inherit)", textDecoration: "underline",
                                                cursor: "pointer", font: "inherit", display: "inline-flex", alignItems: "center", gap: 6
                                            }}
                                        >
                                            <FolderTree size={14} />
                                            {project.name}
                                        </button>
                                    </td>
                                    <td>{project.fileCount}</td>
                                    <td>{formatDateTime(project.updatedAtUtc)}</td>
                                    <td>
                                        <button type="button" className="btn btn-danger" onClick={() => handleDelete(project)}>
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

            )}

            <Pagination
                page={page}
                pageCount={pageCount}
                totalCount={totalCount}
                startIndex={startIndex}
                endIndex={endIndex}
                onPageChange={setPage}
            />

        </div>

    );

}

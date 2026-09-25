import { useEffect, useRef, useState } from "react";
import { FileCode, FolderUp, Upload } from "lucide-react";

import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import { TERRAFORM_RESOURCE_TEMPLATES } from "../../utils/terraformTemplates";
import {
    listTerraformFiles, getTerraformFile, uploadTerraformFiles, updateTerraformFile, deleteTerraformFile
} from "../../services/terraformService";

function formatDateTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

// File CRUD - storage and editing only, no Azure calls (see
// TerraformExecutionPanel for the real plan/apply/explain, which lives
// alongside this section on the page). The upload picker reads each
// selected .tf file's text client-side (this app's backend has no access
// to your local filesystem) and uploads its content; re-selecting the same
// folder later just refreshes what's stored, since uploads upsert by path.
export default function TerraformFilesSection() {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();
    const filesInputRef = useRef(null);
    const folderInputRef = useRef(null);

    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadCount, setUploadCount] = useState(0);

    const [openFile, setOpenFile] = useState(null);
    const [openContent, setOpenContent] = useState("");
    const [openLoading, setOpenLoading] = useState(false);
    const [savingOpen, setSavingOpen] = useState(false);

    function load() {
        setLoading(true);
        listTerraformFiles()
            .then((result) => setFiles(result.files || []))
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }

    useEffect(load, []);

    const {
        page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex
    } = usePagination(files, 10);

    // Shared by both pickers below. A folder pick's File objects carry
    // webkitRelativePath (e.g. "vipscloudpms-azure-infrastructure/modules/
    // network/main.tf") - the folder's own top-level name is stripped so
    // storage is relative to its CONTENTS ("modules/network/main.tf"),
    // preserving subfolder structure so local module references
    // (source = "./modules/network") keep resolving when a real plan/apply
    // writes these files back out to disk. A plain file pick (no
    // webkitRelativePath) just uses the bare filename, same as before.
    async function processPicked(pickedList) {

        const picked = Array.from(pickedList || []);

        if (picked.length === 0) return;

        const tfFiles = picked.filter((f) => /\.tf(\.json)?$/i.test(f.name));
        const skippedCount = picked.length - tfFiles.length;

        if (skippedCount > 0) {
            toast.show(`Skipped ${skippedCount} file(s) that weren't .tf or .tf.json.`, "error");
        }

        if (tfFiles.length === 0) return;

        function relativePathFor(f) {
            if (!f.webkitRelativePath) return f.name;
            const parts = f.webkitRelativePath.split("/");
            return parts.length > 1 ? parts.slice(1).join("/") : f.name;
        }

        // Set before the (possibly slow, for a big folder) read/upload work
        // below even starts, so the inline spinner appears the instant the
        // OS file-picker dialog closes - not just once the network call
        // begins, which previously left folder selections with no visible
        // feedback for however long readFileAsText took on a large batch.
        setUploadCount(tfFiles.length);
        setUploading(true);

        try {

            const entries = await Promise.all(
                tfFiles.map(async (f) => ({ fileName: relativePathFor(f), content: await readFileAsText(f) }))
            );

            const result = await uploadTerraformFiles(entries);

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
        const picked = e.target.files;
        e.target.value = "";
        processPicked(picked);
    }

    function handlePickFolder(e) {
        const picked = e.target.files;
        e.target.value = "";
        processPicked(picked);
    }

    async function handleOpen(file) {

        setOpenFile(file);
        setOpenLoading(true);

        try {
            const detail = await getTerraformFile(file.fileName);
            setOpenContent(detail.content || "");
        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to open that file.", "error");
            setOpenFile(null);
        }
        finally {
            setOpenLoading(false);
        }

    }

    async function handleSaveOpen() {

        setSavingOpen(true);

        try {

            await updateTerraformFile(openFile.fileName, openContent);
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

    async function handleDelete(file) {

        if (!(await confirm({
            title: "Delete this file?",
            message: `"${file.fileName}" will be permanently deleted.`,
            confirmLabel: "Delete File",
            danger: true
        }))) {
            return;
        }

        try {

            await deleteTerraformFile(file.fileName);
            toast.show("File deleted.", "success");

            if (openFile?.fileName === file.fileName) setOpenFile(null);

            load();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to delete file.", "error");
        }

    }

    if (openFile) {

        return (

            <div className="settings-subsection">

                {dialog}

                <div className="access-panel-header">
                    <h3 className="settings-subhead" style={{ margin: 0 }}>
                        <FileCode size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
                        {openFile.fileName}
                    </h3>
                    <button type="button" className="btn" onClick={() => setOpenFile(null)}>&larr; Back to files</button>
                </div>

                {openLoading ? (

                    <p className="field-hint">Loading...</p>

                ) : (

                    <>

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
                            <p className="field-hint" style={{ marginTop: "6px" }}>
                                Appends a starter HCL block with placeholder names to the end of this file -
                                pure text, nothing is created in Azure until you run terraform yourself.
                            </p>
                        </div>

                        <textarea
                            className="form-control"
                            style={{ fontFamily: "monospace", fontSize: 13, minHeight: 360, whiteSpace: "pre", width: "100%" }}
                            value={openContent}
                            onChange={(e) => setOpenContent(e.target.value)}
                            spellCheck={false}
                        />

                        <div className="button-row" style={{ marginTop: 10 }}>
                            <button type="button" className="btn btn-primary" disabled={savingOpen} onClick={handleSaveOpen}>
                                {savingOpen ? "Saving..." : "Save"}
                            </button>
                            <button type="button" className="btn btn-danger" onClick={() => handleDelete(openFile)}>
                                Delete
                            </button>
                        </div>

                    </>

                )}

            </div>

        );

    }

    return (

        <div className="settings-subsection">

            {dialog}

            <div className="access-panel-header">
                <h3 className="settings-subhead" style={{ margin: 0 }}>Terraform Files</h3>
                <div className="button-row" style={{ margin: 0 }}>
                    <button type="button" className="btn btn-primary" disabled={uploading} onClick={() => filesInputRef.current?.click()}>
                        <Upload size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        {uploading ? "Uploading..." : "Upload Files"}
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => folderInputRef.current?.click()}>
                        <FolderUp size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        {uploading ? "Uploading..." : "Upload Folder"}
                    </button>
                </div>
                <input
                    ref={filesInputRef}
                    type="file"
                    multiple
                    accept=".tf,.tf.json"
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
                Select individual .tf files, or upload a whole folder (e.g. your local
                <code style={{ margin: "0 4px" }}>vipscloudpms-azure-infrastructure</code>
                folder) at once - every .tf/.tf.json file inside it, including subfolders, gets
                stored here with its folder structure preserved (so local module references keep
                working). Re-uploading a file refreshes its saved content. Use Explain/Plan/Apply
                below to actually work with what's stored here.
            </p>

            {uploading && (
                <div className="inline-loading-row" role="status" aria-live="polite">
                    <span className="inline-spinner" aria-hidden="true"></span>
                    Uploading {uploadCount} file{uploadCount === 1 ? "" : "s"}...
                </div>
            )}

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : pageItems.length === 0 ? (

                <p className="empty-state">No Terraform files yet. Use "Upload Files" to add some.</p>

            ) : (

                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>File</th>
                                <th>Size</th>
                                <th>Updated</th>
                                <th><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageItems.map((file) => (
                                <tr key={file.fileName}>
                                    <td>
                                        <button
                                            type="button"
                                            onClick={() => handleOpen(file)}
                                            style={{
                                                background: "none", border: "none", padding: 0,
                                                color: "var(--heading-accent, inherit)", textDecoration: "underline",
                                                cursor: "pointer", font: "inherit"
                                            }}
                                        >
                                            {file.fileName}
                                        </button>
                                    </td>
                                    <td>{formatSize(file.contentLength)}</td>
                                    <td>{formatDateTime(file.updatedAtUtc)}</td>
                                    <td>
                                        <button type="button" className="btn btn-danger" onClick={() => handleDelete(file)}>
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

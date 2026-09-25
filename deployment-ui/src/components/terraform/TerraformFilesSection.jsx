import { useEffect, useRef, useState } from "react";
import { FileCode, Upload } from "lucide-react";

import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
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

// Storage and editing only - see TerraformController.cs's own header
// comment for why nothing here ever runs terraform plan/apply. The upload
// picker reads each selected .tf file's text client-side (this app's
// backend has no access to your local filesystem) and uploads its content;
// re-selecting the same folder later just refreshes what's stored, since
// uploads upsert by file name.
export default function TerraformFilesSection() {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();
    const fileInputRef = useRef(null);

    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

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

    async function handlePickFiles(e) {

        const picked = Array.from(e.target.files || []);
        e.target.value = "";

        if (picked.length === 0) return;

        const nonTf = picked.filter((f) => !/\.tf(\.json)?$/i.test(f.name));

        if (nonTf.length > 0) {
            toast.show(`Skipped ${nonTf.length} file(s) that weren't .tf or .tf.json.`, "error");
        }

        const tfFiles = picked.filter((f) => /\.tf(\.json)?$/i.test(f.name));

        if (tfFiles.length === 0) return;

        setUploading(true);

        try {

            const entries = await Promise.all(
                tfFiles.map(async (f) => ({ fileName: f.name, content: await readFileAsText(f) }))
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
                <button type="button" className="btn btn-primary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    {uploading ? "Uploading..." : "Upload Files"}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".tf,.tf.json"
                    style={{ display: "none" }}
                    onChange={handlePickFiles}
                />
            </div>

            <p className="field-hint" style={{ marginTop: 0 }}>
                Select multiple .tf files from your local Terraform folder to store and edit them
                here. Nothing here runs terraform plan/apply - this is storage and editing only, and
                re-uploading a file refreshes its saved content.
            </p>

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

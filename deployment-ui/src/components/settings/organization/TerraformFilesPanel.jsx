import { useEffect, useState } from "react";
import { FileCode, Plus } from "lucide-react";

import useToast from "../../../hooks/useToast";
import useConfirm from "../../../hooks/useConfirm";
import usePagination from "../../../hooks/usePagination";
import Pagination from "../../common/Pagination";
import {
    listTerraformFiles, getTerraformFile, createTerraformFile, updateTerraformFile, deleteTerraformFile
} from "../../../services/organizationService";

function formatDateTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

// Settings > Organizations > Terraform Files - storage and editing only,
// see TerraformFileService's own header comment for why this deliberately
// never runs terraform itself (no plan/apply, no state, no execution).
// Same inline-expand-to-form / click-to-open-editor conventions as the
// rest of this app's Settings pages (see InviteMemberForm/AccountView) -
// a plain monospace <textarea>, not a syntax-highlighted code editor, to
// avoid pulling in a heavy new dependency for this feature's first pass.
export default function TerraformFilesPanel({ orgId, canWrite }) {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);

    const [creating, setCreating] = useState(false);
    const [newFileName, setNewFileName] = useState("");
    const [newContent, setNewContent] = useState("");
    const [saving, setSaving] = useState(false);

    const [openFile, setOpenFile] = useState(null);
    const [openContent, setOpenContent] = useState("");
    const [openLoading, setOpenLoading] = useState(false);
    const [savingOpen, setSavingOpen] = useState(false);

    function load() {
        setLoading(true);
        listTerraformFiles(orgId)
            .then((result) => setFiles(result.files || []))
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId]);

    const {
        page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex
    } = usePagination(files, 10);

    async function handleCreate(e) {

        e.preventDefault();
        setSaving(true);

        try {

            const result = await createTerraformFile(orgId, { fileName: newFileName.trim(), content: newContent });

            if (!result.success) {
                toast.show(result.message || "Unable to create file.", "error");
                return;
            }

            toast.show(`${newFileName.trim()} created.`, "success");
            setNewFileName("");
            setNewContent("");
            setCreating(false);
            load();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to create file.", "error");
        }
        finally {
            setSaving(false);
        }

    }

    async function handleOpen(file) {

        setOpenFile(file);
        setOpenLoading(true);

        try {
            const detail = await getTerraformFile(orgId, file.id);
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

            const result = await updateTerraformFile(orgId, openFile.id, openContent);

            if (!result.success) {
                toast.show(result.message || "Unable to save changes.", "error");
                return;
            }

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

            await deleteTerraformFile(orgId, file.id);
            toast.show("File deleted.", "success");

            if (openFile?.id === file.id) setOpenFile(null);

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
                            readOnly={!canWrite}
                            spellCheck={false}
                        />

                        {canWrite && (
                            <div className="button-row" style={{ marginTop: 10 }}>
                                <button type="button" className="btn btn-primary" disabled={savingOpen} onClick={handleSaveOpen}>
                                    {savingOpen ? "Saving..." : "Save"}
                                </button>
                                <button type="button" className="btn btn-danger" onClick={() => handleDelete(openFile)}>
                                    Delete
                                </button>
                            </div>
                        )}

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
                {canWrite && !creating && (
                    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                        <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                        New File
                    </button>
                )}
            </div>

            <p className="field-hint" style={{ marginTop: 0 }}>
                Store and edit .tf configuration for this organization. Nothing here runs terraform plan/apply -
                this is storage and editing only.
            </p>

            {creating && (

                <form onSubmit={handleCreate}>

                    <div className="form-group">
                        <label htmlFor="tf-file-name">File Name</label>
                        <input
                            id="tf-file-name"
                            type="text"
                            className="form-control"
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            placeholder="main.tf"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="tf-file-content">Content</label>
                        <textarea
                            id="tf-file-content"
                            className="form-control"
                            style={{ fontFamily: "monospace", fontSize: 13, minHeight: 200, whiteSpace: "pre", width: "100%" }}
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                            spellCheck={false}
                        />
                    </div>

                    <div className="button-row">
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? "Creating..." : "Create File"}
                        </button>
                        <button type="button" className="btn" disabled={saving} onClick={() => { setCreating(false); setNewFileName(""); setNewContent(""); }}>
                            Cancel
                        </button>
                    </div>

                </form>

            )}

            {loading ? (

                <p className="field-hint">Loading...</p>

            ) : pageItems.length === 0 ? (

                <p className="empty-state">No Terraform files yet.</p>

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
                                <tr key={file.id}>
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
                                        {canWrite && (
                                            <button type="button" className="btn btn-danger" onClick={() => handleDelete(file)}>
                                                Delete
                                            </button>
                                        )}
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

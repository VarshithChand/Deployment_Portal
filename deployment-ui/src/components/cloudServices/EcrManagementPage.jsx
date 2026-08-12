import { useEffect, useState } from "react";

import {
    getEcrRepositories, getEcrImages, createEcrRepository, deleteEcrRepository
} from "../../services/cloudServicesService";
import usePagination from "../../hooks/usePagination";
import useToast from "../../hooks/useToast";
import formatBytes from "../../utils/formatBytes";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import TypedConfirmDialog from "./TypedConfirmDialog";

const PAGE_SIZE = 10;

export default function EcrManagementPage({ routeParams, onNavigate, refreshToken }) {

    const [list, setList] = useState(null);
    const [loading, setLoading] = useState(true);

    async function load() {

        setLoading(true);

        try {
            setList(await getEcrRepositories());
        }
        catch (err) {
            console.error(err);
            setList({ configured: false, error: "Unable to reach the Deployment API." });
        }
        finally {
            setLoading(false);
        }

    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshToken]);

    if (loading) {
        return <div className="card"><p className="empty-state">Loading AWS resources...</p></div>;
    }

    if (!list?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your AWS credentials in Settings → Credentials → AWS to manage ECR.
                </p>
            </div>
        );

    }

    if (list.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load ECR resources.</p>
                <p className="field-hint">{list.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    if (routeParams.repo) {

        const repo = list.repositories.find((r) => r.name === routeParams.repo);

        if (!repo) {
            return <div className="card"><p className="empty-state">Repository "{routeParams.repo}" was not found.</p></div>;
        }

        return <EcrRepositoryImages repo={repo} />;

    }

    return (
        <EcrRepositoryList
            repositories={list.repositories}
            onSelectRepo={(name) => onNavigate({ service: "ecr", repo: name })}
            onChanged={load}
        />
    );

}

function EcrRepositoryList({ repositories, onSelectRepo, onChanged }) {

    const toast = useToast();
    const [search, setSearch] = useState("");
    const [creating, setCreating] = useState(false);
    const [newRepoName, setNewRepoName] = useState("");
    const [savingCreate, setSavingCreate] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const filtered = repositories.filter((r) =>
        r.name.toLowerCase().includes(search.trim().toLowerCase())
    );

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(filtered, PAGE_SIZE);

    useEffect(() => {
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const totalImages = repositories.reduce((sum, r) => sum + r.imageCount, 0);

    async function handleCreate(e) {

        e.preventDefault();

        if (!newRepoName.trim()) return;

        setSavingCreate(true);

        try {

            const result = await createEcrRepository(newRepoName.trim());

            if (result.success) {
                toast.show(result.message || "Repository created.", "success");
                setNewRepoName("");
                setCreating(false);
                onChanged();
            }
            else {
                toast.show(result.error || "Unable to create that repository.", "error");
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to create that repository.", "error");

        }
        finally {

            setSavingCreate(false);

        }

    }

    async function handleDeleteConfirm() {

        const target = deleteTarget;

        if (!target) return;

        setDeleting(true);

        try {

            const result = await deleteEcrRepository(target.name);

            if (result.success) {
                toast.show(result.message || "Repository deleted.", "success");
                onChanged();
            }
            else {
                toast.show(result.error || "Unable to delete that repository.", "error");
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to delete that repository.", "error");

        }
        finally {

            setDeleting(false);
            setDeleteTarget(null);

        }

    }

    return (

        <>

            <div className="cloud-service-stat-grid">
                <div className="cloud-service-stat-tile"><span>Repositories</span><strong>{repositories.length}</strong></div>
                <div className="cloud-service-stat-tile"><span>Images</span><strong>{totalImages}</strong></div>
            </div>

            <div className="card">

                <div className="repo-picker-header" style={{ marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ margin: 0 }}>Repositories</h2>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating((v) => !v)}>
                        {creating ? "Cancel" : "Create Repository"}
                    </button>
                </div>

                {creating && (

                    <form onSubmit={handleCreate} className="form-group">
                        <label>Repository Name</label>
                        <input
                            type="text"
                            className="form-control"
                            value={newRepoName}
                            onChange={(e) => setNewRepoName(e.target.value)}
                            placeholder="my-app"
                            autoFocus
                        />
                        <button type="submit" className="btn btn-primary" style={{ marginTop: "10px" }} disabled={savingCreate || !newRepoName.trim()}>
                            {savingCreate ? "Creating..." : "Create"}
                        </button>
                    </form>

                )}

                <SearchBox placeholder="Search repositories..." value={search} onChange={setSearch} />

                {filtered.length === 0 ? (

                    <p className="empty-state">No ECR repositories found.</p>

                ) : (

                    <>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Repository</th>
                                        <th>URI</th>
                                        <th className="num">Images</th>
                                        <th>Latest Push</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {pageItems.map((r) => (

                                        <tr key={r.name}>
                                            <td className="table-row-clickable" onClick={() => onSelectRepo(r.name)}>{r.name}</td>
                                            <td className="smoke-test-metric-mono">{r.uri}</td>
                                            <td className="num">{r.imageCount}</td>
                                            <td>{r.latestPushedAt ? new Date(r.latestPushedAt).toLocaleString() : "—"}</td>
                                            <td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                                            <td>
                                                <button type="button" className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(r)}>
                                                    Delete
                                                </button>
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

                )}

            </div>

            <TypedConfirmDialog
                open={!!deleteTarget}
                title="Delete repository?"
                message={(
                    <>
                        This permanently deletes <strong>{deleteTarget?.name}</strong> and every image in it
                        ({deleteTarget?.imageCount} image{deleteTarget?.imageCount === 1 ? "" : "s"}). This cannot be undone.
                    </>
                )}
                resourceName={deleteTarget?.name}
                confirmLabel="Delete"
                loading={deleting}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteTarget(null)}
            />

        </>

    );

}

function EcrRepositoryImages({ repo }) {

    const [images, setImages] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {

        let cancelled = false;

        setLoading(true);

        getEcrImages(repo.name)
            .then((result) => { if (!cancelled) setImages(result); })
            .catch((err) => {
                console.error(err);
                if (!cancelled) setImages({ configured: false, error: "Unable to reach the Deployment API." });
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };

    }, [repo.name]);

    const allImages = images?.images || [];

    const filtered = allImages.filter((i) =>
        i.tag.toLowerCase().includes(search.trim().toLowerCase())
    );

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(filtered, PAGE_SIZE);

    useEffect(() => {
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    if (loading) {
        return <div className="card"><p className="empty-state">Loading images...</p></div>;
    }

    if (images?.error) {
        return <div className="card"><p className="error-message">Unable to load images.</p><p className="field-hint">{images.error}</p></div>;
    }

    return (

        <div className="card">

            <h2 className="card-title">{repo.name} — Images</h2>

            <SearchBox placeholder="Search image tags..." value={search} onChange={setSearch} />

            {filtered.length === 0 ? (

                <p className="empty-state">No images found in this repository.</p>

            ) : (

                <>

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Tag</th>
                                    <th>Digest</th>
                                    <th className="num">Size</th>
                                    <th>Pushed</th>
                                </tr>
                            </thead>

                            <tbody>

                                {pageItems.map((i, index) => (

                                    <tr key={startIndex + index}>
                                        <td className="smoke-test-metric-mono">{i.tag}</td>
                                        <td className="smoke-test-metric-mono">{i.digest.slice(0, 19)}…</td>
                                        <td className="num">{formatBytes(i.sizeBytes)}</td>
                                        <td>{i.pushedAt ? new Date(i.pushedAt).toLocaleString() : "—"}</td>
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

            )}

        </div>

    );

}

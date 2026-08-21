import { useEffect, useMemo, useState } from "react";

import { getEcrRepositories, getEcrImages } from "../../services/cloudServicesService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import formatBytes from "../../utils/formatBytes";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

// AWS ECR - reuses cloudServicesService.js's existing repository/image
// list calls as-is (this feature already exists on Cloud Services, see
// EcrManagementPage.jsx there for the original create/delete-capable
// version) - this is a lighter, read-only browse view for the Container
// Registry hub, since create/delete already have a home on Cloud Services
// and don't need a second place to live.
export default function EcrView() {

    const { setTab } = useNavigation();

    const [list, setList] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [selectedRepo, setSelectedRepo] = useState(null);
    const [images, setImages] = useState(null);
    const [imagesLoading, setImagesLoading] = useState(false);

    function refresh() {

        setLoading(true);

        getEcrRepositories().then((data) => {
            setList(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setList({ configured: false, error: err.response?.data?.message || "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    function openRepo(repo) {

        setSelectedRepo(repo);
        setImagesLoading(true);

        getEcrImages(repo.name).then((data) => {
            setImages(data);
            setImagesLoading(false);
        }).catch((err) => {
            console.error(err);
            setImages({ configured: false, error: err.response?.data?.message || "Unable to load images." });
            setImagesLoading(false);
        });

    }

    const filtered = useMemo(() => {

        const repos = list?.repositories || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed ? repos.filter((r) => r.name.toLowerCase().includes(trimmed)) : repos;

    }, [list, search]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    if (selectedRepo) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedRepo.name}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedRepo(null); setImages(null); }}>
                        ← Back to repositories
                    </button>
                </div>

                {imagesLoading ? (

                    <p className="field-hint">Loading images...</p>

                ) : !images?.configured ? (

                    <p className="error-message">{images?.error || "AWS is not configured."}</p>

                ) : images.error ? (

                    <p className="error-message">{images.error}</p>

                ) : images.images.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No images in this repository.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Tag</th>
                                    <th>Size</th>
                                    <th>Pushed</th>
                                    <th>Digest</th>
                                </tr>
                            </thead>

                            <tbody>

                                {images.images.map((img, i) => (

                                    <tr key={`${img.digest}:${i}`}>
                                        <td>{img.tag}</td>
                                        <td>{formatBytes(img.sizeBytes)}</td>
                                        <td>{img.pushedAt ? new Date(img.pushedAt).toLocaleString() : "—"}</td>
                                        <td className="smoke-test-metric-mono">{img.digest ? img.digest.slice(0, 19) : "—"}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

        );

    }

    if (loading) {
        return <div className="card"><p className="empty-state">Loading ECR repositories...</p></div>;
    }

    if (!list?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Connect your AWS credentials in{" "}
                    <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("settings")}>Settings → Credentials → AWS</button>
                    {" "}to browse ECR.
                </p>
            </div>
        );

    }

    if (list.error) {
        return <div className="card"><p className="error-message">{list.error}</p></div>;
    }

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>ECR Repositories</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
            </div>

            <SearchBox placeholder="Search repositories..." value={search} onChange={setSearch} />

            {filtered.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No repositories found.</p>

            ) : (

                <>

                <div className="table-scroll" style={{ marginTop: "12px" }}>

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Repository</th>
                                <th>Images</th>
                                <th>Latest Push</th>
                                <th>Created</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((repo) => (

                                <tr key={repo.name} className="table-row-clickable" onClick={() => openRepo(repo)}>
                                    <td>{repo.name}</td>
                                    <td>{repo.imageCount}</td>
                                    <td>{repo.latestPushedAt ? new Date(repo.latestPushedAt).toLocaleString() : "—"}</td>
                                    <td>{repo.createdAt ? new Date(repo.createdAt).toLocaleDateString() : "—"}</td>
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

import { useEffect, useMemo, useState } from "react";

import { getNexusRepositories, getNexusImages, getNexusTags } from "../../services/containerRegistryService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

// Nexus (Sonatype Nexus Repository) - three levels deep (repositories ->
// images -> tags), against this session's own credential (see
// HostCredentialLoginSection in Settings → Credentials → Nexus). "Images"
// here means the distinct component names Nexus's generic package API
// groups a docker-format repository's pushed images under - see
// ContainerRegistryService.GetNexusImagesAsync's own comment.
export default function NexusView() {

    const { setTab } = useNavigation();

    const [repositories, setRepositories] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [selectedRepo, setSelectedRepo] = useState(null);
    const [images, setImages] = useState(null);
    const [imagesLoading, setImagesLoading] = useState(false);

    const [selectedImage, setSelectedImage] = useState(null);
    const [tags, setTags] = useState(null);
    const [tagsLoading, setTagsLoading] = useState(false);

    function refresh() {

        setLoading(true);

        getNexusRepositories().then((data) => {
            setRepositories(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setRepositories({ configured: false, error: err.response?.data?.message || "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    function openRepo(repo) {

        setSelectedRepo(repo);
        setImagesLoading(true);

        getNexusImages(repo.name).then((data) => {
            setImages(data);
            setImagesLoading(false);
        }).catch((err) => {
            console.error(err);
            setImages({ configured: false, error: err.response?.data?.message || "Unable to load images." });
            setImagesLoading(false);
        });

    }

    function openImage(image) {

        setSelectedImage(image);
        setTagsLoading(true);

        getNexusTags(selectedRepo.name, image.name).then((data) => {
            setTags(data);
            setTagsLoading(false);
        }).catch((err) => {
            console.error(err);
            setTags({ configured: false, error: err.response?.data?.message || "Unable to load tags." });
            setTagsLoading(false);
        });

    }

    const filteredRepos = useMemo(() => {

        const items = repositories?.repositories || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed ? items.filter((r) => r.name.toLowerCase().includes(trimmed)) : items;

    }, [repositories, search]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filteredRepos, PAGE_SIZE);

    // ---- Level 3: tags ----

    if (selectedImage) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedImage.name}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedImage(null); setTags(null); }}>
                        ← Back to images
                    </button>
                </div>

                {tagsLoading ? (

                    <p className="field-hint">Loading tags...</p>

                ) : !tags?.configured || tags.error ? (

                    <p className="error-message">{tags?.error || "Nexus is not configured."}</p>

                ) : tags.images.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No tags for this image.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Tag</th>
                                    <th>Pushed</th>
                                    <th>Digest</th>
                                </tr>
                            </thead>

                            <tbody>

                                {tags.images.map((img, i) => (

                                    <tr key={`${img.digest}:${i}`}>
                                        <td>{img.tag}</td>
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

    // ---- Level 2: images ----

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

                ) : !images?.configured || images.error ? (

                    <p className="error-message">{images?.error || "Nexus is not configured."}</p>

                ) : images.images.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No images in this repository.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Image</th>
                                </tr>
                            </thead>

                            <tbody>

                                {images.images.map((image) => (

                                    <tr key={image.name} className="table-row-clickable" onClick={() => openImage(image)}>
                                        <td>{image.name}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

        );

    }

    // ---- Level 1: repositories ----

    if (loading) {
        return <div className="card"><p className="empty-state">Loading Nexus repositories...</p></div>;
    }

    if (!repositories?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Connect your Nexus credentials in{" "}
                    <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("settings")}>Settings → Credentials → Nexus</button>
                    {" "}to browse this.
                </p>
            </div>
        );

    }

    if (repositories.error) {
        return <div className="card"><p className="error-message">{repositories.error}</p></div>;
    }

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Nexus Docker Repositories</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
            </div>

            <SearchBox placeholder="Search repositories..." value={search} onChange={setSearch} />

            {filteredRepos.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No repositories found.</p>

            ) : (

                <>

                <div className="table-scroll" style={{ marginTop: "12px" }}>

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Repository</th>
                                <th>Type</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((repo) => (

                                <tr key={repo.name} className="table-row-clickable" onClick={() => openRepo(repo)}>
                                    <td>{repo.name}</td>
                                    <td>{repo.type || "—"}</td>
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

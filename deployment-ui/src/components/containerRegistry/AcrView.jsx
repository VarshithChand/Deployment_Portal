import { useEffect, useMemo, useState } from "react";

import { getAcrRegistries, getAcrRepositories, getAcrTags } from "../../services/containerRegistryService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

// Azure Container Registry - three levels deep (registries -> repositories
// -> tags), unlike ECR/Artifact Registry's two - an Azure subscription can
// hold several registries, each its own registry (not just a repository)
// the way one AWS account's ECR is a single flat repository namespace. See
// CloudServiceManagementService's own comment for the two-step OAuth
// exchange every repository/tag call underneath this needs.
export default function AcrView() {

    const { setTab } = useNavigation();

    const [registries, setRegistries] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [selectedRegistry, setSelectedRegistry] = useState(null);
    const [repositories, setRepositories] = useState(null);
    const [reposLoading, setReposLoading] = useState(false);

    const [selectedRepo, setSelectedRepo] = useState(null);
    const [tags, setTags] = useState(null);
    const [tagsLoading, setTagsLoading] = useState(false);

    function refresh() {

        setLoading(true);

        getAcrRegistries().then((data) => {
            setRegistries(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setRegistries({ configured: false, error: err.response?.data?.message || "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    function openRegistry(registry) {

        setSelectedRegistry(registry);
        setReposLoading(true);

        getAcrRepositories(registry.loginServer).then((data) => {
            setRepositories(data);
            setReposLoading(false);
        }).catch((err) => {
            console.error(err);
            setRepositories({ configured: false, error: err.response?.data?.message || "Unable to load repositories." });
            setReposLoading(false);
        });

    }

    function openRepo(repo) {

        setSelectedRepo(repo);
        setTagsLoading(true);

        getAcrTags(selectedRegistry.loginServer, repo.name).then((data) => {
            setTags(data);
            setTagsLoading(false);
        }).catch((err) => {
            console.error(err);
            setTags({ configured: false, error: err.response?.data?.message || "Unable to load tags." });
            setTagsLoading(false);
        });

    }

    const filteredRegistries = useMemo(() => {

        const items = registries?.registries || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed ? items.filter((r) => r.name.toLowerCase().includes(trimmed)) : items;

    }, [registries, search]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filteredRegistries, PAGE_SIZE);

    // ---- Level 3: tags ----

    if (selectedRepo) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedRepo.name}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedRepo(null); setTags(null); }}>
                        ← Back to repositories
                    </button>
                </div>

                {tagsLoading ? (

                    <p className="field-hint">Loading tags...</p>

                ) : !tags?.configured || tags.error ? (

                    <p className="error-message">{tags?.error || "Azure is not configured."}</p>

                ) : tags.images.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No tags in this repository.</p>

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

    // ---- Level 2: repositories ----

    if (selectedRegistry) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedRegistry.name}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedRegistry(null); setRepositories(null); }}>
                        ← Back to registries
                    </button>
                </div>

                {reposLoading ? (

                    <p className="field-hint">Loading repositories...</p>

                ) : !repositories?.configured || repositories.error ? (

                    <p className="error-message">{repositories?.error || "Azure is not configured."}</p>

                ) : repositories.repositories.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No repositories in this registry.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Repository</th>
                                    <th>Tags</th>
                                </tr>
                            </thead>

                            <tbody>

                                {repositories.repositories.map((repo) => (

                                    <tr key={repo.name} className="table-row-clickable" onClick={() => openRepo(repo)}>
                                        <td>{repo.name}</td>
                                        <td>{repo.tagCount}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

        );

    }

    // ---- Level 1: registries ----

    if (loading) {
        return <div className="card"><p className="empty-state">Loading ACR registries...</p></div>;
    }

    if (!registries?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Connect your Azure credentials (including a Subscription ID) in{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>Settings → Credentials → Azure</a>
                    {" "}to browse ACR.
                </p>
            </div>
        );

    }

    if (registries.error) {
        return <div className="card"><p className="error-message">{registries.error}</p></div>;
    }

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>ACR Registries</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
            </div>

            <SearchBox placeholder="Search registries..." value={search} onChange={setSearch} />

            {filteredRegistries.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No registries found.</p>

            ) : (

                <>

                <div className="table-scroll" style={{ marginTop: "12px" }}>

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Registry</th>
                                <th>Login Server</th>
                                <th>SKU</th>
                                <th>Created</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((registry) => (

                                <tr key={registry.loginServer} className="table-row-clickable" onClick={() => openRegistry(registry)}>
                                    <td>{registry.name}</td>
                                    <td className="smoke-test-metric-mono">{registry.loginServer}</td>
                                    <td>{registry.sku || "—"}</td>
                                    <td>{registry.createdAt ? new Date(registry.createdAt).toLocaleDateString() : "—"}</td>
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

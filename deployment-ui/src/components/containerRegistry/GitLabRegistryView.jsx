import { useEffect, useMemo, useState } from "react";

import { getGitLabRepositories, getGitLabTags } from "../../services/containerRegistryService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import formatBytes from "../../utils/formatBytes";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

// GitLab Container Registry - two levels (repositories -> tags), against
// this session's own credential (see GitLabRegistryLoginSection in
// Settings → Credentials → GitLab Registry), scoped to that credential's
// one configured project.
export default function GitLabRegistryView() {

    const { setTab } = useNavigation();

    const [list, setList] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [selectedRepo, setSelectedRepo] = useState(null);
    const [tags, setTags] = useState(null);
    const [tagsLoading, setTagsLoading] = useState(false);

    function refresh() {

        setLoading(true);

        getGitLabRepositories().then((data) => {
            setList(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setList({ configured: false, error: "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    function openRepo(repo) {

        setSelectedRepo(repo);
        setTagsLoading(true);

        getGitLabTags(repo.id).then((data) => {
            setTags(data);
            setTagsLoading(false);
        }).catch((err) => {
            console.error(err);
            setTags({ configured: false, error: "Unable to load tags." });
            setTagsLoading(false);
        });

    }

    const filtered = useMemo(() => {

        const repos = list?.repositories || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed ? repos.filter((r) => r.path.toLowerCase().includes(trimmed)) : repos;

    }, [list, search]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    if (selectedRepo) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedRepo.path}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedRepo(null); setTags(null); }}>
                        ← Back to repositories
                    </button>
                </div>

                {tagsLoading ? (

                    <p className="field-hint">Loading tags...</p>

                ) : !tags?.configured || tags.error ? (

                    <p className="error-message">{tags?.error || "GitLab Registry is not configured."}</p>

                ) : tags.images.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No tags in this repository.</p>

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

                                {tags.images.map((img, i) => (

                                    <tr key={`${img.digest}:${i}`}>
                                        <td>{img.tag}</td>
                                        <td>{img.sizeBytes ? formatBytes(img.sizeBytes) : "—"}</td>
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
        return <div className="card"><p className="empty-state">Loading GitLab repositories...</p></div>;
    }

    if (!list?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Connect your GitLab Registry credentials in{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>Settings → Credentials → GitLab Registry</a>
                    {" "}to browse this.
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
                <h2 className="card-title" style={{ marginBottom: 0 }}>GitLab Registry Repositories</h2>
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
                                <th>Tags</th>
                                <th>Created</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((repo) => (

                                <tr key={repo.id} className="table-row-clickable" onClick={() => openRepo(repo)}>
                                    <td>{repo.path}</td>
                                    <td>{repo.tagsCount}</td>
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

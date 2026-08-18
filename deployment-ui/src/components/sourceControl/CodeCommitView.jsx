import { useEffect, useMemo, useState } from "react";

import { getCodeCommitRepositories, getCodeCommitBranches } from "../../services/sourceControlService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

// AWS CodeCommit - two levels (repositories -> branches), reuses this
// session's own AWS credentials (see Settings → Credentials → AWS), no
// separate credential to set up - same self-service posture as ECR.
export default function CodeCommitView() {

    const { setTab } = useNavigation();

    const [list, setList] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [selectedRepo, setSelectedRepo] = useState(null);
    const [branches, setBranches] = useState(null);
    const [branchesLoading, setBranchesLoading] = useState(false);

    function refresh() {

        setLoading(true);

        getCodeCommitRepositories().then((data) => {
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
        setBranchesLoading(true);

        getCodeCommitBranches(repo.name).then((data) => {
            setBranches(data);
            setBranchesLoading(false);
        }).catch((err) => {
            console.error(err);
            setBranches({ configured: false, error: "Unable to load branches." });
            setBranchesLoading(false);
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
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedRepo(null); setBranches(null); }}>
                        ← Back to repositories
                    </button>
                </div>

                {branchesLoading ? (

                    <p className="field-hint">Loading branches...</p>

                ) : !branches?.configured || branches.error ? (

                    <p className="error-message">{branches?.error || "AWS is not configured."}</p>

                ) : branches.branches.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No branches in this repository.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Branch</th>
                                </tr>
                            </thead>

                            <tbody>

                                {branches.branches.map((b) => (

                                    <tr key={b}>
                                        <td>{b}{b === selectedRepo.defaultBranch ? " (default)" : ""}</td>
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
        return <div className="card"><p className="empty-state">Loading CodeCommit repositories...</p></div>;
    }

    if (!list?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Connect your AWS credentials in{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>Settings → Credentials → AWS</a>
                    {" "}to browse CodeCommit.
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
                <h2 className="card-title" style={{ marginBottom: 0 }}>CodeCommit Repositories</h2>
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
                                <th>Default Branch</th>
                                <th>Description</th>
                                <th>Last Modified</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((repo) => (

                                <tr key={repo.id || repo.name} className="table-row-clickable" onClick={() => openRepo(repo)}>
                                    <td>{repo.name}</td>
                                    <td>{repo.defaultBranch || "—"}</td>
                                    <td>{repo.description || "—"}</td>
                                    <td>{repo.lastModified ? new Date(repo.lastModified).toLocaleDateString() : "—"}</td>
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

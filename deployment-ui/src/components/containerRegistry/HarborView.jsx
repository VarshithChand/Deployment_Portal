import { useEffect, useMemo, useState } from "react";

import { getHarborProjects, getHarborRepositories, getHarborArtifacts } from "../../services/containerRegistryService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import formatBytes from "../../utils/formatBytes";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

// Harbor - three levels deep (projects -> repositories -> artifacts),
// against the portal-wide shared credential (see HostCredentialLoginSection
// in Settings → Credentials → Harbor).
export default function HarborView() {

    const { setTab } = useNavigation();

    const [projects, setProjects] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [selectedProject, setSelectedProject] = useState(null);
    const [repositories, setRepositories] = useState(null);
    const [reposLoading, setReposLoading] = useState(false);

    const [selectedRepo, setSelectedRepo] = useState(null);
    const [artifacts, setArtifacts] = useState(null);
    const [artifactsLoading, setArtifactsLoading] = useState(false);

    function refresh() {

        setLoading(true);

        getHarborProjects().then((data) => {
            setProjects(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setProjects({ configured: false, error: "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    function openProject(project) {

        setSelectedProject(project);
        setReposLoading(true);

        getHarborRepositories(project.name).then((data) => {
            setRepositories(data);
            setReposLoading(false);
        }).catch((err) => {
            console.error(err);
            setRepositories({ configured: false, error: "Unable to load repositories." });
            setReposLoading(false);
        });

    }

    function openRepo(repo) {

        setSelectedRepo(repo);
        setArtifactsLoading(true);

        // repo.name arrives as "{project}/{repo}" from Harbor's own
        // repositories list - the artifacts endpoint wants just the bare
        // repo part (see ContainerRegistryService.GetHarborArtifactsAsync).
        const bareName = repo.name.startsWith(`${selectedProject.name}/`)
            ? repo.name.slice(selectedProject.name.length + 1)
            : repo.name;

        getHarborArtifacts(selectedProject.name, bareName).then((data) => {
            setArtifacts(data);
            setArtifactsLoading(false);
        }).catch((err) => {
            console.error(err);
            setArtifacts({ configured: false, error: "Unable to load artifacts." });
            setArtifactsLoading(false);
        });

    }

    const filteredProjects = useMemo(() => {

        const items = projects?.projects || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed ? items.filter((p) => p.name.toLowerCase().includes(trimmed)) : items;

    }, [projects, search]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filteredProjects, PAGE_SIZE);

    // ---- Level 3: artifacts/tags ----

    if (selectedRepo) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedRepo.name}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedRepo(null); setArtifacts(null); }}>
                        ← Back to repositories
                    </button>
                </div>

                {artifactsLoading ? (

                    <p className="field-hint">Loading artifacts...</p>

                ) : !artifacts?.configured || artifacts.error ? (

                    <p className="error-message">{artifacts?.error || "Harbor is not configured."}</p>

                ) : artifacts.images.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No artifacts in this repository.</p>

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

                                {artifacts.images.map((img, i) => (

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

    // ---- Level 2: repositories ----

    if (selectedProject) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedProject.name}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedProject(null); setRepositories(null); }}>
                        ← Back to projects
                    </button>
                </div>

                {reposLoading ? (

                    <p className="field-hint">Loading repositories...</p>

                ) : !repositories?.configured || repositories.error ? (

                    <p className="error-message">{repositories?.error || "Harbor is not configured."}</p>

                ) : repositories.repositories.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No repositories in this project.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Repository</th>
                                    <th>Artifacts</th>
                                    <th>Pulls</th>
                                    <th>Updated</th>
                                </tr>
                            </thead>

                            <tbody>

                                {repositories.repositories.map((repo) => (

                                    <tr key={repo.name} className="table-row-clickable" onClick={() => openRepo(repo)}>
                                        <td>{repo.name}</td>
                                        <td>{repo.artifactCount}</td>
                                        <td>{repo.pullCount}</td>
                                        <td>{repo.updatedAt ? new Date(repo.updatedAt).toLocaleDateString() : "—"}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

        );

    }

    // ---- Level 1: projects ----

    if (loading) {
        return <div className="card"><p className="empty-state">Loading Harbor projects...</p></div>;
    }

    if (!projects?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Nobody has connected Harbor yet. An admin can connect it in{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>Settings → Credentials → Harbor</a>
                    {" "}to enable this for everyone.
                </p>
            </div>
        );

    }

    if (projects.error) {
        return <div className="card"><p className="error-message">{projects.error}</p></div>;
    }

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Harbor Projects</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
            </div>

            <SearchBox placeholder="Search projects..." value={search} onChange={setSearch} />

            {filteredProjects.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No projects found.</p>

            ) : (

                <>

                <div className="table-scroll" style={{ marginTop: "12px" }}>

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Project</th>
                                <th>Repositories</th>
                                <th>Created</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((project) => (

                                <tr key={project.name} className="table-row-clickable" onClick={() => openProject(project)}>
                                    <td>{project.name}</td>
                                    <td>{project.repoCount}</td>
                                    <td>{project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "—"}</td>
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

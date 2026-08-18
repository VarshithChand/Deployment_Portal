import { useEffect, useMemo, useState } from "react";

import { getGhcrPackages, getGhcrVersions } from "../../services/containerRegistryService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

// GHCR (GitHub Container Registry) - two levels (packages -> versions),
// against this session's own credential (see PortalRegistryLoginSection in
// Settings → Credentials → GHCR). Packages are scoped to that token's own
// GitHub account - see ContainerRegistryService.GetGhcrPackagesAsync's own
// comment on why organization-owned packages aren't covered yet.
export default function GhcrView() {

    const { setTab } = useNavigation();

    const [list, setList] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [selectedPackage, setSelectedPackage] = useState(null);
    const [versions, setVersions] = useState(null);
    const [versionsLoading, setVersionsLoading] = useState(false);

    function refresh() {

        setLoading(true);

        getGhcrPackages().then((data) => {
            setList(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setList({ configured: false, error: "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    function openPackage(pkg) {

        setSelectedPackage(pkg);
        setVersionsLoading(true);

        getGhcrVersions(pkg.name).then((data) => {
            setVersions(data);
            setVersionsLoading(false);
        }).catch((err) => {
            console.error(err);
            setVersions({ configured: false, error: "Unable to load versions." });
            setVersionsLoading(false);
        });

    }

    const filtered = useMemo(() => {

        const packages = list?.packages || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed ? packages.filter((p) => p.name.toLowerCase().includes(trimmed)) : packages;

    }, [list, search]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    if (selectedPackage) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedPackage.name}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedPackage(null); setVersions(null); }}>
                        ← Back to packages
                    </button>
                </div>

                {versionsLoading ? (

                    <p className="field-hint">Loading versions...</p>

                ) : !versions?.configured || versions.error ? (

                    <p className="error-message">{versions?.error || "GHCR is not configured."}</p>

                ) : versions.images.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No versions in this package.</p>

                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Tag(s)</th>
                                    <th>Pushed</th>
                                    <th>Digest</th>
                                </tr>
                            </thead>

                            <tbody>

                                {versions.images.map((img, i) => (

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

    if (loading) {
        return <div className="card"><p className="empty-state">Loading GHCR packages...</p></div>;
    }

    if (!list?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Connect your GHCR credentials in{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("settings"); }}>Settings → Credentials → GHCR</a>
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
                <h2 className="card-title" style={{ marginBottom: 0 }}>GHCR Packages</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
            </div>

            <SearchBox placeholder="Search packages..." value={search} onChange={setSearch} />

            {filtered.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No packages found.</p>

            ) : (

                <>

                <div className="table-scroll" style={{ marginTop: "12px" }}>

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Package</th>
                                <th>Visibility</th>
                                <th>Versions</th>
                                <th>Updated</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((pkg) => (

                                <tr key={pkg.name} className="table-row-clickable" onClick={() => openPackage(pkg)}>
                                    <td>{pkg.name}</td>
                                    <td>{pkg.visibility || "—"}</td>
                                    <td>{pkg.versionCount}</td>
                                    <td>{pkg.updatedAt ? new Date(pkg.updatedAt).toLocaleDateString() : "—"}</td>
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

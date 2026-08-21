import { useEffect, useMemo, useState } from "react";

import { getAzureDevOpsFeeds, getAzureDevOpsPackages, getAzureDevOpsPackageVersions } from "../../services/azureDevOpsService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import useNavigation from "../../hooks/useNavigation";

const PAGE_SIZE = 10;

// Azure DevOps' Package Feeds sub-page (Azure Artifacts) - three levels:
// feeds -> packages -> versions, against this session's own credential
// (see PortalRegistryLoginSection in Settings → Credentials → Azure
// DevOps). Feeds are listed org-wide, like Branches' repositories - no
// project picker needed here either.
export default function AzureDevOpsFeedsView() {

    const { setTab } = useNavigation();

    const [feeds, setFeeds] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const [selectedFeed, setSelectedFeed] = useState(null);
    const [packages, setPackages] = useState(null);
    const [packagesLoading, setPackagesLoading] = useState(false);

    const [selectedPackage, setSelectedPackage] = useState(null);
    const [versions, setVersions] = useState(null);
    const [versionsLoading, setVersionsLoading] = useState(false);

    function refresh() {

        setLoading(true);

        getAzureDevOpsFeeds().then((data) => {
            setFeeds(data);
            setLoading(false);
        }).catch((err) => {
            console.error(err);
            setFeeds({ configured: false, error: "Unable to reach the Deployment API." });
            setLoading(false);
        });

    }

    useEffect(refresh, []);

    function openFeed(feed) {

        setSelectedFeed(feed);
        setPackagesLoading(true);

        getAzureDevOpsPackages(feed.id).then((data) => {
            setPackages(data);
            setPackagesLoading(false);
        }).catch((err) => {
            console.error(err);
            setPackages({ configured: false, error: "Unable to load packages." });
            setPackagesLoading(false);
        });

    }

    function openPackage(pkg) {

        setSelectedPackage(pkg);
        setVersionsLoading(true);

        getAzureDevOpsPackageVersions(selectedFeed.id, pkg.id).then((data) => {
            setVersions(data);
            setVersionsLoading(false);
        }).catch((err) => {
            console.error(err);
            setVersions({ configured: false, error: "Unable to load versions." });
            setVersionsLoading(false);
        });

    }

    const filteredFeeds = useMemo(() => {

        const items = feeds?.feeds || [];
        const trimmed = search.trim().toLowerCase();

        return trimmed ? items.filter((f) => f.name.toLowerCase().includes(trimmed)) : items;

    }, [feeds, search]);

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filteredFeeds, PAGE_SIZE);

    const packagesList = packages?.packages || [];
    const {
        page: packagesPage, setPage: setPackagesPage, pageCount: packagesPageCount, pageItems: packagesPageItems,
        totalCount: packagesTotalCount, startIndex: packagesStartIndex, endIndex: packagesEndIndex
    } = usePagination(packagesList, PAGE_SIZE);

    const versionsList = versions?.versions || [];
    const {
        page: versionsPage, setPage: setVersionsPage, pageCount: versionsPageCount, pageItems: versionsPageItems,
        totalCount: versionsTotalCount, startIndex: versionsStartIndex, endIndex: versionsEndIndex
    } = usePagination(versionsList, PAGE_SIZE);

    // ---- Level 3: versions ----

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

                    <p className="error-message">{versions?.error || "Azure DevOps is not configured."}</p>

                ) : versionsList.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No versions published yet.</p>

                ) : (

                    <>

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Version</th>
                                    <th>Published</th>
                                </tr>
                            </thead>

                            <tbody>

                                {versionsPageItems.map((v) => (

                                    <tr key={v.version}>
                                        <td>
                                            {v.version}
                                            {v.isLatest && <span className="badge badge-success" style={{ marginLeft: "8px" }}>Latest</span>}
                                        </td>
                                        <td>{v.publishDate ? new Date(v.publishDate).toLocaleString() : "—"}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                    <Pagination
                        page={versionsPage}
                        pageCount={versionsPageCount}
                        totalCount={versionsTotalCount}
                        startIndex={versionsStartIndex}
                        endIndex={versionsEndIndex}
                        onPageChange={setVersionsPage}
                    />

                    </>

                )}

            </div>

        );

    }

    // ---- Level 2: packages ----

    if (selectedFeed) {

        return (

            <div className="card">

                <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 className="card-title" style={{ marginBottom: 0 }}>{selectedFeed.name}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedFeed(null); setPackages(null); }}>
                        ← Back to feeds
                    </button>
                </div>

                {packagesLoading ? (

                    <p className="field-hint">Loading packages...</p>

                ) : !packages?.configured || packages.error ? (

                    <p className="error-message">{packages?.error || "Azure DevOps is not configured."}</p>

                ) : packagesList.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No packages in this feed.</p>

                ) : (

                    <>

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Package</th>
                                    <th>Protocol</th>
                                </tr>
                            </thead>

                            <tbody>

                                {packagesPageItems.map((pkg) => (

                                    <tr key={pkg.id} className="table-row-clickable" onClick={() => openPackage(pkg)}>
                                        <td>{pkg.name}</td>
                                        <td>{pkg.protocolType || "—"}</td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                    <Pagination
                        page={packagesPage}
                        pageCount={packagesPageCount}
                        totalCount={packagesTotalCount}
                        startIndex={packagesStartIndex}
                        endIndex={packagesEndIndex}
                        onPageChange={setPackagesPage}
                    />

                    </>

                )}

            </div>

        );

    }

    // ---- Level 1: feeds ----

    if (loading) {
        return <div className="card"><p className="empty-state">Loading Azure Artifacts feeds...</p></div>;
    }

    if (!feeds?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Connect your Azure DevOps credentials in{" "}
                    <button type="button" className="btn-link" style={{ padding: 0 }} onClick={() => setTab("settings")}>Settings → Credentials → Azure DevOps</button>
                    {" "}to browse this.
                </p>
            </div>
        );

    }

    if (feeds.error) {
        return <div className="card"><p className="error-message">{feeds.error}</p></div>;
    }

    return (

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Azure Artifacts Feeds</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Refresh</button>
            </div>

            <SearchBox placeholder="Search feeds..." value={search} onChange={setSearch} />

            {filteredFeeds.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>No feeds found.</p>

            ) : (

                <>

                <div className="table-scroll" style={{ marginTop: "12px" }}>

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Feed</th>
                                <th>Description</th>
                            </tr>
                        </thead>

                        <tbody>

                            {pageItems.map((feed) => (

                                <tr key={feed.id} className="table-row-clickable" onClick={() => openFeed(feed)}>
                                    <td>{feed.name}</td>
                                    <td>{feed.description || "—"}</td>
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

import { useEffect, useState } from "react";

import { getAzureContainerApps } from "../../services/containerServicesService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import StateBadge from "./StateBadge";
import AzureContainerAppDetailPage from "./AzureContainerAppDetailPage";

const PAGE_SIZE = 10;

// Section 16 - Container Apps list (real, replacing nothing - this
// catalog entry previously fell back to the generic read-only Azure
// resource dialog like every other non-VM service). Row click opens real
// management (scale/start/stop/delete/restart revision).
export default function AzureContainerAppsManagementPage() {

    const [apps, setApps] = useState(null);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);

    function load() {

        getAzureContainerApps().then(setApps).catch((err) => {
            console.error(err);
            setApps({ configured: false, error: "Unable to reach the Deployment API." });
        });

    }

    useEffect(load, []);

    const list = apps?.apps || [];

    const filtered = list.filter((a) => {

        const q = search.trim().toLowerCase();

        if (!q) return true;

        return [a.name, a.resourceGroup, a.location, a.image].filter(Boolean).some((v) => v.toLowerCase().includes(q));

    });

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    useEffect(() => { setPage(1); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    if (selected) {

        return (
            <AzureContainerAppDetailPage
                resourceGroup={selected.resourceGroup}
                name={selected.name}
                onBack={() => { setSelected(null); load(); }}
            />
        );

    }

    if (!apps) {
        return <div className="card"><p className="empty-state">Loading Azure resources...</p></div>;
    }

    if (!apps.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your Azure credentials (including a Subscription ID) in Settings → Credentials
                    → Azure to manage Container Apps.
                </p>
            </div>
        );

    }

    if (apps.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load Container Apps.</p>
                <p className="field-hint">{apps.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    return (

        <div className="card">

            <h2 className="card-title">Container Apps</h2>

            <SearchBox placeholder="Search name, resource group, location, or image..." value={search} onChange={setSearch} />

            {filtered.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>
                    {list.length === 0 ? "No Container Apps found." : `No apps match "${search}".`}
                </p>

            ) : (

                <>

                    <div className="table-scroll" style={{ marginTop: "12px" }}>

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Resource Group</th>
                                    <th>Location</th>
                                    <th>Image</th>
                                    <th>Status</th>
                                    <th className="num">Min / Max</th>
                                </tr>
                            </thead>

                            <tbody>

                                {pageItems.map((a) => (

                                    <tr key={`${a.resourceGroup}/${a.name}`} className="table-row-clickable" onClick={() => setSelected(a)}>
                                        <td>{a.name}</td>
                                        <td>{a.resourceGroup}</td>
                                        <td>{a.location}</td>
                                        <td className="smoke-test-metric-mono">{a.image?.split("/").pop() || "—"}</td>
                                        <td><StateBadge state={a.runningStatus} /></td>
                                        <td className="num">{a.minReplicas} / {a.maxReplicas}</td>
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

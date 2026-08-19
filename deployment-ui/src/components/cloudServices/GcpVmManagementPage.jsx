import { useEffect, useState } from "react";

import { getGcpVms } from "../../services/cloudServicesService";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import StateBadge from "./StateBadge";
import GcpVmDetailPage from "./GcpVmDetailPage";

const PAGE_SIZE = 10;

// Replaces the "not built yet" GCP stub - Compute Engine instance list,
// same shape as EC2/Azure VM's own management pages. Row click opens the
// real detail page (start/stop/reset/delete, firewall, metrics) rather
// than the placeholder this used to be.
export default function GcpVmManagementPage() {

    const [vms, setVms] = useState(null);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);

    function load() {

        getGcpVms().then(setVms).catch((err) => {
            console.error(err);
            setVms({ configured: false, error: "Unable to reach the Deployment API." });
        });

    }

    useEffect(load, []);

    const instances = vms?.instances || [];

    const filtered = instances.filter((v) => {

        const q = search.trim().toLowerCase();

        if (!q) return true;

        return [v.name, v.zone, v.machineType, v.publicIp, v.privateIp]
            .filter(Boolean)
            .some((val) => val.toLowerCase().includes(q));

    });

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    useEffect(() => { setPage(1); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    if (selected) {

        return (
            <GcpVmDetailPage
                vm={selected}
                onBack={() => setSelected(null)}
                onChanged={() => { load(); setSelected(null); }}
            />
        );

    }

    if (!vms) {
        return <div className="card"><p className="empty-state">Loading GCP resources...</p></div>;
    }

    if (!vms.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your GCP credentials (Project ID and service account key) in Settings →
                    Credentials → GCP to manage Compute Engine instances.
                </p>
            </div>
        );

    }

    if (vms.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load Compute Engine instances.</p>
                <p className="field-hint">{vms.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    return (

        <div className="card">

            <h2 className="card-title">Compute Engine Instances</h2>

            <SearchBox placeholder="Search name, zone, machine type, or IP..." value={search} onChange={setSearch} />

            {filtered.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>
                    {instances.length === 0 ? "No Compute Engine instances found." : `No instances match "${search}".`}
                </p>

            ) : (

                <>

                    <div className="table-scroll" style={{ marginTop: "12px" }}>

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Zone</th>
                                    <th>Machine Type</th>
                                    <th>Status</th>
                                    <th>Public IP</th>
                                    <th>Private IP</th>
                                </tr>
                            </thead>

                            <tbody>

                                {pageItems.map((vm) => (

                                    <tr key={`${vm.zone}/${vm.name}`} className="table-row-clickable" onClick={() => setSelected(vm)}>
                                        <td>{vm.name}</td>
                                        <td>{vm.zone}</td>
                                        <td>{vm.machineType}</td>
                                        <td><StateBadge state={vm.status} /></td>
                                        <td>{vm.publicIp || "—"}</td>
                                        <td>{vm.privateIp || "—"}</td>
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

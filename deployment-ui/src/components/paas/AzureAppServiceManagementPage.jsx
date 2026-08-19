import { useEffect, useState } from "react";

import { getAppServices, bulkSwapSlots } from "../../services/azureAppServiceService";
import usePagination from "../../hooks/usePagination";
import useToast from "../../hooks/useToast";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import ConfirmDialog from "../ConfirmDialog";
import StateBadge from "../cloudServices/StateBadge";
import AzureAppServiceDetailPage from "./AzureAppServiceDetailPage";

const PAGE_SIZE = 10;

// Section 9's App Service list + section 13's bulk swap - selecting
// multiple apps here and swapping the same named source/target slot
// across all of them in one confirmed step. Each app's own slots aren't
// known at this list level (fetching every app's slot list up front
// would be the exact N+1 pattern section 36 warns against) - the bulk
// swap simply submits and lets each app's own real success/failure come
// back from the backend (a source slot that doesn't exist on a given
// app just fails that one item, exactly the "never report a blended
// success" contract section 27 already established for ECS).
export default function AzureAppServiceManagementPage() {

    const toast = useToast();

    const [apps, setApps] = useState(null);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);

    const [checked, setChecked] = useState(new Set());
    const [sourceSlot, setSourceSlot] = useState("staging");
    const [targetSlot, setTargetSlot] = useState("production");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [applying, setApplying] = useState(false);
    const [results, setResults] = useState(null);

    function load() {

        getAppServices().then(setApps).catch((err) => {
            console.error(err);
            setApps({ configured: false, error: "Unable to reach the Deployment API." });
        });

    }

    useEffect(load, []);

    const list = apps?.apps || [];

    const filtered = list.filter((a) => {

        const q = search.trim().toLowerCase();

        if (!q) return true;

        return [a.name, a.resourceGroup, a.location, a.defaultHostName].filter(Boolean).some((v) => v.toLowerCase().includes(q));

    });

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(filtered, PAGE_SIZE);

    useEffect(() => { setPage(1); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    function toggleChecked(name) {

        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });

    }

    const selectedApps = list.filter((a) => checked.has(a.name));

    async function applyBulkSwap() {

        setApplying(true);

        try {

            const items = selectedApps.map((a) => ({ resourceGroup: a.resourceGroup, appName: a.name, sourceSlot, targetSlot }));
            const result = await bulkSwapSlots(items);

            setResults(result.results);

            const failures = result.results.filter((r) => !r.success);

            if (failures.length === 0) toast.show(`Swapped ${selectedApps.length} app(s).`, "success");
            else toast.show(`${result.results.length - failures.length}/${result.results.length} apps swapped - see results below.`, "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to apply bulk swap.", "error");
        }
        finally {
            setApplying(false);
            setConfirmOpen(false);
        }

    }

    if (selected) {

        return (
            <AzureAppServiceDetailPage
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
                    → Azure to manage App Service.
                </p>
            </div>
        );

    }

    if (apps.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load App Services.</p>
                <p className="field-hint">{apps.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    return (

        <div className="card">

            <h2 className="card-title">App Services</h2>

            <SearchBox placeholder="Search name, resource group, location, or URL..." value={search} onChange={setSearch} />

            {checked.size > 0 && (

                <div className="cloud-service-bulk-bar">

                    <strong>{checked.size} app(s) selected</strong>

                    <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: "12px" }}>Source slot</label>
                        <input type="text" className="form-control" style={{ width: "120px" }} value={sourceSlot} onChange={(e) => setSourceSlot(e.target.value)} />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: "12px" }}>Target slot</label>
                        <input type="text" className="form-control" style={{ width: "120px" }} value={targetSlot} onChange={(e) => setTargetSlot(e.target.value)} />
                    </div>

                    <button type="button" className="btn btn-sm btn-primary" disabled={!sourceSlot || !targetSlot} onClick={() => setConfirmOpen(true)}>
                        Bulk Swap
                    </button>

                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setChecked(new Set()); setResults(null); }}>
                        Clear Selection
                    </button>

                </div>

            )}

            {results && (

                <div className="card" style={{ margin: "0 0 12px" }}>

                    <h4 className="settings-subhead" style={{ marginTop: 0 }}>Bulk Swap Results</h4>

                    <ul className="cloud-service-detail-list">
                        {results.map((r, index) => (
                            <li key={`${r.appName}-${index}`}>
                                {r.appName} ({r.slot}) {r.success ? <span className="badge badge-success">✓</span> : <span className="badge badge-danger">✗ {r.error}</span>}
                            </li>
                        ))}
                    </ul>

                </div>

            )}

            {filtered.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>
                    {list.length === 0 ? "No App Services found." : `No apps match "${search}".`}
                </p>

            ) : (

                <>

                    <div className="table-scroll" style={{ marginTop: "12px" }}>

                        <table className="table">

                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Name</th>
                                    <th>Resource Group</th>
                                    <th>Location</th>
                                    <th>Status</th>
                                    <th>URL</th>
                                </tr>
                            </thead>

                            <tbody>

                                {pageItems.map((a) => (

                                    <tr key={`${a.resourceGroup}/${a.name}`}>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <input type="checkbox" checked={checked.has(a.name)} onChange={() => toggleChecked(a.name)} />
                                        </td>
                                        <td className="table-row-clickable" onClick={() => setSelected(a)}>{a.name}</td>
                                        <td>{a.resourceGroup}</td>
                                        <td>{a.location}</td>
                                        <td><StateBadge state={a.state} /></td>
                                        <td>{a.defaultHostName || "—"}</td>
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

            <ConfirmDialog
                open={confirmOpen}
                title="Bulk swap deployment slots?"
                message={(
                    <>
                        You are about to swap <strong>{sourceSlot}</strong> → <strong>{targetSlot}</strong> for {selectedApps.length} app(s):
                        <ul>
                            {selectedApps.map((a) => <li key={a.name}>{a.name}</li>)}
                        </ul>
                    </>
                )}
                confirmLabel={applying ? "Swapping..." : "Confirm Bulk Swap"}
                onConfirm={applyBulkSwap}
                onCancel={() => setConfirmOpen(false)}
            />

        </div>

    );

}

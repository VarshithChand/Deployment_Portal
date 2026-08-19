import { useEffect, useState } from "react";

import {
    getAzureVms, startAzureVm, stopAzureVm, restartAzureVm, deleteAzureVm,
    createAzureVm, getAzureVmCatalog
} from "../../services/cloudServicesService";
import AZURE_REGIONS from "../../data/azureRegions";
import usePagination from "../../hooks/usePagination";
import useToast from "../../hooks/useToast";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import ComboBox from "../common/ComboBox";
import StateBadge from "./StateBadge";
import TypedConfirmDialog from "./TypedConfirmDialog";
import AzureVmDetailPage from "./AzureVmDetailPage";

const PAGE_SIZE = 10;

// Azure's own power states (running/deallocated/stopped/starting/
// stopping/deallocating/...) - which actions make sense depends on
// whether the VM is actually stoppable/startable right now, same
// "only show what's valid" reasoning as AWS's own actionsForState.
function actionsForState(state) {

    const value = (state || "").toLowerCase();

    if (value === "running") return ["stop", "restart", "delete"];
    if (value === "deallocated" || value === "stopped") return ["start", "delete"];
    if (value === "starting" || value === "stopping" || value === "deallocating") return [];

    return ["delete"];

}

const EMPTY_FORM = {
    resourceGroup: "", name: "", location: "", size: "", image: "",
    adminUsername: "", adminPassword: "", sshPublicKey: ""
};

// Rendered as a sibling of .card by the caller, not nested inside one -
// see AzureDevOpsPipelinesView's own dialog placement fix for why a
// fixed-position dialog inside an ancestor with backdrop-filter gets
// trapped inside that ancestor's bounds instead of the viewport.
function CreateVmDialog({ open, catalog, creating, onCreate, onClose }) {

    const [form, setForm] = useState(EMPTY_FORM);

    useEffect(() => {

        if (open) {
            setForm(EMPTY_FORM);
        }

    }, [open]);

    if (!open) {
        return null;
    }

    const selectedImage = catalog?.images?.find((i) => i.value === form.image);
    const isWindows = !!selectedImage?.isWindows;

    function setField(key, value) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function handleSubmit(e) {
        e.preventDefault();
        onCreate(form);
    }

    return (

        <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !creating) onClose(); }}>

            <div className="dialog" role="alertdialog" aria-modal="true">

                <h2>Create Virtual Machine</h2>

                <p className="field-hint" style={{ marginTop: 0 }}>
                    A new Virtual Network, Subnet, Network Security Group, Public IP, and Network
                    Interface are created for this VM automatically, with a default rule allowing{" "}
                    {isWindows ? "RDP (3389)" : "SSH (22)"} from the internet.
                </p>

                <form onSubmit={handleSubmit}>

                    <div className="form-group">
                        <label>Resource Group</label>
                        <input
                            type="text" className="form-control" value={form.resourceGroup}
                            onChange={(e) => setField("resourceGroup", e.target.value)}
                            placeholder="my-resource-group" required autoComplete="off"
                        />
                        <p className="field-hint" style={{ marginTop: "4px" }}>Created automatically if it doesn't already exist.</p>
                    </div>

                    <div className="form-group">
                        <label>VM Name</label>
                        <input
                            type="text" className="form-control" value={form.name}
                            onChange={(e) => setField("name", e.target.value)}
                            placeholder="my-vm" required autoComplete="off"
                        />
                    </div>

                    <div className="form-group">
                        <label>Location</label>
                        <ComboBox
                            options={AZURE_REGIONS}
                            value={form.location}
                            onChange={(v) => setField("location", v)}
                            placeholder="Select a region..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Size</label>
                        <ComboBox
                            options={catalog?.sizes || []}
                            value={form.size}
                            onChange={(v) => setField("size", v)}
                            placeholder="Select a VM size..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Image</label>
                        <ComboBox
                            options={catalog?.images || []}
                            value={form.image}
                            onChange={(v) => setField("image", v)}
                            placeholder="Select an image..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Admin Username</label>
                        <input
                            type="text" className="form-control" value={form.adminUsername}
                            onChange={(e) => setField("adminUsername", e.target.value)}
                            required autoComplete="off"
                        />
                    </div>

                    <div className="form-group">
                        <label>Admin Password{isWindows ? "" : " (or use an SSH key below)"}</label>
                        <input
                            type="password" className="form-control" value={form.adminPassword}
                            onChange={(e) => setField("adminPassword", e.target.value)}
                            autoComplete="new-password"
                        />
                        <p className="field-hint" style={{ marginTop: "4px" }}>
                            Azure requires 12+ characters with a mix of uppercase, lowercase, numbers, and symbols.
                        </p>
                    </div>

                    {!isWindows && (

                        <div className="form-group">
                            <label>SSH Public Key (optional)</label>
                            <textarea
                                className="form-control" rows={3} value={form.sshPublicKey}
                                onChange={(e) => setField("sshPublicKey", e.target.value)}
                                placeholder="ssh-ed25519 AAAA..."
                            />
                        </div>

                    )}

                    <div className="button-row">

                        <button type="submit" className="btn btn-primary" disabled={creating}>
                            {creating ? "Creating..." : "Create VM"}
                        </button>

                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={creating}>
                            Cancel
                        </button>

                    </div>

                </form>

            </div>

        </div>

    );

}

export default function AzureVmManagementPage({ refreshToken }) {

    const toast = useToast();

    const [vms, setVms] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [actioningName, setActioningName] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [catalog, setCatalog] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [selectedVm, setSelectedVm] = useState(null);

    async function load() {

        setLoading(true);

        try {
            setVms(await getAzureVms());
        }
        catch (err) {
            console.error(err);
            setVms({ configured: false, error: "Unable to reach the Deployment API." });
        }
        finally {
            setLoading(false);
        }

    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshToken]);

    useEffect(() => {

        getAzureVmCatalog().then(setCatalog).catch((err) => console.error(err));

    }, []);

    const instances = vms?.vms || [];

    const filtered = instances.filter((v) => {

        const q = search.trim().toLowerCase();

        if (!q) return true;

        return [v.name, v.resourceGroup, v.location, v.size]
            .filter(Boolean)
            .some((val) => val.toLowerCase().includes(q));

    });

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(filtered, PAGE_SIZE);

    useEffect(() => {
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    async function runAction(vm, actionFn, label) {

        setActioningName(vm.name);

        try {

            const result = await actionFn(vm.resourceGroup, vm.name);

            if (result.success) {
                toast.show(result.message || `${label} requested.`, "success");
            }
            else {
                toast.show(result.error || `Unable to ${label.toLowerCase()} that VM.`, "error");
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Unable to ${label.toLowerCase()} that VM.`, "error");

        }
        finally {

            setActioningName(null);
            load();

        }

    }

    async function handleDeleteConfirm() {

        const target = deleteTarget;

        if (!target) return;

        setDeleting(true);

        try {
            await runAction(target, deleteAzureVm, "Delete");
        }
        finally {
            setDeleting(false);
            setDeleteTarget(null);
        }

    }

    async function handleCreate(form) {

        setCreating(true);

        try {

            const payload = {
                resourceGroup: form.resourceGroup,
                name: form.name,
                location: form.location,
                size: form.size,
                image: form.image,
                adminUsername: form.adminUsername,
                adminPassword: form.adminPassword || null,
                sshPublicKey: form.sshPublicKey || null
            };

            const result = await createAzureVm(payload);

            if (result.success) {
                toast.show(result.message || "VM creation requested.", "success");
                setCreateOpen(false);
                load();
            }
            else {
                toast.show(result.error || "Unable to create that VM.", "error");
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Unable to create that VM.", "error");

        }
        finally {

            setCreating(false);

        }

    }

    if (selectedVm) {

        return (
            <AzureVmDetailPage
                resourceGroup={selectedVm.resourceGroup}
                vmName={selectedVm.name}
                onBack={() => { setSelectedVm(null); load(); }}
            />
        );

    }

    if (loading) {

        return (
            <div className="card">
                <p className="empty-state">Loading Azure resources...</p>
            </div>
        );

    }

    if (!vms?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your Azure credentials (including a Subscription ID) in Settings → Credentials
                    → Azure to manage virtual machines.
                </p>
            </div>
        );

    }

    if (vms.error) {

        return (

            <div className="card">

                <p className="error-message">Unable to load VMs.</p>

                <p className="field-hint">{vms.error}</p>

                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>

            </div>

        );

    }

    return (

        <>

        <CreateVmDialog
            open={createOpen}
            catalog={catalog}
            creating={creating}
            onCreate={handleCreate}
            onClose={() => setCreateOpen(false)}
        />

        <div className="card">

            <div className="button-row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 className="card-title" style={{ marginBottom: 0 }}>Virtual Machines</h2>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)} disabled={!catalog}>
                    + Create VM
                </button>
            </div>

            <SearchBox
                placeholder="Search name, resource group, location, or size..."
                value={search}
                onChange={setSearch}
            />

            {filtered.length === 0 ? (

                <p className="empty-state" style={{ textAlign: "left", marginTop: "12px" }}>
                    {instances.length === 0 ? "No virtual machines found." : `No VMs match "${search}".`}
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
                                    <th>Size</th>
                                    <th>OS</th>
                                    <th>State</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>

                            <tbody>

                                {pageItems.map((vm) => {

                                    const actions = actionsForState(vm.powerState);
                                    const busy = actioningName === vm.name;

                                    return (

                                        <tr key={`${vm.resourceGroup}/${vm.name}`} className="table-row-clickable" onClick={() => setSelectedVm(vm)}>
                                            <td>{vm.name}</td>
                                            <td>{vm.resourceGroup}</td>
                                            <td>{vm.location}</td>
                                            <td>{vm.size}</td>
                                            <td>{vm.osType || "—"}</td>
                                            <td><StateBadge state={vm.powerState} /></td>
                                            <td onClick={(e) => e.stopPropagation()}>

                                                {busy ? (

                                                    <span className="field-hint">Working...</span>

                                                ) : actions.length === 0 ? (

                                                    <span className="field-hint">—</span>

                                                ) : (

                                                    <div className="button-row" style={{ margin: 0 }}>

                                                        {actions.includes("start") && (
                                                            <button type="button" className="btn btn-sm btn-success" onClick={() => runAction(vm, startAzureVm, "Start")}>
                                                                Start
                                                            </button>
                                                        )}

                                                        {actions.includes("stop") && (
                                                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => runAction(vm, stopAzureVm, "Stop")}>
                                                                Stop
                                                            </button>
                                                        )}

                                                        {actions.includes("restart") && (
                                                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => runAction(vm, restartAzureVm, "Restart")}>
                                                                Restart
                                                            </button>
                                                        )}

                                                        {actions.includes("delete") && (
                                                            <button type="button" className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(vm)}>
                                                                Delete
                                                            </button>
                                                        )}

                                                    </div>

                                                )}

                                            </td>
                                        </tr>

                                    );

                                })}

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

        <p className="field-hint" style={{ marginTop: "-8px" }}>
            Deleting a VM does not delete its disk, network interface, or public IP - remove those
            separately in Azure Portal if you don't need them, or they'll keep billing.
        </p>

        <TypedConfirmDialog
            open={!!deleteTarget}
            title="Delete virtual machine?"
            message={(
                <>
                    This permanently deletes <strong>{deleteTarget?.name}</strong> in resource group{" "}
                    <strong>{deleteTarget?.resourceGroup}</strong>. This cannot be undone.
                </>
            )}
            resourceName={deleteTarget?.name}
            confirmLabel="Delete"
            loading={deleting}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteTarget(null)}
        />

        </>

    );

}

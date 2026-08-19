import { useEffect, useState } from "react";

import { getAppServiceDetail, scaleAppServicePlan, deleteAppService } from "../../services/azureAppServiceService";
import useToast from "../../hooks/useToast";
import CloudServiceBreadcrumbs from "../cloudServices/CloudServiceBreadcrumbs";
import StateBadge from "../cloudServices/StateBadge";
import TypedConfirmDialog from "../cloudServices/TypedConfirmDialog";
import AzureAppServiceSlotDetailPage from "./AzureAppServiceSlotDetailPage";

const QUICK_COUNTS = [1, 2, 5, 10];

// Section 9's App Service detail - overview + the Slots table (section
// 10), each row opening real per-slot management
// (AzureAppServiceSlotDetailPage.jsx). Scaling here targets the App
// Service PLAN, not this app alone - Azure's real model, surfaced
// honestly in the field-hint rather than implying per-app isolation.
export default function AzureAppServiceDetailPage({ resourceGroup, name, onBack }) {

    const toast = useToast();

    const [detail, setDetail] = useState(null);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [capacity, setCapacity] = useState("");
    const [scaling, setScaling] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    function load() {
        getAppServiceDetail(resourceGroup, name).then(setDetail).catch((err) => {
            console.error(err);
            setDetail({ configured: false, error: "Unable to reach the Deployment API." });
        });
    }

    useEffect(load, [resourceGroup, name]); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleScale() {

        setScaling(true);

        try {

            const result = await scaleAppServicePlan(resourceGroup, name, Number(capacity));

            if (result.success) toast.show(result.message || "Scale requested.", "success");
            else toast.show(result.error || "Unable to scale that plan.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to scale that plan.", "error");
        }
        finally {
            setScaling(false);
        }

    }

    async function handleDeleteConfirm() {

        setDeleting(true);

        try {

            const result = await deleteAppService(resourceGroup, name);

            if (result.success) toast.show(result.message || "Delete requested.", "success");
            else toast.show(result.error || "Unable to delete that app.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to delete that app.", "error");
        }
        finally {
            setDeleting(false);
            setDeleteOpen(false);
            onBack();
        }

    }

    if (selectedSlot) {

        return (
            <AzureAppServiceSlotDetailPage
                resourceGroup={resourceGroup}
                appName={name}
                slot={selectedSlot}
                otherSlots={detail?.slots || []}
                onBack={() => setSelectedSlot(null)}
                onChanged={() => { load(); setSelectedSlot(null); }}
            />
        );

    }

    if (!detail) {
        return <p className="empty-state">Loading App Service detail...</p>;
    }

    if (detail.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load this App Service.</p>
                <p className="field-hint">{detail.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    const app = detail.app;

    return (

        <>

            <CloudServiceBreadcrumbs items={[{ label: "App Service", onClick: onBack }, { label: app?.name }]} />

            <div className="card cloud-service-detail-page-header">

                <div className="cloud-service-detail-page-header-main">

                    <div>
                        <h1 style={{ margin: "2px 0" }}>{app?.name}</h1>
                        <p className="field-hint" style={{ margin: 0 }}>{app?.resourceGroup}</p>
                        <div style={{ marginTop: "8px" }}><StateBadge state={app?.state} /></div>
                    </div>

                </div>

                <div className="cloud-service-detail-page-header-actions">
                    <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>Delete</button>
                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Overview</h3>

                <div className="cloud-service-connection-grid">
                    <div><p className="field-hint" style={{ margin: 0 }}>Location</p><p>{app?.location}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Runtime</p><p className="smoke-test-metric-mono">{detail.runtime || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Always On</p><p>{detail.alwaysOn == null ? "—" : detail.alwaysOn ? "Yes" : "No"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Production URL</p><p>{app?.defaultHostName ? <a href={`https://${app.defaultHostName}`} target="_blank" rel="noreferrer">{app.defaultHostName}</a> : "—"}</p></div>
                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Scaling</h3>

                <p className="field-hint" style={{ marginTop: 0 }}>
                    Scales the App Service Plan this app runs on - every other app on the same plan is
                    affected too, since instance count is a property of the plan, not this app alone.
                </p>

                <div className="button-row">
                    {QUICK_COUNTS.map((n) => (
                        <button key={n} type="button" className={`btn btn-sm ${capacity === String(n) ? "btn-primary" : "btn-secondary"}`} onClick={() => setCapacity(String(n))}>
                            {n}
                        </button>
                    ))}
                </div>

                <div className="form-group" style={{ maxWidth: "160px" }}>
                    <label>Instance Count</label>
                    <input type="number" min="1" className="form-control" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                </div>

                <button type="button" className="btn btn-primary btn-sm" onClick={handleScale} disabled={scaling || capacity === ""}>
                    {scaling ? "Applying..." : "Apply"}
                </button>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Deployment Slots</h3>

                <div className="table-scroll">

                    <table className="table">

                        <thead>
                            <tr>
                                <th>Slot</th>
                                <th>Status</th>
                                <th>URL</th>
                            </tr>
                        </thead>

                        <tbody>

                            {detail.slots?.map((s) => (

                                <tr key={s.name} className="table-row-clickable" onClick={() => setSelectedSlot(s)}>
                                    <td>{s.name}{s.isProductionSlot && <span className="badge badge-secondary" style={{ marginLeft: "8px" }}>Production</span>}</td>
                                    <td><StateBadge state={s.state} /></td>
                                    <td>{s.defaultHostName || "—"}</td>
                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

            </div>

            <TypedConfirmDialog
                open={deleteOpen}
                title="Delete this App Service?"
                message={<>This permanently deletes <strong>{app?.name}</strong> and every one of its deployment slots. This cannot be undone.</>}
                resourceName={`DELETE ${app?.name}`}
                confirmLabel="Delete"
                loading={deleting}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteOpen(false)}
            />

        </>

    );

}

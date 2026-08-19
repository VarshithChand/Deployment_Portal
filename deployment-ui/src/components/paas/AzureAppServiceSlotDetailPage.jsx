import { useEffect, useState } from "react";

import {
    startAppService, stopAppService, restartAppService, swapSlot, getAppServiceVariables,
    updateAppServiceVariable, deleteAppServiceSlot, getAppServiceMetrics
} from "../../services/azureAppServiceService";
import useToast from "../../hooks/useToast";
import CloudServiceBreadcrumbs from "../cloudServices/CloudServiceBreadcrumbs";
import StateBadge from "../cloudServices/StateBadge";
import TypedConfirmDialog from "../cloudServices/TypedConfirmDialog";
import ConfirmDialog from "../ConfirmDialog";
import RangeSelector from "../hosting-observability/RangeSelector";
import LineChart from "../charts/LineChart";

const RANGE_MINUTES = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440, "7d": 10080 };

// Section 12's slot detail: Start/Stop/Restart/Swap/Configuration/
// Environment Variables/Logs/Metrics. `otherSlots` is the sibling slot
// list (from the parent app's own already-fetched detail) so the Swap
// target dropdown never needs its own extra fetch.
export default function AzureAppServiceSlotDetailPage({ resourceGroup, appName, slot, otherSlots, onBack, onChanged }) {

    const toast = useToast();

    const [variables, setVariables] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [range, setRange] = useState("1h");

    const [actioning, setActioning] = useState(false);
    const [swapTarget, setSwapTarget] = useState(slot.isProductionSlot ? "" : "production");
    const [swapOpen, setSwapOpen] = useState(false);
    const [swapping, setSwapping] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [varForm, setVarForm] = useState({ name: "", value: "" });
    const [savingVar, setSavingVar] = useState(false);
    const [removeVarTarget, setRemoveVarTarget] = useState(null);
    const [removingVar, setRemovingVar] = useState(false);

    function loadVariables() {
        getAppServiceVariables(resourceGroup, appName, slot.name).then(setVariables).catch((err) => console.error(err));
    }

    useEffect(loadVariables, [resourceGroup, appName, slot.name]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {

        getAppServiceMetrics(resourceGroup, appName, slot.name, RANGE_MINUTES[range]).then(setMetrics).catch((err) => console.error(err));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resourceGroup, appName, slot.name, range]);

    async function runAction(actionFn, label) {

        setActioning(true);

        try {

            const result = await actionFn(resourceGroup, appName, slot.name);

            if (result.success) toast.show(result.message || `${label} requested.`, "success");
            else toast.show(result.error || `Unable to ${label.toLowerCase()} that slot.`, "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || `Unable to ${label.toLowerCase()} that slot.`, "error");
        }
        finally {
            setActioning(false);
            onChanged();
        }

    }

    async function handleSwapConfirm() {

        setSwapping(true);

        try {

            const result = await swapSlot(resourceGroup, appName, slot.name, swapTarget);

            if (result.success) toast.show(result.message || "Swap requested.", "success");
            else toast.show(result.error || "Unable to swap that slot.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to swap that slot.", "error");
        }
        finally {
            setSwapping(false);
            setSwapOpen(false);
            onChanged();
        }

    }

    async function handleDeleteConfirm() {

        setDeleting(true);

        try {

            const result = await deleteAppServiceSlot(resourceGroup, appName, slot.name);

            if (result.success) toast.show(result.message || "Delete requested.", "success");
            else toast.show(result.error || "Unable to delete that slot.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to delete that slot.", "error");
        }
        finally {
            setDeleting(false);
            setDeleteOpen(false);
            onChanged();
        }

    }

    async function handleAddVariable(e) {

        e.preventDefault();

        if (!varForm.name.trim()) return;

        setSavingVar(true);

        try {

            const result = await updateAppServiceVariable(resourceGroup, appName, slot.name, varForm.name.trim(), varForm.value);

            if (result.success) {
                toast.show("Setting saved.", "success");
                setVarForm({ name: "", value: "" });
            }
            else {
                toast.show(result.error || "Unable to save that setting.", "error");
            }

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save that setting.", "error");
        }
        finally {
            setSavingVar(false);
            loadVariables();
        }

    }

    async function handleRemoveVariableConfirm() {

        setRemovingVar(true);

        try {

            const result = await updateAppServiceVariable(resourceGroup, appName, slot.name, removeVarTarget, null);

            if (result.success) toast.show("Setting removed.", "success");
            else toast.show(result.error || "Unable to remove that setting.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to remove that setting.", "error");
        }
        finally {
            setRemovingVar(false);
            setRemoveVarTarget(null);
            loadVariables();
        }

    }

    const swapChoices = (otherSlots || []).filter((s) => s.name !== slot.name);
    const state = (slot.state || "").toLowerCase();

    return (

        <>

            <CloudServiceBreadcrumbs items={[{ label: appName, onClick: onBack }, { label: slot.name }]} />

            <div className="card cloud-service-detail-page-header">

                <div className="cloud-service-detail-page-header-main">

                    <div>
                        <h1 style={{ margin: "2px 0" }}>{slot.name}</h1>
                        <p className="field-hint" style={{ margin: 0 }}>{appName}</p>
                        <div style={{ marginTop: "8px" }}><StateBadge state={slot.state} /></div>
                    </div>

                </div>

                <div className="cloud-service-detail-page-header-actions">

                    {actioning ? (
                        <span className="field-hint">Working...</span>
                    ) : (
                        <>
                            {state === "stopped" ? (
                                <button type="button" className="btn btn-success" onClick={() => runAction(startAppService, "Start")}>Start</button>
                            ) : (
                                <button type="button" className="btn btn-secondary" onClick={() => runAction(stopAppService, "Stop")}>Stop</button>
                            )}
                            <button type="button" className="btn btn-secondary" onClick={() => runAction(restartAppService, "Restart")}>Restart</button>
                            {swapChoices.length > 0 && (
                                <button type="button" className="btn btn-secondary" onClick={() => setSwapOpen(true)}>Swap</button>
                            )}
                            {!slot.isProductionSlot && (
                                <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>Delete</button>
                            )}
                        </>
                    )}

                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Overview</h3>

                <div className="cloud-service-connection-grid">
                    <div><p className="field-hint" style={{ margin: 0 }}>URL</p><p>{slot.defaultHostName ? <a href={`https://${slot.defaultHostName}`} target="_blank" rel="noreferrer">{slot.defaultHostName}</a> : "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Slot</p><p>{slot.isProductionSlot ? "Production (main site)" : slot.name}</p></div>
                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Environment Variables</h3>

                {!variables ? (
                    <p className="empty-state">Loading...</p>
                ) : variables.error ? (
                    <p className="error-message">{variables.error}</p>
                ) : variables.variables.length === 0 ? (
                    <p className="empty-state" style={{ textAlign: "left" }}>No app settings configured.</p>
                ) : (
                    <ul className="cloud-service-detail-list">
                        {variables.variables.map((v) => (
                            <li key={v.name}>
                                <span className="smoke-test-metric-mono">{v.name}</span> = {v.isSecret ? "********" : v.value}
                                <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: "10px" }} onClick={() => setRemoveVarTarget(v.name)}>
                                    Delete
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <h4 className="settings-subhead" style={{ marginTop: "16px" }}>Add / Update Setting</h4>

                <form onSubmit={handleAddVariable}>

                    <div className="cloud-service-firewall-form-grid">

                        <div className="form-group">
                            <label>Name</label>
                            <input type="text" className="form-control" value={varForm.name} onChange={(e) => setVarForm((f) => ({ ...f, name: e.target.value }))} required />
                        </div>

                        <div className="form-group">
                            <label>Value</label>
                            <input type="text" className="form-control" value={varForm.value} onChange={(e) => setVarForm((f) => ({ ...f, value: e.target.value }))} />
                        </div>

                    </div>

                    <button type="submit" className="btn btn-primary btn-sm" disabled={savingVar}>
                        {savingVar ? "Saving..." : "Save Setting"}
                    </button>

                </form>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Performance</h3>

                <RangeSelector value={range} onChange={setRange} />

                {!metrics ? (
                    <p className="empty-state">Loading metrics...</p>
                ) : metrics.error ? (
                    <p className="error-message">{metrics.error}</p>
                ) : (

                    <div className="chart-analysis-grid">
                        {metrics.series.map((series) => (
                            <div className="chart-analysis-card" key={series.label}>
                                <h4>{series.label}</h4>
                                <LineChart points={series.points} />
                            </div>
                        ))}
                    </div>

                )}

            </div>

            <div className="card">
                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Logs</h3>
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Log streaming isn't wired up here yet - use Open Azure Portal from the app list for
                    live log streaming.
                </p>
            </div>

            <ConfirmDialog
                open={swapOpen}
                title="Swap deployment slots?"
                message={(
                    <>
                        Source: <strong>{slot.name}</strong><br />
                        Target: <strong>{swapTarget}</strong><br />
                        {swapChoices.length > 1 && (
                            <div className="form-group" style={{ marginTop: "10px" }}>
                                <label>Target slot</label>
                                <select className="form-control" value={swapTarget} onChange={(e) => setSwapTarget(e.target.value)}>
                                    {swapChoices.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                                </select>
                            </div>
                        )}
                    </>
                )}
                confirmLabel={swapping ? "Swapping..." : "Swap"}
                onConfirm={handleSwapConfirm}
                onCancel={() => setSwapOpen(false)}
            />

            <TypedConfirmDialog
                open={deleteOpen}
                title="Delete this slot?"
                message={<>This permanently deletes slot <strong>{slot.name}</strong> of <strong>{appName}</strong>. This cannot be undone.</>}
                resourceName={`DELETE ${slot.name}`}
                confirmLabel="Delete"
                loading={deleting}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteOpen(false)}
            />

            <ConfirmDialog
                open={!!removeVarTarget}
                title="Remove this setting?"
                message={removeVarTarget ? `This removes ${removeVarTarget} from ${slot.name}.` : ""}
                confirmLabel={removingVar ? "Removing..." : "Remove"}
                danger
                onConfirm={handleRemoveVariableConfirm}
                onCancel={() => setRemoveVarTarget(null)}
            />

        </>

    );

}

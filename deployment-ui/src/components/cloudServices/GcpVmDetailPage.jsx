import { useEffect, useState } from "react";

import {
    getGcpFirewall, addGcpFirewallRule, removeGcpFirewallRule, getGcpVmMetrics,
    getResourceAuditHistory, startGcpVm, stopGcpVm, resetGcpVm, deleteGcpVm
} from "../../services/cloudServicesService";
import useToast from "../../hooks/useToast";
import CloudServiceBreadcrumbs from "./CloudServiceBreadcrumbs";
import StateBadge from "./StateBadge";
import TypedConfirmDialog from "./TypedConfirmDialog";
import ConnectionInfoCard from "./ConnectionInfoCard";
import FirewallRulesCard from "./FirewallRulesCard";
import RelationshipDiagram from "./RelationshipDiagram";
import RangeSelector from "../hosting-observability/RangeSelector";
import LineChart from "../charts/LineChart";

const RANGE_MINUTES = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440, "7d": 10080 };

// GCP has no server-side "detail" call beyond what the instance list
// already returns (name/zone/machineType/status/IPs/labels) - the vm prop
// comes straight from GcpVmManagementPage's own list, no extra fetch.
export default function GcpVmDetailPage({ vm, onBack, onChanged }) {

    const toast = useToast();

    const [firewall, setFirewall] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [audit, setAudit] = useState(null);
    const [range, setRange] = useState("1h");
    const [actioning, setActioning] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    function loadFirewall() {
        getGcpFirewall().then(setFirewall).catch((err) => console.error(err));
    }

    function loadAudit() {
        getResourceAuditHistory(vm.name).then(setAudit).catch((err) => console.error(err));
    }

    useEffect(() => {
        loadFirewall();
        loadAudit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vm.name]);

    useEffect(() => {

        if (!vm.instanceId) {
            setMetrics({ configured: true, error: "No numeric instance ID available for metrics." });
            return;
        }

        getGcpVmMetrics(vm.zone, vm.name, vm.instanceId, RANGE_MINUTES[range]).then(setMetrics).catch((err) => console.error(err));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vm.zone, vm.name, vm.instanceId, range]);

    async function runAction(actionFn, label) {

        setActioning(true);

        try {

            const result = await actionFn(vm.zone, vm.name);

            if (result.success) toast.show(result.message || `${label} requested.`, "success");
            else toast.show(result.error || `Unable to ${label.toLowerCase()} that VM.`, "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || `Unable to ${label.toLowerCase()} that VM.`, "error");
        }
        finally {
            setActioning(false);
            onChanged();
        }

    }

    async function handleDeleteConfirm() {

        setDeleting(true);

        try {
            await runAction(deleteGcpVm, "Delete");
        }
        finally {
            setDeleting(false);
            setDeleteOpen(false);
        }

    }

    async function handleAddRule(rule) {

        const result = await addGcpFirewallRule(rule);

        if (result.success) toast.show("Firewall rule added.", "success");
        else toast.show(result.error || "Unable to add that rule.", "error");

        loadFirewall();

    }

    async function handleRemoveRule(rule) {

        const result = await removeGcpFirewallRule(rule.id);

        if (result.success) toast.show("Firewall rule removed.", "success");
        else toast.show(result.error || "Unable to remove that rule.", "error");

        loadFirewall();

    }

    const state = (vm.status || "").toUpperCase();
    const actions = state === "RUNNING" ? ["stop", "reset", "delete"]
        : state === "TERMINATED" || state === "STOPPED" ? ["start", "delete"]
        : ["delete"];

    const relationships = [
        { kind: "Zone", label: vm.zone },
        { kind: "VM Instance", label: vm.name }
    ];

    return (

        <>

            <CloudServiceBreadcrumbs items={[{ label: "Compute Engine", onClick: onBack }, { label: vm.name }]} />

            <div className="card cloud-service-detail-page-header">

                <div className="cloud-service-detail-page-header-main">

                    <div>
                        <h1 style={{ margin: "2px 0" }}>{vm.name}</h1>
                        <p className="field-hint" style={{ margin: 0 }}>{vm.zone}</p>
                        <div style={{ marginTop: "8px" }}><StateBadge state={vm.status} /></div>
                    </div>

                </div>

                <div className="cloud-service-detail-page-header-actions">

                    {actioning ? (

                        <span className="field-hint">Working...</span>

                    ) : (

                        <>
                            {actions.includes("start") && (
                                <button type="button" className="btn btn-success" onClick={() => runAction(startGcpVm, "Start")}>Start</button>
                            )}
                            {actions.includes("stop") && (
                                <button type="button" className="btn btn-secondary" onClick={() => runAction(stopGcpVm, "Stop")}>Stop</button>
                            )}
                            {actions.includes("reset") && (
                                <button type="button" className="btn btn-secondary" onClick={() => runAction(resetGcpVm, "Reset")}>Restart</button>
                            )}
                            {actions.includes("delete") && (
                                <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>Delete</button>
                            )}
                        </>

                    )}

                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Overview</h3>

                <div className="cloud-service-connection-grid">
                    <div><p className="field-hint" style={{ margin: 0 }}>Zone</p><p>{vm.zone}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Machine Type</p><p>{vm.machineType}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Public IPv4</p><p>{vm.publicIp || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Private IPv4</p><p>{vm.privateIp || "—"}</p></div>
                </div>

                {Object.keys(vm.labels || {}).length > 0 && (

                    <>
                        <h4 className="settings-subhead" style={{ marginTop: "16px" }}>Labels</h4>
                        <div className="button-row">
                            {Object.entries(vm.labels).map(([k, v]) => (
                                <span key={k} className="badge badge-secondary">{k}: {v}</span>
                            ))}
                        </div>
                    </>

                )}

            </div>

            <ConnectionInfoCard publicIp={vm.publicIp} os="" usernameHint="your GCP SSH username" />

            <FirewallRulesCard rules={firewall} loading={!firewall} onAdd={handleAddRule} onRemove={handleRemoveRule} />

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
                                <LineChart points={series.points} unit={series.unit === "%" ? "%" : ""} />
                            </div>
                        ))}
                    </div>

                )}

            </div>

            <div className="card">
                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Logs</h3>
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Per-VM log tailing isn't wired up here yet - see Cloud Monitoring (Observability
                    sidebar) for this project's alert policies and uptime checks.
                </p>
            </div>

            <RelationshipDiagram items={relationships} />

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Audit History</h3>

                {!audit ? (
                    <p className="empty-state">Loading...</p>
                ) : audit.length === 0 ? (
                    <p className="empty-state" style={{ textAlign: "left" }}>No recent actions recorded for this instance.</p>
                ) : (
                    <ul className="cloud-service-detail-list">
                        {audit.map((entry, index) => (
                            <li key={index}>
                                <span className="field-hint">{new Date(entry.timestamp).toLocaleString()}</span> — {entry.message}
                            </li>
                        ))}
                    </ul>
                )}

            </div>

            <TypedConfirmDialog
                open={deleteOpen}
                title="Delete instance?"
                message={<>This permanently deletes <strong>{vm.name}</strong>. This cannot be undone.</>}
                resourceName={vm.name}
                confirmLabel="Delete Instance"
                loading={deleting}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteOpen(false)}
            />

        </>

    );

}

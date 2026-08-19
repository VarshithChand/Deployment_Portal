import { useEffect, useState } from "react";

import {
    getAzureVmDetail, getAzureVmFirewall, addAzureVmFirewallRule, removeAzureVmFirewallRule, getAzureVmMetrics,
    getResourceAuditHistory, startAzureVm, stopAzureVm, restartAzureVm, deleteAzureVm
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

// Azure has no OS-implied default username the way AWS AMIs do - whoever
// created this VM chose the admin username themselves (see
// AzureVmManagementPage's own Create VM form). Nothing here to guess from
// the API, so ConnectionInfoCard's username field is left for the visitor
// to fill in from what they remember setting.

export default function AzureVmDetailPage({ resourceGroup, vmName, onBack }) {

    const toast = useToast();

    const [detail, setDetail] = useState(null);
    const [firewall, setFirewall] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [audit, setAudit] = useState(null);
    const [range, setRange] = useState("1h");
    const [actioning, setActioning] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    function loadDetail() {

        getAzureVmDetail(resourceGroup, vmName).then((data) => {
            setDetail(data);
            getAzureVmFirewall(resourceGroup, vmName, data.nsgId).then(setFirewall).catch((err) => console.error(err));
        }).catch((err) => {
            console.error(err);
            setDetail({ configured: false, error: "Unable to reach the Deployment API." });
        });

    }

    function loadAudit() {
        getResourceAuditHistory(vmName).then(setAudit).catch((err) => console.error(err));
    }

    useEffect(() => {
        loadDetail();
        loadAudit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resourceGroup, vmName]);

    useEffect(() => {

        getAzureVmMetrics(resourceGroup, vmName, RANGE_MINUTES[range]).then(setMetrics).catch((err) => console.error(err));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resourceGroup, vmName, range]);

    async function runAction(actionFn, label) {

        setActioning(true);

        try {

            const result = await actionFn(resourceGroup, vmName);

            if (result.success) toast.show(result.message || `${label} requested.`, "success");
            else toast.show(result.error || `Unable to ${label.toLowerCase()} that VM.`, "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || `Unable to ${label.toLowerCase()} that VM.`, "error");
        }
        finally {
            setActioning(false);
            loadDetail();
        }

    }

    async function handleDeleteConfirm() {

        setDeleting(true);

        try {
            await runAction(deleteAzureVm, "Delete");
        }
        finally {
            setDeleting(false);
            setDeleteOpen(false);
        }

    }

    async function handleAddRule(rule) {

        const result = await addAzureVmFirewallRule(resourceGroup, vmName, rule, detail?.nsgId);

        if (result.success) toast.show("Rule added.", "success");
        else toast.show(result.error || "Unable to add that rule.", "error");

        loadDetail();

    }

    async function handleRemoveRule(rule) {

        const result = await removeAzureVmFirewallRule(resourceGroup, vmName, rule.id, detail?.nsgId);

        if (result.success) toast.show("Rule removed.", "success");
        else toast.show(result.error || "Unable to remove that rule.", "error");

        loadDetail();

    }

    if (!detail) {
        return <p className="empty-state">Loading VM detail...</p>;
    }

    if (detail.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load this VM.</p>
                <p className="field-hint">{detail.error}</p>
                <button type="button" className="btn btn-secondary" onClick={loadDetail}>Retry</button>
            </div>
        );

    }

    const state = (detail.powerState || "").toLowerCase();
    const actions = state === "running" ? ["stop", "restart", "delete"]
        : state === "deallocated" || state === "stopped" ? ["start", "delete"]
        : ["delete"];

    const relationships = [
        detail.vNetId && { kind: "Virtual Network", label: detail.vNetId.split("/").pop() },
        detail.subnetId && { kind: "Subnet", label: detail.subnetId.split("/").pop() },
        detail.nsgId && { kind: "Network Security Group", label: detail.nsgId.split("/").pop() },
        { kind: "Virtual Machine", label: detail.name }
    ].filter(Boolean);

    return (

        <>

            <CloudServiceBreadcrumbs items={[{ label: "Virtual Machines", onClick: onBack }, { label: detail.name }]} />

            <div className="card cloud-service-detail-page-header">

                <div className="cloud-service-detail-page-header-main">

                    <div>
                        <h1 style={{ margin: "2px 0" }}>{detail.name}</h1>
                        <p className="field-hint" style={{ margin: 0 }}>{detail.resourceGroup}</p>
                        <div style={{ marginTop: "8px" }}><StateBadge state={detail.powerState} /></div>
                    </div>

                </div>

                <div className="cloud-service-detail-page-header-actions">

                    {actioning ? (

                        <span className="field-hint">Working...</span>

                    ) : (

                        <>
                            {actions.includes("start") && (
                                <button type="button" className="btn btn-success" onClick={() => runAction(startAzureVm, "Start")}>Start</button>
                            )}
                            {actions.includes("stop") && (
                                <button type="button" className="btn btn-secondary" onClick={() => runAction(stopAzureVm, "Stop")}>Stop</button>
                            )}
                            {actions.includes("restart") && (
                                <button type="button" className="btn btn-secondary" onClick={() => runAction(restartAzureVm, "Restart")}>Restart</button>
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
                    <div><p className="field-hint" style={{ margin: 0 }}>Location</p><p>{detail.location}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Size</p><p>{detail.size}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>OS</p><p>{detail.osType || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Public IPv4</p><p>{detail.publicIp || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Private IPv4</p><p>{detail.privateIp || "—"}</p></div>
                </div>

                {Object.keys(detail.tags || {}).length > 0 && (

                    <>
                        <h4 className="settings-subhead" style={{ marginTop: "16px" }}>Tags</h4>
                        <div className="button-row">
                            {Object.entries(detail.tags).map(([k, v]) => (
                                <span key={k} className="badge badge-secondary">{k}: {v}</span>
                            ))}
                        </div>
                    </>

                )}

            </div>

            <ConnectionInfoCard publicIp={detail.publicIp} os={detail.osType} usernameHint="the admin username you set at creation" />

            <FirewallRulesCard rules={firewall} loading={!firewall} onAdd={detail.nsgId ? handleAddRule : null} onRemove={detail.nsgId ? handleRemoveRule : null} />

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
                                <LineChart points={series.points} unit={series.unit === "Percent" ? "%" : ""} />
                            </div>
                        ))}
                    </div>

                )}

            </div>

            <div className="card">
                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Logs</h3>
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Per-VM log tailing isn't wired up here yet - see Azure Monitor (Observability sidebar)
                    for this subscription's Log Analytics workspaces.
                </p>
            </div>

            <RelationshipDiagram items={relationships} />

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Audit History</h3>

                {!audit ? (
                    <p className="empty-state">Loading...</p>
                ) : audit.length === 0 ? (
                    <p className="empty-state" style={{ textAlign: "left" }}>No recent actions recorded for this VM.</p>
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
                title="Delete virtual machine?"
                message={<>This permanently deletes <strong>{detail.name}</strong>. This cannot be undone.</>}
                resourceName={detail.name}
                confirmLabel="Delete Instance"
                loading={deleting}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteOpen(false)}
            />

        </>

    );

}

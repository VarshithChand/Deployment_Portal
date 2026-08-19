import { useEffect, useState } from "react";

import {
    getEc2InstanceDetail, getEc2Firewall, addEc2FirewallRule, removeEc2FirewallRule, getEc2Metrics,
    getResourceAuditHistory, startEc2Instance, stopEc2Instance, rebootEc2Instance, terminateEc2Instance
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

// Amazon Linux/RHEL/CentOS default to ec2-user; Ubuntu/Debian images use
// their own distro username instead - a best-effort guess from the OS
// string the instance itself reports, not something this app can know
// for certain (a custom AMI can set anything). Surfaced with a disclaimer
// in ConnectionInfoCard, not presented as authoritative.
function guessSshUsername(os) {

    const value = (os || "").toLowerCase();

    if (value.includes("ubuntu")) return "ubuntu";
    if (value.includes("debian")) return "admin";
    if (value.includes("suse")) return "ec2-user";

    return "ec2-user";

}

export default function Ec2InstanceDetailPage({ instanceId, region, onBack }) {

    const toast = useToast();

    const [detail, setDetail] = useState(null);
    const [firewall, setFirewall] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [audit, setAudit] = useState(null);
    const [range, setRange] = useState("1h");
    const [actioning, setActioning] = useState(false);
    const [terminateOpen, setTerminateOpen] = useState(false);
    const [terminating, setTerminating] = useState(false);

    function loadDetail() {
        getEc2InstanceDetail(instanceId, region).then(setDetail).catch((err) => {
            console.error(err);
            setDetail({ configured: false, error: "Unable to reach the Deployment API." });
        });
    }

    function loadFirewall() {
        getEc2Firewall(instanceId, region).then(setFirewall).catch((err) => console.error(err));
    }

    function loadAudit() {
        getResourceAuditHistory(instanceId).then(setAudit).catch((err) => console.error(err));
    }

    useEffect(() => {
        loadDetail();
        loadFirewall();
        loadAudit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instanceId, region]);

    useEffect(() => {

        getEc2Metrics(instanceId, RANGE_MINUTES[range], region).then(setMetrics).catch((err) => console.error(err));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instanceId, region, range]);

    async function runAction(actionFn, label) {

        setActioning(true);

        try {

            const result = await actionFn(instanceId);

            if (result.success) toast.show(result.message || `${label} requested.`, "success");
            else toast.show(result.error || `Unable to ${label.toLowerCase()} that instance.`, "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || `Unable to ${label.toLowerCase()} that instance.`, "error");
        }
        finally {
            setActioning(false);
            loadDetail();
        }

    }

    async function handleTerminateConfirm() {

        setTerminating(true);

        try {
            await runAction(terminateEc2Instance, "Terminate");
        }
        finally {
            setTerminating(false);
            setTerminateOpen(false);
        }

    }

    async function handleAddRule(rule) {

        const result = await addEc2FirewallRule(instanceId, rule, region);

        if (result.success) toast.show("Rule added.", "success");
        else toast.show(result.error || "Unable to add that rule.", "error");

        loadFirewall();

    }

    async function handleRemoveRule(rule) {

        const result = await removeEc2FirewallRule(instanceId, rule, region);

        if (result.success) toast.show("Rule removed.", "success");
        else toast.show(result.error || "Unable to remove that rule.", "error");

        loadFirewall();

    }

    if (!detail) {
        return <p className="empty-state">Loading instance detail...</p>;
    }

    if (detail.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load this instance.</p>
                <p className="field-hint">{detail.error}</p>
                <button type="button" className="btn btn-secondary" onClick={loadDetail}>Retry</button>
            </div>
        );

    }

    const state = (detail.state || "").toLowerCase();
    const actions = state === "running" ? ["stop", "reboot", "terminate"]
        : state === "stopped" ? ["start", "terminate"]
        : ["terminate"];

    const relationships = [
        detail.vpcId && { kind: "VPC", label: detail.vpcId },
        detail.subnetId && { kind: "Subnet", label: detail.subnetId },
        ...(detail.securityGroupIds || []).map((id) => ({ kind: "Security Group", label: id })),
        { kind: "EC2 Instance", label: detail.instanceId }
    ].filter(Boolean);

    return (

        <>

            <CloudServiceBreadcrumbs items={[{ label: "EC2 Instances", onClick: onBack }, { label: detail.name || instanceId }]} />

            <div className="card cloud-service-detail-page-header">

                <div className="cloud-service-detail-page-header-main">

                    <div>
                        <h1 style={{ margin: "2px 0" }}>{detail.name || detail.instanceId}</h1>
                        <p className="field-hint" style={{ margin: 0 }}>{detail.instanceId}</p>
                        <div style={{ marginTop: "8px" }}><StateBadge state={detail.state} /></div>
                    </div>

                </div>

                <div className="cloud-service-detail-page-header-actions">

                    {actioning ? (

                        <span className="field-hint">Working...</span>

                    ) : (

                        <>
                            {actions.includes("start") && (
                                <button type="button" className="btn btn-success" onClick={() => runAction(startEc2Instance, "Start")}>Start</button>
                            )}
                            {actions.includes("stop") && (
                                <button type="button" className="btn btn-secondary" onClick={() => runAction(stopEc2Instance, "Stop")}>Stop</button>
                            )}
                            {actions.includes("reboot") && (
                                <button type="button" className="btn btn-secondary" onClick={() => runAction(rebootEc2Instance, "Reboot")}>Restart</button>
                            )}
                            {actions.includes("terminate") && (
                                <button type="button" className="btn btn-danger" onClick={() => setTerminateOpen(true)}>Delete</button>
                            )}
                        </>

                    )}

                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Overview</h3>

                <div className="cloud-service-connection-grid">
                    <div><p className="field-hint" style={{ margin: 0 }}>Region</p><p>{detail.region}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Availability Zone</p><p>{detail.availabilityZone || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Instance Type</p><p>{detail.instanceType}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>OS</p><p>{detail.os || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Launched</p><p>{detail.launchTime ? new Date(detail.launchTime).toLocaleString() : "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Public IPv4</p><p>{detail.publicIp || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Private IPv4</p><p>{detail.privateIp || "—"}</p></div>
                    {detail.publicIpv6 && <div><p className="field-hint" style={{ margin: 0 }}>Public IPv6</p><p>{detail.publicIpv6}</p></div>}
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

            <ConnectionInfoCard publicIp={detail.publicIp} os={detail.os} usernameHint={guessSshUsername(detail.os)} />

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
                    Per-instance log tailing isn't wired up for EC2 yet - see CloudWatch (Observability
                    sidebar) for this account's log groups.
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
                open={terminateOpen}
                title="Delete instance?"
                message={<>This permanently deletes <strong>{detail.name || detail.instanceId}</strong>. This cannot be undone.</>}
                resourceName={detail.instanceId}
                confirmLabel="Delete Instance"
                loading={terminating}
                onConfirm={handleTerminateConfirm}
                onCancel={() => setTerminateOpen(false)}
            />

        </>

    );

}

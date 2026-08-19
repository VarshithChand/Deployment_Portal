import { useState } from "react";

import ConfirmDialog from "../ConfirmDialog";

// Section 7's port/firewall management, section 8's provider mapping -
// one component rendering AWS security-group rules, Azure NSG rules, and
// GCP VPC firewall rules identically (they're normalized to the same
// SecurityRuleDto shape server-side - see InfrastructureDetailDtos.cs).
// `scope` distinguishes "instance" (AWS/Azure - these rules belong to
// this one resource) from "network" (GCP - these rules apply to the
// whole VPC, not just the VM they were looked up from) and is surfaced
// honestly rather than pretending GCP's model matches AWS/Azure's.

const SENSITIVE_PORTS = new Set([22, 3389, 5432, 3306, 6379, 9200]);
const OPEN_CIDRS = new Set(["0.0.0.0/0", "::/0"]);

function isDangerous(fromPort, toPort, cidr) {
    const portDangerous = [fromPort, toPort].some((p) => SENSITIVE_PORTS.has(Number(p)));
    const openToWorld = OPEN_CIDRS.has((cidr || "").trim());
    return portDangerous || openToWorld;
}

function dangerReason(fromPort, toPort, cidr) {
    const reasons = [];

    if ([fromPort, toPort].some((p) => SENSITIVE_PORTS.has(Number(p))))
        reasons.push(`port ${fromPort === toPort ? fromPort : `${fromPort}-${toPort}`} is commonly targeted (SSH/RDP/database/cache access)`);

    if (OPEN_CIDRS.has((cidr || "").trim()))
        reasons.push("the source is open to the entire internet (0.0.0.0/0)");

    return reasons.join(" and ");
}

function RuleTable({ rules, direction, canRemove, onRemoveRequest }) {

    if (rules.length === 0) {
        return <p className="empty-state" style={{ textAlign: "left" }}>No {direction.toLowerCase()} rules.</p>;
    }

    return (

        <div className="table-scroll">

            <table className="table">

                <thead>
                    <tr>
                        <th>Protocol</th>
                        <th>Port</th>
                        <th>{direction === "Inbound" ? "Source" : "Destination"}</th>
                        <th>Description</th>
                        {canRemove && <th>Actions</th>}
                    </tr>
                </thead>

                <tbody>

                    {rules.map((rule, index) => {

                        const portLabel = rule.fromPort == null ? "All"
                            : rule.fromPort === rule.toPort ? rule.fromPort : `${rule.fromPort}-${rule.toPort}`;

                        const dangerous = isDangerous(rule.fromPort, rule.toPort, rule.cidr);

                        return (

                            <tr key={rule.id || `${rule.protocol}-${rule.fromPort}-${rule.toPort}-${rule.cidr}-${index}`}>
                                <td>{rule.protocol?.toUpperCase() || "—"}</td>
                                <td>{portLabel}</td>
                                <td>
                                    {rule.cidr}
                                    {dangerous && <span className="badge badge-warning" style={{ marginLeft: "6px" }}>Exposed</span>}
                                </td>
                                <td className="field-hint">{rule.description || "—"}</td>
                                {canRemove && (
                                    <td>
                                        <button type="button" className="btn btn-sm btn-danger" onClick={() => onRemoveRequest(rule, direction)}>
                                            Remove
                                        </button>
                                    </td>
                                )}
                            </tr>

                        );

                    })}

                </tbody>

            </table>

        </div>

    );

}

const EMPTY_FORM = { direction: "Inbound", protocol: "tcp", fromPort: "", toPort: "", cidr: "", description: "" };

export default function FirewallRulesCard({ rules, loading, onAdd, onRemove }) {

    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [pendingAdd, setPendingAdd] = useState(null);
    const [pendingRemove, setPendingRemove] = useState(null);

    function setField(key, value) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function buildRule() {

        const fromPort = Number(form.fromPort);
        const toPort = form.toPort === "" ? fromPort : Number(form.toPort);

        return {
            direction: form.direction,
            protocol: form.protocol,
            fromPort,
            toPort,
            cidr: form.cidr.trim(),
            description: form.description.trim() || null
        };

    }

    function handleSubmit(e) {

        e.preventDefault();

        const rule = buildRule();

        if (!rule.cidr || Number.isNaN(rule.fromPort)) {
            return;
        }

        if (isDangerous(rule.fromPort, rule.toPort, rule.cidr)) {
            setPendingAdd(rule);
        }
        else {
            confirmAdd(rule);
        }

    }

    async function confirmAdd(rule) {

        setSubmitting(true);

        try {
            await onAdd(rule);
            setForm(EMPTY_FORM);
        }
        finally {
            setSubmitting(false);
            setPendingAdd(null);
        }

    }

    async function confirmRemove() {

        if (!pendingRemove) return;

        setSubmitting(true);

        try {
            await onRemove(pendingRemove.rule, pendingRemove.direction);
        }
        finally {
            setSubmitting(false);
            setPendingRemove(null);
        }

    }

    const scope = rules?.scope || "instance";
    const canRemove = !!onRemove;

    return (

        <div className="card">

            <h3 className="settings-subhead" style={{ marginTop: 0 }}>Networking</h3>

            {scope === "network" && (
                <p className="field-hint field-hint-bad" style={{ marginBottom: "12px" }}>
                    These are VPC-wide firewall rules, not rules attached to just this VM - changes here
                    affect every instance on the network.
                </p>
            )}

            {loading ? (

                <p className="empty-state">Loading firewall rules...</p>

            ) : rules?.error ? (

                <p className="error-message">{rules.error}</p>

            ) : (

                <>

                    <h4 className="settings-subhead" style={{ marginTop: 0 }}>Inbound</h4>
                    <RuleTable
                        rules={rules?.inbound || []}
                        direction="Inbound"
                        canRemove={canRemove}
                        onRemoveRequest={(rule, direction) => setPendingRemove({ rule, direction })}
                    />

                    <h4 className="settings-subhead" style={{ marginTop: "20px" }}>Outbound</h4>
                    <RuleTable
                        rules={rules?.outbound || []}
                        direction="Outbound"
                        canRemove={canRemove}
                        onRemoveRequest={(rule, direction) => setPendingRemove({ rule, direction })}
                    />

                    {onAdd && (

                        <>

                            <h4 className="settings-subhead" style={{ marginTop: "24px" }}>Add Rule</h4>

                            <form onSubmit={handleSubmit}>

                                <div className="cloud-service-firewall-form-grid">

                                    <div className="form-group">
                                        <label>Direction</label>
                                        <select className="form-control" value={form.direction} onChange={(e) => setField("direction", e.target.value)}>
                                            <option value="Inbound">Inbound</option>
                                            <option value="Outbound">Outbound</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Protocol</label>
                                        <select className="form-control" value={form.protocol} onChange={(e) => setField("protocol", e.target.value)}>
                                            <option value="tcp">TCP</option>
                                            <option value="udp">UDP</option>
                                            <option value="icmp">ICMP</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Port</label>
                                        <input
                                            type="number" className="form-control" value={form.fromPort}
                                            onChange={(e) => setField("fromPort", e.target.value)}
                                            placeholder="22" required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Port range end (optional)</label>
                                        <input
                                            type="number" className="form-control" value={form.toPort}
                                            onChange={(e) => setField("toPort", e.target.value)}
                                            placeholder="Same as port"
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>{form.direction === "Inbound" ? "Source" : "Destination"} (CIDR)</label>
                                        <input
                                            type="text" className="form-control" value={form.cidr}
                                            onChange={(e) => setField("cidr", e.target.value)}
                                            placeholder="e.g. 203.0.113.4/32 (your IP) - not 0.0.0.0/0 unless you mean it"
                                            required
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Description (optional)</label>
                                        <input
                                            type="text" className="form-control" value={form.description}
                                            onChange={(e) => setField("description", e.target.value)}
                                        />
                                    </div>

                                </div>

                                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                                    {submitting ? "Adding..." : "Add Rule"}
                                </button>

                            </form>

                        </>

                    )}

                </>

            )}

            <ConfirmDialog
                open={!!pendingAdd}
                title="Open this port?"
                message={pendingAdd ? (
                    <>
                        This exposes {pendingAdd.protocol.toUpperCase()} {pendingAdd.fromPort === pendingAdd.toPort ? pendingAdd.fromPort : `${pendingAdd.fromPort}-${pendingAdd.toPort}`} to <strong>{pendingAdd.cidr}</strong> —
                        {" "}{dangerReason(pendingAdd.fromPort, pendingAdd.toPort, pendingAdd.cidr)}.
                        Consider restricting the source to your own IP instead.
                    </>
                ) : ""}
                confirmLabel="Add Anyway"
                danger
                onConfirm={() => confirmAdd(pendingAdd)}
                onCancel={() => setPendingAdd(null)}
            />

            <ConfirmDialog
                open={!!pendingRemove}
                title="Remove firewall rule?"
                message={pendingRemove ? `This removes the ${pendingRemove.direction.toLowerCase()} rule for ${pendingRemove.rule.cidr}.` : ""}
                confirmLabel="Remove"
                danger
                onConfirm={confirmRemove}
                onCancel={() => setPendingRemove(null)}
            />

        </div>

    );

}

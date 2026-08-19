import { useEffect, useState } from "react";

import { getMyAwsEc2Detail } from "../../services/settingsService";
import { startEc2Instance, stopEc2Instance, rebootEc2Instance, terminateEc2Instance } from "../../services/cloudServicesService";
import usePagination from "../../hooks/usePagination";
import useToast from "../../hooks/useToast";
import Pagination from "../common/Pagination";
import SearchBox from "../common/SearchBox";
import StateBadge from "./StateBadge";
import TypedConfirmDialog from "./TypedConfirmDialog";
import Ec2InstanceDetailPage from "./Ec2InstanceDetailPage";

const PAGE_SIZE = 10;

// Section 9: only the actions valid for the instance's current state.
function actionsForState(state) {

    switch (state) {
        case "running": return ["stop", "reboot", "terminate"];
        case "stopped": return ["start", "terminate"];
        case "pending": case "stopping": case "shutting-down": return [];
        default: return ["terminate"];
    }

}

export default function Ec2ManagementPage({ refreshToken }) {

    const toast = useToast();

    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [actioningId, setActioningId] = useState(null);
    const [terminateTarget, setTerminateTarget] = useState(null);
    const [terminating, setTerminating] = useState(false);
    const [selectedInstance, setSelectedInstance] = useState(null);

    async function load() {

        setLoading(true);

        try {
            setDetail(await getMyAwsEc2Detail());
        }
        catch (err) {
            console.error(err);
            setDetail({ configured: false, error: "Unable to reach the Deployment API." });
        }
        finally {
            setLoading(false);
        }

    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshToken]);

    const instances = detail?.instances || [];

    const filtered = instances.filter((i) => {

        const q = search.trim().toLowerCase();

        if (!q) return true;

        return [i.name, i.instanceId, i.privateIp, i.publicIp]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q));

    });

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } =
        usePagination(filtered, PAGE_SIZE);

    useEffect(() => {
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    // Never claims the new state itself (section 25) - it shows the
    // action's own accept/reject, then re-fetches the real state from AWS
    // regardless of which happened.
    async function runAction(instanceId, actionFn, label) {

        setActioningId(instanceId);

        try {

            const result = await actionFn(instanceId);

            if (result.success) {
                toast.show(result.message || `${label} requested.`, "success");
            }
            else if (/access.?denied/i.test(result.error || "")) {
                toast.show("Permission denied — your AWS IAM identity does not have permission to perform this operation.", "error");
            }
            else {
                toast.show(result.error || `Unable to ${label.toLowerCase()} that instance.`, "error");
            }

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || `Unable to ${label.toLowerCase()} that instance.`, "error");

        }
        finally {

            setActioningId(null);
            load();

        }

    }

    async function handleTerminateConfirm() {

        const target = terminateTarget;

        if (!target) return;

        setTerminating(true);

        try {
            await runAction(target.instanceId, terminateEc2Instance, "Terminate");
        }
        finally {
            setTerminating(false);
            setTerminateTarget(null);
        }

    }

    if (selectedInstance) {

        return (
            <Ec2InstanceDetailPage
                instanceId={selectedInstance.instanceId}
                region={null}
                onBack={() => { setSelectedInstance(null); load(); }}
            />
        );

    }

    if (loading) {

        return (
            <div className="card">
                <p className="empty-state">Loading AWS resources...</p>
            </div>
        );

    }

    if (!detail?.configured) {

        return (
            <div className="card">
                <p className="empty-state" style={{ textAlign: "left" }}>
                    Enter your AWS credentials in Settings → Credentials → AWS to manage EC2 instances.
                </p>
            </div>
        );

    }

    if (detail.error) {

        return (

            <div className="card">

                <p className="error-message">Unable to load EC2 resources.</p>

                <p className="field-hint">
                    {detail.error} — check your AWS credentials, region, permissions, or connectivity.
                </p>

                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>

            </div>

        );

    }

    const otherCount = instances.length - detail.runningCount - detail.stoppedCount;

    return (

        <>

            <div className="cloud-service-stat-grid">

                <div className="cloud-service-stat-tile">
                    <span>Total</span>
                    <strong>{instances.length}</strong>
                </div>

                <div className="cloud-service-stat-tile">
                    <span>Running</span>
                    <strong>{detail.runningCount}</strong>
                </div>

                <div className="cloud-service-stat-tile">
                    <span>Stopped</span>
                    <strong>{detail.stoppedCount}</strong>
                </div>

                <div className="cloud-service-stat-tile">
                    <span>Other</span>
                    <strong>{otherCount}</strong>
                </div>

            </div>

            <div className="card">

                <h2 className="card-title">EC2 Instances</h2>

                <SearchBox
                    placeholder="Search instance ID, name, or IP..."
                    value={search}
                    onChange={setSearch}
                />

                {filtered.length === 0 ? (

                    <p className="empty-state">No EC2 instances found.</p>

                ) : (

                    <>

                        <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Instance ID</th>
                                        <th>Name</th>
                                        <th>State</th>
                                        <th>Type</th>
                                        <th>Private IP</th>
                                        <th>Public IP</th>
                                        <th>AZ</th>
                                        <th>Launched</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {pageItems.map((i) => {

                                        const actions = actionsForState(i.state);
                                        const busy = actioningId === i.instanceId;

                                        return (

                                            <tr key={i.instanceId} className="table-row-clickable" onClick={() => setSelectedInstance(i)}>
                                                <td className="smoke-test-metric-mono">{i.instanceId}</td>
                                                <td>{i.name}</td>
                                                <td><StateBadge state={i.state} /></td>
                                                <td>{i.instanceType}</td>
                                                <td>{i.privateIp || "—"}</td>
                                                <td>{i.publicIp || "—"}</td>
                                                <td>{i.availabilityZone || "—"}</td>
                                                <td>{i.launchTime ? new Date(i.launchTime).toLocaleString() : "—"}</td>
                                                <td onClick={(e) => e.stopPropagation()}>

                                                    {busy ? (

                                                        <span className="field-hint">Working...</span>

                                                    ) : actions.length === 0 ? (

                                                        <span className="field-hint">—</span>

                                                    ) : (

                                                        <div className="button-row" style={{ margin: 0 }}>

                                                            {actions.includes("start") && (
                                                                <button type="button" className="btn btn-sm btn-success" onClick={() => runAction(i.instanceId, startEc2Instance, "Start")}>
                                                                    Start
                                                                </button>
                                                            )}

                                                            {actions.includes("stop") && (
                                                                <button type="button" className="btn btn-sm btn-secondary" onClick={() => runAction(i.instanceId, stopEc2Instance, "Stop")}>
                                                                    Stop
                                                                </button>
                                                            )}

                                                            {actions.includes("reboot") && (
                                                                <button type="button" className="btn btn-sm btn-secondary" onClick={() => runAction(i.instanceId, rebootEc2Instance, "Reboot")}>
                                                                    Reboot
                                                                </button>
                                                            )}

                                                            {actions.includes("terminate") && (
                                                                <button type="button" className="btn btn-sm btn-danger" onClick={() => setTerminateTarget(i)}>
                                                                    Terminate
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
                Creating a new instance isn't implemented in the Deployment Portal yet — it needs AMI,
                instance type, key pair, security group, subnet, IAM role, and storage configuration.
                Use <strong>Open AWS Console</strong> above for that.
            </p>

            <TypedConfirmDialog
                open={!!terminateTarget}
                title="Terminate instance?"
                message={(
                    <>
                        This permanently deletes <strong>{terminateTarget?.instanceId}</strong>
                        {terminateTarget?.name ? ` (${terminateTarget.name})` : ""}. This cannot be undone.
                    </>
                )}
                resourceName={terminateTarget?.instanceId}
                confirmLabel="Terminate"
                loading={terminating}
                onConfirm={handleTerminateConfirm}
                onCancel={() => setTerminateTarget(null)}
            />

        </>

    );

}

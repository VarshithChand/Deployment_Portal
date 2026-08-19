import { useEffect, useState } from "react";

import {
    getEbEnvironmentDetail, getEbApplicationVersions, deployEbVersion, restartEbAppServer,
    rebuildEbEnvironment, scaleEbEnvironment, updateEbEnvironmentVariable, getEbEnvironmentEvents,
    getEbEnvironmentMetrics, terminateEbEnvironment
} from "../../services/elasticBeanstalkService";
import useToast from "../../hooks/useToast";
import CloudServiceBreadcrumbs from "../cloudServices/CloudServiceBreadcrumbs";
import StateBadge from "../cloudServices/StateBadge";
import TypedConfirmDialog from "../cloudServices/TypedConfirmDialog";
import ConfirmDialog from "../ConfirmDialog";
import RelationshipDiagram from "../cloudServices/RelationshipDiagram";
import RangeSelector from "../hosting-observability/RangeSelector";
import LineChart from "../charts/LineChart";

const RANGE_MINUTES = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440, "7d": 10080 };
const QUICK_COUNTS = [0, 1, 2, 5, 10];

// Section 7's Elastic Beanstalk detail - environments + application
// versions, NOT Azure-style slots (this app doesn't fake one for EB -
// Restart/Rebuild are EB's own real, distinct operations).
export default function ElasticBeanstalkEnvironmentDetailPage({ environmentName, onBack }) {

    const toast = useToast();

    const [detail, setDetail] = useState(null);
    const [versions, setVersions] = useState(null);
    const [events, setEvents] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [range, setRange] = useState("1h");

    const [actioning, setActioning] = useState(false);
    const [deployTarget, setDeployTarget] = useState(null);
    const [deploying, setDeploying] = useState(false);
    const [rebuildOpen, setRebuildOpen] = useState(false);
    const [rebuilding, setRebuilding] = useState(false);

    const [minSize, setMinSize] = useState("");
    const [maxSize, setMaxSize] = useState("");
    const [scaling, setScaling] = useState(false);

    const [varForm, setVarForm] = useState({ name: "", value: "" });
    const [savingVar, setSavingVar] = useState(false);
    const [removeVarTarget, setRemoveVarTarget] = useState(null);
    const [removingVar, setRemovingVar] = useState(false);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    function load() {

        getEbEnvironmentDetail(environmentName).then((data) => {

            setDetail(data);

            if (data.minSize != null) setMinSize(String(data.minSize));
            if (data.maxSize != null) setMaxSize(String(data.maxSize));

            if (data.environment?.applicationName) {
                getEbApplicationVersions(data.environment.applicationName).then(setVersions).catch((err) => console.error(err));
            }

        }).catch((err) => {
            console.error(err);
            setDetail({ configured: false, error: "Unable to reach the Deployment API." });
        });

        getEbEnvironmentEvents(environmentName).then(setEvents).catch((err) => console.error(err));

    }

    useEffect(load, [environmentName]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {

        if (!detail?.autoScalingGroupName) return;

        getEbEnvironmentMetrics(environmentName, detail.autoScalingGroupName, RANGE_MINUTES[range])
            .then(setMetrics).catch((err) => console.error(err));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [environmentName, detail?.autoScalingGroupName, range]);

    async function runAction(actionFn, label) {

        setActioning(true);

        try {

            const result = await actionFn(environmentName);

            if (result.success) toast.show(result.message || `${label} requested.`, "success");
            else toast.show(result.error || `Unable to ${label.toLowerCase()} that environment.`, "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || `Unable to ${label.toLowerCase()} that environment.`, "error");
        }
        finally {
            setActioning(false);
            load();
        }

    }

    async function handleDeployConfirm() {

        setDeploying(true);

        try {

            const result = await deployEbVersion(environmentName, deployTarget.versionLabel);

            if (result.success) toast.show(result.message || "Deploy requested.", "success");
            else toast.show(result.error || "Unable to deploy that version.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to deploy that version.", "error");
        }
        finally {
            setDeploying(false);
            setDeployTarget(null);
            load();
        }

    }

    async function handleRebuildConfirm() {

        setRebuilding(true);

        try {
            await runAction(rebuildEbEnvironment, "Rebuild");
        }
        finally {
            setRebuilding(false);
            setRebuildOpen(false);
        }

    }

    async function handleScale() {

        setScaling(true);

        try {

            const result = await scaleEbEnvironment(environmentName, Number(minSize), Number(maxSize));

            if (result.success) toast.show(result.message || "Scale requested.", "success");
            else toast.show(result.error || "Unable to scale that environment.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to scale that environment.", "error");
        }
        finally {
            setScaling(false);
            load();
        }

    }

    async function handleAddVariable(e) {

        e.preventDefault();

        if (!varForm.name.trim()) return;

        setSavingVar(true);

        try {

            const result = await updateEbEnvironmentVariable(environmentName, varForm.name.trim(), varForm.value);

            if (result.success) {
                toast.show("Variable saved.", "success");
                setVarForm({ name: "", value: "" });
            }
            else {
                toast.show(result.error || "Unable to save that variable.", "error");
            }

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to save that variable.", "error");
        }
        finally {
            setSavingVar(false);
            load();
        }

    }

    async function handleRemoveVariableConfirm() {

        setRemovingVar(true);

        try {

            const result = await updateEbEnvironmentVariable(environmentName, removeVarTarget, null);

            if (result.success) toast.show("Variable removed.", "success");
            else toast.show(result.error || "Unable to remove that variable.", "error");

        }
        catch (err) {
            console.error(err);
            toast.show(err.response?.data?.message || "Unable to remove that variable.", "error");
        }
        finally {
            setRemovingVar(false);
            setRemoveVarTarget(null);
            load();
        }

    }

    async function handleDeleteConfirm() {

        setDeleting(true);

        try {
            await runAction(terminateEbEnvironment, "Terminate");
        }
        finally {
            setDeleting(false);
            setDeleteOpen(false);
        }

    }

    if (!detail) {
        return <p className="empty-state">Loading environment detail...</p>;
    }

    if (detail.error) {

        return (
            <div className="card">
                <p className="error-message">Unable to load this environment.</p>
                <p className="field-hint">{detail.error}</p>
                <button type="button" className="btn btn-secondary" onClick={load}>Retry</button>
            </div>
        );

    }

    const env = detail.environment;

    const relationships = [
        detail.loadBalancerName && { kind: "Load Balancer", label: detail.loadBalancerName },
        detail.autoScalingGroupName && { kind: "Auto Scaling Group", label: detail.autoScalingGroupName },
        { kind: "Elastic Beanstalk Environment", label: env?.environmentName }
    ].filter(Boolean);

    return (

        <>

            <CloudServiceBreadcrumbs items={[{ label: "Elastic Beanstalk", onClick: onBack }, { label: env?.environmentName }]} />

            <div className="card cloud-service-detail-page-header">

                <div className="cloud-service-detail-page-header-main">

                    <div>
                        <h1 style={{ margin: "2px 0" }}>{env?.environmentName}</h1>
                        <p className="field-hint" style={{ margin: 0 }}>{env?.applicationName}</p>
                        <div style={{ marginTop: "8px" }}>
                            <StateBadge state={env?.status} />
                            {env?.health && <span style={{ marginLeft: "8px" }} className="field-hint">Health: {env.health}</span>}
                        </div>
                    </div>

                </div>

                <div className="cloud-service-detail-page-header-actions">

                    {actioning ? (
                        <span className="field-hint">Working...</span>
                    ) : (
                        <>
                            <button type="button" className="btn btn-secondary" onClick={() => runAction(restartEbAppServer, "Restart")}>Restart</button>
                            <button type="button" className="btn btn-secondary" onClick={() => setRebuildOpen(true)}>Rebuild</button>
                            <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>Delete</button>
                        </>
                    )}

                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Overview</h3>

                <div className="cloud-service-connection-grid">
                    <div><p className="field-hint" style={{ margin: 0 }}>Running Version</p><p>{env?.versionLabel || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Platform</p><p className="smoke-test-metric-mono">{env?.platformArn?.split("/").pop() || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Tier</p><p>{env?.tier || "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>URL</p><p>{env?.url ? <a href={`http://${env.url}`} target="_blank" rel="noreferrer">{env.url}</a> : "—"}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Instances</p><p>{detail.instanceIds?.length ?? 0}</p></div>
                    <div><p className="field-hint" style={{ margin: 0 }}>Last Updated</p><p>{env?.dateUpdated ? new Date(env.dateUpdated).toLocaleString() : "—"}</p></div>
                </div>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Application Versions</h3>

                {!versions ? (
                    <p className="empty-state">Loading versions...</p>
                ) : versions.error ? (
                    <p className="error-message">{versions.error}</p>
                ) : versions.versions.length === 0 ? (
                    <p className="empty-state" style={{ textAlign: "left" }}>No application versions found.</p>
                ) : (

                    <div className="table-scroll">

                        <table className="table">

                            <thead>
                                <tr>
                                    <th>Version</th>
                                    <th>Created</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>

                            <tbody>

                                {versions.versions.map((v) => (

                                    <tr key={v.versionLabel}>
                                        <td className="smoke-test-metric-mono">{v.versionLabel}</td>
                                        <td>{v.dateCreated ? new Date(v.dateCreated).toLocaleString() : "—"}</td>
                                        <td>{v.status || "—"}</td>
                                        <td>
                                            {v.versionLabel === env?.versionLabel ? (
                                                <span className="badge badge-success">Current</span>
                                            ) : (
                                                <button type="button" className="btn btn-sm btn-primary" onClick={() => setDeployTarget(v)}>Deploy</button>
                                            )}
                                        </td>
                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                )}

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Scaling</h3>

                <div className="button-row">
                    {QUICK_COUNTS.map((n) => (
                        <button key={n} type="button" className={`btn btn-sm ${minSize === String(n) ? "btn-primary" : "btn-secondary"}`} onClick={() => setMinSize(String(n))}>
                            Min {n}
                        </button>
                    ))}
                </div>

                <div className="cloud-service-firewall-form-grid">

                    <div className="form-group">
                        <label>Minimum Instances</label>
                        <input type="number" min="0" className="form-control" value={minSize} onChange={(e) => setMinSize(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label>Maximum Instances</label>
                        <input type="number" min="1" className="form-control" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} />
                    </div>

                </div>

                <button type="button" className="btn btn-primary btn-sm" onClick={handleScale} disabled={scaling}>
                    {scaling ? "Applying..." : "Apply"}
                </button>

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Environment Variables</h3>

                {detail.environmentVariables?.length === 0 ? (

                    <p className="empty-state" style={{ textAlign: "left" }}>No environment variables configured.</p>

                ) : (

                    <ul className="cloud-service-detail-list">
                        {detail.environmentVariables?.map((v) => (
                            <li key={v.name}>
                                <span className="smoke-test-metric-mono">{v.name}</span> = {v.isSecret ? "********" : v.value}
                                <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: "10px" }} onClick={() => setRemoveVarTarget(v.name)}>
                                    Delete
                                </button>
                            </li>
                        ))}
                    </ul>

                )}

                <h4 className="settings-subhead" style={{ marginTop: "16px" }}>Add / Update Variable</h4>

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
                        {savingVar ? "Saving..." : "Save Variable"}
                    </button>

                </form>

                <p className="field-hint" style={{ marginTop: "10px" }}>
                    Existing secret-looking values (names containing SECRET/PASSWORD/TOKEN/KEY/CREDENTIAL)
                    are never shown - saving here replaces the value outright, it doesn't require re-entering
                    the old one.
                </p>

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
                                <LineChart points={series.points} unit="%" />
                            </div>
                        ))}
                    </div>

                )}

            </div>

            <div className="card">

                <h3 className="settings-subhead" style={{ marginTop: 0 }}>Events</h3>

                {!events ? (
                    <p className="empty-state">Loading events...</p>
                ) : events.events.length === 0 ? (
                    <p className="empty-state" style={{ textAlign: "left" }}>No recent events.</p>
                ) : (
                    <ul className="cloud-service-detail-list">
                        {events.events.map((e, index) => (
                            <li key={index}>
                                <span className="field-hint">{e.eventDate ? new Date(e.eventDate).toLocaleString() : "—"}</span> — [{e.severity}] {e.message}
                            </li>
                        ))}
                    </ul>
                )}

            </div>

            <RelationshipDiagram items={relationships} />

            <TypedConfirmDialog
                open={deleteOpen}
                title="Terminate environment?"
                message={<>This permanently deletes <strong>{environmentName}</strong>. This cannot be undone.</>}
                resourceName={`DELETE ${environmentName}`}
                confirmLabel="Delete"
                loading={deleting}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteOpen(false)}
            />

            <ConfirmDialog
                open={!!deployTarget}
                title="Deploy this version?"
                message={deployTarget ? (
                    <>Environment: <strong>{environmentName}</strong><br />
                    Current: <strong>{env?.versionLabel || "—"}</strong><br />
                    New: <strong>{deployTarget.versionLabel}</strong></>
                ) : ""}
                confirmLabel={deploying ? "Deploying..." : "Deploy"}
                onConfirm={handleDeployConfirm}
                onCancel={() => setDeployTarget(null)}
            />

            <ConfirmDialog
                open={rebuildOpen}
                title="Rebuild this environment?"
                message="Every resource in this environment will be terminated and recreated from scratch. This takes several minutes and briefly interrupts availability."
                confirmLabel={rebuilding ? "Rebuilding..." : "Rebuild"}
                danger
                onConfirm={handleRebuildConfirm}
                onCancel={() => setRebuildOpen(false)}
            />

            <ConfirmDialog
                open={!!removeVarTarget}
                title="Remove this variable?"
                message={removeVarTarget ? `This removes ${removeVarTarget} from the environment.` : ""}
                confirmLabel={removingVar ? "Removing..." : "Remove"}
                danger
                onConfirm={handleRemoveVariableConfirm}
                onCancel={() => setRemoveVarTarget(null)}
            />

        </>

    );

}

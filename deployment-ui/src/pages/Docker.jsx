import { Fragment, useState } from "react";

import usePolling from "../hooks/usePolling";
import useToast from "../hooks/useToast";
import useConfirm from "../hooks/useConfirm";
import LoadingSpinner from "../components/LoadingSpinner";
import PageLayout from "../components/layout/PageLayout";
import CopyButton from "../components/common/CopyButton";
import SectionTabs from "../components/common/SectionTabs";

import {
    getContainers,
    createContainer,
    stopContainer,
    restartContainer,
    removeContainer,
    getContainerLogs,
    getImages,
    removeImage,
    getVolumes,
    createVolume,
    removeVolume,
    getNetworks,
    createNetwork,
    removeNetwork
} from "../services/dockerService";

const SECTIONS = [
    { key: "containers", label: "Containers" },
    { key: "images", label: "Images" },
    { key: "volumes", label: "Volumes" },
    { key: "networks", label: "Networks" }
];

// Comma-separated free text is how this app already asks for a handful of
// short repeatable values (e.g. the admin allowlist in Settings) rather
// than a dynamic add/remove row UI — keeps the create-container form to a
// handful of fields instead of a small form builder.
function splitList(text) {
    return text
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
}

export default function Docker() {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [section, setSection] = useState("containers");
    const [accessDenied, setAccessDenied] = useState(false);
    const [loading, setLoading] = useState(true);

    const [containers, setContainers] = useState([]);
    const [images, setImages] = useState([]);
    const [volumes, setVolumes] = useState([]);
    const [networks, setNetworks] = useState([]);

    const [actingId, setActingId] = useState(null);
    const [logs, setLogs] = useState({ id: null, text: "" });
    const [loadingLogs, setLoadingLogs] = useState(false);

    const [showCreateContainer, setShowCreateContainer] = useState(false);
    const [creatingContainer, setCreatingContainer] = useState(false);
    const [containerForm, setContainerForm] = useState({
        image: "",
        name: "",
        ports: "",
        env: "",
        volumes: "",
        network: "",
        restart: true
    });

    const [showCreateVolume, setShowCreateVolume] = useState(false);
    const [newVolumeName, setNewVolumeName] = useState("");
    const [showCreateNetwork, setShowCreateNetwork] = useState(false);
    const [newNetworkName, setNewNetworkName] = useState("");
    const [newNetworkDriver, setNewNetworkDriver] = useState("bridge");

    function handleAccessError(err) {

        if (err.response?.status === 403) {
            setAccessDenied(true);
            return true;
        }

        return false;

    }

    async function loadContainers() {

        try {

            const response = await getContainers();
            setContainers(Array.isArray(response.data) ? response.data : []);
            setAccessDenied(false);

        }
        catch (err) {

            console.error(err);
            if (!handleAccessError(err)) toast.show("Unable to load containers.", "error");

        }
        finally {

            setLoading(false);

        }

    }

    async function loadImages() {

        try {

            setLoading(true);
            const response = await getImages();
            setImages(Array.isArray(response.data) ? response.data : []);
            setAccessDenied(false);

        }
        catch (err) {

            console.error(err);
            if (!handleAccessError(err)) toast.show("Unable to load images.", "error");

        }
        finally {

            setLoading(false);

        }

    }

    async function loadVolumes() {

        try {

            setLoading(true);
            const response = await getVolumes();
            setVolumes(Array.isArray(response.data) ? response.data : []);
            setAccessDenied(false);

        }
        catch (err) {

            console.error(err);
            if (!handleAccessError(err)) toast.show("Unable to load volumes.", "error");

        }
        finally {

            setLoading(false);

        }

    }

    async function loadNetworks() {

        try {

            setLoading(true);
            const response = await getNetworks();
            setNetworks(Array.isArray(response.data) ? response.data : []);
            setAccessDenied(false);

        }
        catch (err) {

            console.error(err);
            if (!handleAccessError(err)) toast.show("Unable to load networks.", "error");

        }
        finally {

            setLoading(false);

        }

    }

    // Containers auto-refresh like the reference dashboard this feature is
    // based on; the other sections only reload on demand (switching to
    // them, or after an action), since they change far less often.
    usePolling(loadContainers, 15000);

    function switchSection(next) {

        setSection(next);
        setLogs({ id: null, text: "" });

        if (next === "images") loadImages();
        else if (next === "volumes") loadVolumes();
        else if (next === "networks") loadNetworks();

    }

    async function handleStop(id) {

        try {

            setActingId(id);
            await stopContainer(id);
            toast.show("Container stopped.", "success");
            loadContainers();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to stop container.", "error");

        }
        finally {

            setActingId(null);

        }

    }

    async function handleRestart(id) {

        try {

            setActingId(id);
            await restartContainer(id);
            toast.show("Container restarted.", "success");
            loadContainers();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to restart container.", "error");

        }
        finally {

            setActingId(null);

        }

    }

    async function handleRemoveContainer(id, name) {

        if (!(await confirm({
            title: "Remove container?",
            message: `Remove '${name}'? This stops and deletes it — it cannot be undone.`,
            confirmLabel: "Remove",
            danger: true
        }))) {
            return;
        }

        try {

            setActingId(id);
            await removeContainer(id);
            toast.show(`Removed '${name}'.`, "success");
            loadContainers();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to remove container.", "error");

        }
        finally {

            setActingId(null);

        }

    }

    async function toggleLogs(id) {

        if (logs.id === id) {
            setLogs({ id: null, text: "" });
            return;
        }

        try {

            setLoadingLogs(true);
            setLogs({ id, text: "" });

            const response = await getContainerLogs(id);
            setLogs({ id, text: response.data || "(no output)" });

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to load logs.", "error");
            setLogs({ id: null, text: "" });

        }
        finally {

            setLoadingLogs(false);

        }

    }

    async function handleCreateContainer(e) {

        e.preventDefault();

        if (!containerForm.image.trim()) {
            toast.show("An image is required.", "error");
            return;
        }

        try {

            setCreatingContainer(true);

            await createContainer({
                image: containerForm.image.trim(),
                name: containerForm.name.trim(),
                ports: splitList(containerForm.ports),
                env: splitList(containerForm.env),
                volumes: splitList(containerForm.volumes),
                network: containerForm.network || null,
                restartUnlessStopped: containerForm.restart
            });

            toast.show(`Container created from ${containerForm.image}.`, "success");
            setContainerForm({ image: "", name: "", ports: "", env: "", volumes: "", network: "", restart: true });
            setShowCreateContainer(false);
            loadContainers();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to create container.", "error");

        }
        finally {

            setCreatingContainer(false);

        }

    }

    async function handleRemoveImage(id, tag) {

        if (!(await confirm({
            title: "Remove image?",
            message: `Remove '${tag || id.slice(0, 12)}'? This cannot be undone.`,
            confirmLabel: "Remove",
            danger: true
        }))) {
            return;
        }

        try {

            setActingId(id);
            await removeImage(id);
            toast.show("Image removed.", "success");
            loadImages();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to remove image — it may still be in use by a container.", "error");

        }
        finally {

            setActingId(null);

        }

    }

    async function handleCreateVolume(e) {

        e.preventDefault();

        if (!newVolumeName.trim()) return;

        try {

            await createVolume(newVolumeName.trim());
            toast.show(`Volume '${newVolumeName.trim()}' created.`, "success");
            setNewVolumeName("");
            setShowCreateVolume(false);
            loadVolumes();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to create volume.", "error");

        }

    }

    async function handleRemoveVolume(name) {

        if (!(await confirm({
            title: "Remove volume?",
            message: `Remove volume '${name}'? Any data in it is lost.`,
            confirmLabel: "Remove",
            danger: true
        }))) {
            return;
        }

        try {

            setActingId(name);
            await removeVolume(name);
            toast.show("Volume removed.", "success");
            loadVolumes();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to remove volume — it may still be in use.", "error");

        }
        finally {

            setActingId(null);

        }

    }

    async function handleCreateNetwork(e) {

        e.preventDefault();

        if (!newNetworkName.trim()) return;

        try {

            await createNetwork(newNetworkName.trim(), newNetworkDriver);
            toast.show(`Network '${newNetworkName.trim()}' created.`, "success");
            setNewNetworkName("");
            setShowCreateNetwork(false);
            loadNetworks();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to create network.", "error");

        }

    }

    async function handleRemoveNetwork(id, name) {

        if (!(await confirm({
            title: "Remove network?",
            message: `Remove network '${name}'? Containers attached to it will lose that connection.`,
            confirmLabel: "Remove",
            danger: true
        }))) {
            return;
        }

        try {

            setActingId(id);
            await removeNetwork(id);
            toast.show("Network removed.", "success");
            loadNetworks();

        }
        catch (err) {

            console.error(err);
            toast.show(err.response?.data?.message || "Failed to remove network.", "error");

        }
        finally {

            setActingId(null);

        }

    }

    if (loading && section === "containers") {
        return <LoadingSpinner />;
    }

    return (

        <PageLayout title="Docker">

            {dialog}

            {accessDenied ? (

                <div className="card">

                    <h2 className="card-title">Docker</h2>

                    <div className="error-message">
                        Admin login required to view or manage Docker containers, images,
                        volumes, and networks on this host.
                    </div>

                </div>

            ) : (

                <>

                <div className="card">

                    <SectionTabs sections={SECTIONS} active={section} onSelect={switchSection} />

                    {section === "containers" && (

                        <>

                        <div className="access-panel-header">
                            <h2 className="card-title">Containers</h2>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowCreateContainer((v) => !v)}
                            >
                                {showCreateContainer ? "Cancel" : "+ New Container"}
                            </button>
                        </div>

                        {showCreateContainer && (

                            <form className="card" style={{ marginBottom: 20 }} onSubmit={handleCreateContainer}>

                                <div className="form-group">
                                    <label>Image</label>
                                    <input
                                        className="form-control"
                                        placeholder="ghcr.io/varshithchand/deployment-portal-api:latest"
                                        value={containerForm.image}
                                        onChange={(e) => setContainerForm({ ...containerForm, image: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Container name (optional)</label>
                                    <input
                                        className="form-control"
                                        value={containerForm.name}
                                        onChange={(e) => setContainerForm({ ...containerForm, name: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Ports (host:container, comma-separated)</label>
                                    <input
                                        className="form-control"
                                        placeholder="8090:8080"
                                        value={containerForm.ports}
                                        onChange={(e) => setContainerForm({ ...containerForm, ports: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Environment variables (KEY=value, comma-separated)</label>
                                    <input
                                        className="form-control"
                                        placeholder="ASPNETCORE_ENVIRONMENT=Production"
                                        value={containerForm.env}
                                        onChange={(e) => setContainerForm({ ...containerForm, env: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Volumes (name-or-path:/container/path, comma-separated)</label>
                                    <input
                                        className="form-control"
                                        value={containerForm.volumes}
                                        onChange={(e) => setContainerForm({ ...containerForm, volumes: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Network</label>
                                    <select
                                        className="form-control"
                                        value={containerForm.network}
                                        onChange={(e) => setContainerForm({ ...containerForm, network: e.target.value })}
                                    >
                                        <option value="">Default</option>
                                        {networks.map((n) => (
                                            <option key={n.id} value={n.name}>{n.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="access-restrict-checkbox" style={{ marginBottom: 15 }}>
                                    <input
                                        type="checkbox"
                                        id="docker-restart-policy"
                                        checked={containerForm.restart}
                                        onChange={(e) => setContainerForm({ ...containerForm, restart: e.target.checked })}
                                    />
                                    <label htmlFor="docker-restart-policy">Restart unless stopped</label>
                                </div>

                                <button type="submit" className="btn btn-primary" disabled={creatingContainer}>
                                    {creatingContainer ? "Creating..." : "Create Container"}
                                </button>

                            </form>

                        )}

                        {containers.length === 0 ? (

                            <p className="empty-state">No containers found on this host.</p>

                        ) : (

                            <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Image</th>
                                        <th>Status</th>
                                        <th>Ports</th>
                                        <th>Created</th>
                                        <th></th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {containers.map((c) => (

                                        <Fragment key={c.id}>

                                        <tr>
                                            <td>
                                                {c.name}
                                                <CopyButton value={c.id} label="Copy container ID" />
                                            </td>
                                            <td>{c.image}</td>
                                            <td>
                                                <span className={`badge ${c.state === "running" ? "badge-success" : "badge-secondary"}`}>
                                                    {c.status}
                                                </span>
                                            </td>
                                            <td>{c.ports.join(", ") || "—"}</td>
                                            <td>{new Date(c.createdAt).toLocaleString()}</td>
                                            <td>

                                                <div className="button-row">

                                                    {c.state === "running" ? (
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => handleStop(c.id)}
                                                            disabled={actingId === c.id}
                                                        >
                                                            Stop
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => handleRestart(c.id)}
                                                            disabled={actingId === c.id}
                                                        >
                                                            Start
                                                        </button>
                                                    )}

                                                    {c.state === "running" && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => handleRestart(c.id)}
                                                            disabled={actingId === c.id}
                                                        >
                                                            Restart
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => toggleLogs(c.id)}
                                                    >
                                                        {logs.id === c.id ? "Hide Logs" : "Logs"}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleRemoveContainer(c.id, c.name)}
                                                        disabled={actingId === c.id}
                                                    >
                                                        Remove
                                                    </button>

                                                </div>

                                            </td>
                                        </tr>

                                        {logs.id === c.id && (

                                            <tr>
                                                <td colSpan={6}>
                                                    <pre className="docker-logs">
                                                        {loadingLogs ? "Loading..." : logs.text}
                                                    </pre>
                                                </td>
                                            </tr>

                                        )}

                                        </Fragment>

                                    ))}

                                </tbody>

                            </table>

                            </div>

                        )}

                        </>

                    )}

                    {section === "images" && (

                        <>

                        <h2 className="card-title">Images</h2>

                        {images.length === 0 ? (

                            <p className="empty-state">No images found on this host.</p>

                        ) : (

                            <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Tags</th>
                                        <th>Size</th>
                                        <th>Created</th>
                                        <th></th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {images.map((img) => (

                                        <tr key={img.id}>
                                            <td>
                                                {img.tags.length > 0 ? img.tags.join(", ") : <em>untagged</em>}
                                                <CopyButton value={img.id} label="Copy image ID" />
                                            </td>
                                            <td>{(img.sizeBytes / (1024 * 1024)).toFixed(1)} MB</td>
                                            <td>{new Date(img.createdAt).toLocaleString()}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleRemoveImage(img.id, img.tags[0])}
                                                    disabled={actingId === img.id}
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                            </div>

                        )}

                        </>

                    )}

                    {section === "volumes" && (

                        <>

                        <div className="access-panel-header">
                            <h2 className="card-title">Volumes</h2>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowCreateVolume((v) => !v)}
                            >
                                {showCreateVolume ? "Cancel" : "+ New Volume"}
                            </button>
                        </div>

                        {showCreateVolume && (

                            <form className="form-group" style={{ display: "flex", gap: 10 }} onSubmit={handleCreateVolume}>
                                <input
                                    className="form-control"
                                    placeholder="volume-name"
                                    value={newVolumeName}
                                    onChange={(e) => setNewVolumeName(e.target.value)}
                                />
                                <button type="submit" className="btn btn-primary">Create</button>
                            </form>

                        )}

                        {volumes.length === 0 ? (

                            <p className="empty-state">No volumes found on this host.</p>

                        ) : (

                            <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Driver</th>
                                        <th>Mountpoint</th>
                                        <th></th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {volumes.map((v) => (

                                        <tr key={v.name}>
                                            <td>{v.name}</td>
                                            <td>{v.driver}</td>
                                            <td className="commit-sha">{v.mountpoint}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleRemoveVolume(v.name)}
                                                    disabled={actingId === v.name}
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                            </div>

                        )}

                        </>

                    )}

                    {section === "networks" && (

                        <>

                        <div className="access-panel-header">
                            <h2 className="card-title">Networks</h2>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowCreateNetwork((v) => !v)}
                            >
                                {showCreateNetwork ? "Cancel" : "+ New Network"}
                            </button>
                        </div>

                        {showCreateNetwork && (

                            <form className="form-group" style={{ display: "flex", gap: 10 }} onSubmit={handleCreateNetwork}>
                                <input
                                    className="form-control"
                                    placeholder="network-name"
                                    value={newNetworkName}
                                    onChange={(e) => setNewNetworkName(e.target.value)}
                                />
                                <select
                                    className="form-control"
                                    style={{ maxWidth: 160 }}
                                    value={newNetworkDriver}
                                    onChange={(e) => setNewNetworkDriver(e.target.value)}
                                >
                                    <option value="bridge">bridge</option>
                                    <option value="overlay">overlay</option>
                                    <option value="host">host</option>
                                </select>
                                <button type="submit" className="btn btn-primary">Create</button>
                            </form>

                        )}

                        {networks.length === 0 ? (

                            <p className="empty-state">No networks found on this host.</p>

                        ) : (

                            <div className="table-scroll">

                            <table className="table">

                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Driver</th>
                                        <th>Scope</th>
                                        <th></th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {networks.map((n) => (

                                        <tr key={n.id}>
                                            <td>{n.name}</td>
                                            <td>{n.driver}</td>
                                            <td>{n.scope}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleRemoveNetwork(n.id, n.name)}
                                                    disabled={actingId === n.id}
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                            </div>

                        )}

                        </>

                    )}

                </div>

                </>

            )}

        </PageLayout>

    );

}

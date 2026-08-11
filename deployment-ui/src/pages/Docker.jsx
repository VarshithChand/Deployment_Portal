import { useState } from "react";

import usePolling from "../hooks/usePolling";
import useToast from "../hooks/useToast";
import useConfirm from "../hooks/useConfirm";
import LoadingSpinner from "../components/LoadingSpinner";
import PageLayout from "../components/layout/PageLayout";
import PageAdminAccessButton from "../components/common/PageAdminAccessButton";
import SectionTabs from "../components/common/SectionTabs";
import ContainersSection from "../components/docker/ContainersSection";
import ImagesSection from "../components/docker/ImagesSection";
import VolumesSection from "../components/docker/VolumesSection";
import NetworksSection from "../components/docker/NetworksSection";

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

        <PageLayout title="Docker" actions={<PageAdminAccessButton pageKey="docker" pageLabel="Docker" />}>

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

                <div className="card">

                    <SectionTabs sections={SECTIONS} active={section} onSelect={switchSection} />

                    {section === "containers" && (

                        <ContainersSection
                            containers={containers}
                            networks={networks}
                            showCreateContainer={showCreateContainer}
                            setShowCreateContainer={setShowCreateContainer}
                            containerForm={containerForm}
                            setContainerForm={setContainerForm}
                            creatingContainer={creatingContainer}
                            handleCreateContainer={handleCreateContainer}
                            actingId={actingId}
                            logs={logs}
                            loadingLogs={loadingLogs}
                            handleStop={handleStop}
                            handleRestart={handleRestart}
                            toggleLogs={toggleLogs}
                            handleRemoveContainer={handleRemoveContainer}
                        />

                    )}

                    {section === "images" && (

                        <ImagesSection
                            images={images}
                            actingId={actingId}
                            handleRemoveImage={handleRemoveImage}
                        />

                    )}

                    {section === "volumes" && (

                        <VolumesSection
                            volumes={volumes}
                            showCreateVolume={showCreateVolume}
                            setShowCreateVolume={setShowCreateVolume}
                            newVolumeName={newVolumeName}
                            setNewVolumeName={setNewVolumeName}
                            handleCreateVolume={handleCreateVolume}
                            actingId={actingId}
                            handleRemoveVolume={handleRemoveVolume}
                        />

                    )}

                    {section === "networks" && (

                        <NetworksSection
                            networks={networks}
                            showCreateNetwork={showCreateNetwork}
                            setShowCreateNetwork={setShowCreateNetwork}
                            newNetworkName={newNetworkName}
                            setNewNetworkName={setNewNetworkName}
                            newNetworkDriver={newNetworkDriver}
                            setNewNetworkDriver={setNewNetworkDriver}
                            handleCreateNetwork={handleCreateNetwork}
                            actingId={actingId}
                            handleRemoveNetwork={handleRemoveNetwork}
                        />

                    )}

                </div>

            )}

        </PageLayout>

    );

}
